"""
Claude API 客户端
通过 Anthropic Claude Messages API 转发请求
"""

import asyncio
import copy
import json
import time
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from fastapi import Response

from config import get_claude_api_url
from log import log
from src.api.utils import (
    get_retry_config,
    handle_error_with_retry,
    record_api_call_error,
    record_api_call_success,
)
from src.credential_manager import credential_manager
from src.httpx_client import http_client, post_async
from src.utils import CLAUDE_USER_AGENT

MODE = "claude"
ANTHROPIC_VERSION = "2023-06-01"


def _extract_claude_creds(credential_data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    从凭证数据中提取 Claude 凭证信息

    Returns:
        (api_key, access_token)
    """
    api_key = credential_data.get("api_key") or credential_data.get("x_api_key")
    access_token = credential_data.get("access_token") or credential_data.get("token")
    return api_key, access_token


def _pop_claude_betas(body: Dict[str, Any]) -> List[str]:
    """从请求体中弹出 betas 字段并规范化为列表"""
    raw_betas = body.pop("betas", None)
    if raw_betas is None:
        return []
    if isinstance(raw_betas, str):
        return [raw_betas.strip()] if raw_betas.strip() else []
    if isinstance(raw_betas, list):
        result: List[str] = []
        for item in raw_betas:
            if isinstance(item, str):
                value = item.strip()
                if value and value not in result:
                    result.append(value)
        return result
    return []


def build_claude_headers(
    *,
    access_token: Optional[str] = None,
    api_key: Optional[str] = None,
    is_stream: bool = True,
    betas: Optional[List[str]] = None,
) -> Dict[str, str]:
    """构建 Claude API 请求头"""
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if is_stream else "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
        "User-Agent": CLAUDE_USER_AGENT,
    }

    if api_key:
        headers["x-api-key"] = api_key
    elif access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    normalized_betas: List[str] = []
    for beta in betas or []:
        value = str(beta).strip()
        if value and value not in normalized_betas:
            normalized_betas.append(value)
    if normalized_betas:
        headers["anthropic-beta"] = ",".join(normalized_betas)

    return headers


def _clone_body(body: Dict[str, Any]) -> Dict[str, Any]:
    """为重试创建独立请求体副本"""
    return copy.deepcopy(body)


def _tool_choice_forces_tool_use(tool_choice: Any) -> bool:
    """判断 tool_choice 是否强制模型调用工具"""
    if isinstance(tool_choice, dict):
        return tool_choice.get("type") in {"any", "tool"}
    if isinstance(tool_choice, str):
        return tool_choice in {"any", "tool", "required"}
    return False


def _normalize_claude_request_body(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    规范化 Claude 请求体。

    Anthropic 在 forced tool_choice 下不接受 thinking。
    这里对齐参考实现，发送前禁用 thinking，并移除 output_config.effort。
    """
    tool_choice = body.get("tool_choice")
    if not _tool_choice_forces_tool_use(tool_choice):
        return body

    thinking = body.get("thinking")
    if isinstance(thinking, dict):
        body["thinking"] = {"type": "disabled"}

    output_config = body.get("output_config")
    if isinstance(output_config, dict) and "effort" in output_config:
        output_config = dict(output_config)
        output_config.pop("effort", None)
        if output_config:
            body["output_config"] = output_config
        else:
            body.pop("output_config", None)

    return body


def _build_error_response(error_text: str, status_code: int) -> Response:
    try:
        payload = json.loads(error_text)
    except Exception:
        payload = {
            "error": {
                "type": "api_error",
                "message": error_text or "Upstream Claude request failed",
            }
        }
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        status_code=status_code,
        media_type="application/json",
    )


def _get_retry_after_cooldown(error_text: str, response_headers: Dict[str, str]) -> Optional[float]:
    """解析 Claude 429/503 错误中的重试时间"""
    retry_after = response_headers.get("retry-after")
    if retry_after:
        try:
            return time.time() + float(retry_after)
        except (TypeError, ValueError):
            pass

    try:
        data = json.loads(error_text)
        error = data.get("error", {})
        retry_after = error.get("retry_after") or error.get("retry_after_seconds")
        if retry_after is not None:
            return time.time() + float(retry_after)
    except Exception:
        pass

    return None


async def _prepare_request(
    body: Dict[str, Any],
    *,
    is_stream: bool,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Tuple[Optional[str], Optional[str], Optional[str], Dict[str, Any], Dict[str, str]]:
    """准备一次 Claude 请求"""
    model_name = body.get("model", "")
    result = await credential_manager.get_valid_credential(mode=MODE, model_name=model_name)
    if not result:
        return None, None, None, {}, {}

    credential_name, credential_data = result
    api_key, access_token = _extract_claude_creds(credential_data)
    if not api_key and not access_token:
        return credential_name, None, None, {}, {}

    request_body = _clone_body(body)
    if is_stream:
        request_body["stream"] = True
    request_body = _normalize_claude_request_body(request_body)
    betas = _pop_claude_betas(request_body)
    request_headers = build_claude_headers(
        access_token=access_token,
        api_key=api_key,
        is_stream=is_stream,
        betas=betas,
    )
    if extra_headers:
        request_headers.update(extra_headers)

    return credential_name, api_key, access_token, request_body, request_headers


async def stream_request(
    body: Dict[str, Any],
    native: bool = False,
    headers: Optional[Dict[str, str]] = None,
) -> AsyncGenerator:
    """
    Claude 流式请求

    Yields:
        str 或 bytes，错误时返回 Response
    """
    retry_config = await get_retry_config()
    retry_enabled = retry_config["retry_enabled"]
    max_retries = retry_config["max_retries"]
    retry_interval = retry_config["retry_interval"]

    model_name = body.get("model", "")
    claude_api_url = await get_claude_api_url()
    target_url = f"{claude_api_url.rstrip('/')}/v1/messages"

    for attempt in range(max_retries + 1):
        credential_name = None
        try:
            credential_name, api_key, access_token, request_body, request_headers = (
                await _prepare_request(body, is_stream=True, extra_headers=headers)
            )

            if not credential_name:
                error_resp = {
                    "error": {
                        "message": "No available credentials",
                        "type": "api_error",
                    }
                }
                yield Response(
                    content=json.dumps(error_resp, ensure_ascii=False),
                    status_code=503,
                    media_type="application/json",
                )
                return

            if not api_key and not access_token:
                log.error(f"[CLAUDE] 凭证 {credential_name} 缺少 access_token/api_key")
                continue

            log.info(
                f"[CLAUDE] 流式请求: model={model_name}, credential={credential_name}, "
                f"url={target_url}, attempt={attempt + 1}/{max_retries + 1}"
            )

            has_data = False
            async with http_client.get_streaming_client() as client:
                async with client.stream(
                    "POST", target_url, json=request_body, headers=request_headers
                ) as response:
                    if response.status_code != 200:
                        error_bytes = await response.aread()
                        error_text = error_bytes.decode("utf-8", errors="ignore")
                        cooldown_until = None
                        if response.status_code in (429, 503):
                            cooldown_until = _get_retry_after_cooldown(
                                error_text, dict(response.headers)
                            )

                        await record_api_call_error(
                            credential_manager,
                            credential_name,
                            response.status_code,
                            cooldown_until=cooldown_until,
                            mode=MODE,
                            model_name=model_name,
                            error_message=error_text,
                        )

                        should_retry = await handle_error_with_retry(
                            credential_manager,
                            response.status_code,
                            credential_name,
                            retry_enabled,
                            attempt,
                            max_retries,
                            retry_interval,
                            mode=MODE,
                        )
                        if should_retry:
                            continue

                        yield _build_error_response(error_text, response.status_code)
                        return

                    if native:
                        async for chunk in response.aiter_bytes():
                            has_data = True
                            yield chunk
                    else:
                        async for line in response.aiter_lines():
                            has_data = True
                            yield line

            if has_data:
                await record_api_call_success(
                    credential_manager,
                    credential_name,
                    mode=MODE,
                    model_name=model_name,
                )
                return

        except Exception as e:
            log.error(
                f"[CLAUDE] 流式请求异常: {e}, attempt={attempt + 1}/{max_retries + 1}"
            )
            if credential_name:
                await record_api_call_error(
                    credential_manager,
                    credential_name,
                    500,
                    mode=MODE,
                    model_name=model_name,
                    error_message=str(e),
                )
            if attempt < max_retries:
                await asyncio.sleep(retry_interval)
                continue
            yield _build_error_response(str(e), 500)
            return

    yield _build_error_response("Max retries exceeded", 503)


async def _non_stream_request_to_endpoint(
    *,
    body: Dict[str, Any],
    endpoint: str,
    headers: Optional[Dict[str, str]] = None,
) -> Response:
    retry_config = await get_retry_config()
    retry_enabled = retry_config["retry_enabled"]
    max_retries = retry_config["max_retries"]
    retry_interval = retry_config["retry_interval"]

    model_name = body.get("model", "")
    claude_api_url = await get_claude_api_url()
    target_url = f"{claude_api_url.rstrip('/')}{endpoint}"

    for attempt in range(max_retries + 1):
        credential_name = None
        try:
            credential_name, api_key, access_token, request_body, request_headers = (
                await _prepare_request(body, is_stream=False, extra_headers=headers)
            )

            if not credential_name:
                return _build_error_response("No available credentials", 503)

            if not api_key and not access_token:
                log.error(f"[CLAUDE] 凭证 {credential_name} 缺少 access_token/api_key")
                continue

            log.info(
                f"[CLAUDE] 非流式请求: model={model_name}, credential={credential_name}, "
                f"url={target_url}, attempt={attempt + 1}/{max_retries + 1}"
            )

            response = await post_async(
                target_url,
                json=request_body,
                headers=request_headers,
                timeout=120.0,
            )

            if response.status_code == 200:
                await record_api_call_success(
                    credential_manager,
                    credential_name,
                    mode=MODE,
                    model_name=model_name,
                )
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    media_type=response.headers.get("content-type", "application/json"),
                )

            error_text = response.text if hasattr(response, "text") else ""
            cooldown_until = None
            if response.status_code in (429, 503):
                cooldown_until = _get_retry_after_cooldown(error_text, dict(response.headers))

            await record_api_call_error(
                credential_manager,
                credential_name,
                response.status_code,
                cooldown_until=cooldown_until,
                mode=MODE,
                model_name=model_name,
                error_message=error_text,
            )

            should_retry = await handle_error_with_retry(
                credential_manager,
                response.status_code,
                credential_name,
                retry_enabled,
                attempt,
                max_retries,
                retry_interval,
                mode=MODE,
            )
            if should_retry:
                continue

            return _build_error_response(error_text, response.status_code)

        except Exception as e:
            log.error(
                f"[CLAUDE] 非流式请求异常: {e}, attempt={attempt + 1}/{max_retries + 1}"
            )
            if credential_name:
                await record_api_call_error(
                    credential_manager,
                    credential_name,
                    500,
                    mode=MODE,
                    model_name=model_name,
                    error_message=str(e),
                )
            if attempt < max_retries:
                await asyncio.sleep(retry_interval)
                continue
            return _build_error_response(str(e), 500)

    return _build_error_response("Max retries exceeded", 503)


async def non_stream_request(
    body: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
) -> Response:
    """Claude 非流式消息请求"""
    return await _non_stream_request_to_endpoint(
        body=body,
        endpoint="/v1/messages",
        headers=headers,
    )


async def count_tokens_request(
    body: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
) -> Response:
    """Claude count_tokens 请求"""
    return await _non_stream_request_to_endpoint(
        body=body,
        endpoint="/v1/messages/count_tokens",
        headers=headers,
    )
