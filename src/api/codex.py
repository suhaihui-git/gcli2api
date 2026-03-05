"""
Codex API 客户端
参考 CLIProxyAPI 的 codex_executor.go 实现
"""

import asyncio
import json
import time
import uuid
from typing import Any, AsyncGenerator, Dict, Optional, Tuple

from fastapi import Response

from config import get_codex_api_url
from log import log
from src.api.utils import (
    get_retry_config,
    handle_error_with_retry,
    parse_and_log_cooldown,
    record_api_call_error,
    record_api_call_success,
)
from src.credential_manager import credential_manager
from src.httpx_client import http_client
from src.utils import CODEX_CLIENT_VERSION, CODEX_USER_AGENT

MODE = "codex"


def build_codex_headers(
    access_token: str,
    account_id: Optional[str] = None,
    is_stream: bool = True,
    is_oauth: bool = True,
) -> Dict[str, str]:
    """
    构建 Codex API 请求头

    Args:
        access_token: Bearer token
        account_id: ChatGPT account ID (OAuth only)
        is_stream: 是否流式请求
        is_oauth: 是否为 OAuth 凭证 (vs API key)

    Returns:
        请求头字典
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
        "Version": CODEX_CLIENT_VERSION,
        "Session_id": str(uuid.uuid4()),
        "User-Agent": CODEX_USER_AGENT,
        "Connection": "Keep-Alive",
    }

    if is_stream:
        headers["Accept"] = "text/event-stream"
    else:
        headers["Accept"] = "application/json"

    if is_oauth:
        headers["Originator"] = "codex_cli_rs"
        if account_id:
            headers["Chatgpt-Account-Id"] = account_id

    return headers


def _extract_codex_creds(credential_data: Dict[str, Any]) -> Tuple[str, Optional[str], bool]:
    """
    从凭证数据中提取 Codex 凭证信息

    Returns:
        (access_token, account_id, is_oauth)
    """
    access_token = credential_data.get("access_token") or credential_data.get("token", "")
    account_id = credential_data.get("account_id")
    # 如果有 refresh_token 或 id_token，认为是 OAuth 凭证
    is_oauth = bool(credential_data.get("refresh_token") or credential_data.get("id_token"))
    return access_token, account_id, is_oauth


async def stream_request(
    body: Dict[str, Any],
    native: bool = False,
    headers: Optional[Dict[str, str]] = None,
) -> AsyncGenerator:
    """
    Codex 流式请求

    Args:
        body: Codex Responses API 格式请求体 (包含 model, input, tools 等)
        native: 是否返回原始 bytes
        headers: 额外的请求头

    Yields:
        str 或 bytes: SSE 数据行
    """
    retry_config = await get_retry_config()
    retry_enabled = retry_config["retry_enabled"]
    max_retries = retry_config["max_retries"]
    retry_interval = retry_config["retry_interval"]

    model_name = body.get("model", "")
    codex_api_url = await get_codex_api_url()
    target_url = f"{codex_api_url.rstrip('/')}/responses"

    for attempt in range(max_retries + 1):
        credential_name = None
        try:
            # 获取凭证
            result = await credential_manager.get_valid_credential(
                mode=MODE, model_name=model_name
            )
            if not result:
                log.error(f"[CODEX] 没有可用的 Codex 凭证 (model={model_name})")
                error_resp = {
                    "error": {
                        "message": "No available Codex credentials",
                        "type": "server_error",
                        "code": "no_credentials",
                    }
                }
                yield Response(
                    content=json.dumps(error_resp),
                    status_code=503,
                    media_type="application/json",
                )
                return

            credential_name, credential_data = result
            access_token, account_id, is_oauth = _extract_codex_creds(credential_data)

            if not access_token:
                log.error(f"[CODEX] 凭证 {credential_name} 没有 access_token")
                continue

            # 构建请求头
            request_headers = build_codex_headers(
                access_token=access_token,
                account_id=account_id,
                is_stream=True,
                is_oauth=is_oauth,
            )
            if headers:
                request_headers.update(headers)

            # 确保 stream=true 并清理不支持的字段
            body["stream"] = True
            body.setdefault("instructions", "")
            body.pop("previous_response_id", None)
            body.pop("prompt_cache_retention", None)
            body.pop("safety_identifier", None)
            body.pop("context_management", None)
            # parallel_tool_calls 仅在有 tools 时才保留
            if not body.get("tools"):
                body.pop("parallel_tool_calls", None)

            log.info(
                f"[CODEX] 流式请求: model={model_name}, "
                f"credential={credential_name}, "
                f"url={target_url}, "
                f"attempt={attempt + 1}/{max_retries + 1}"
            )

            has_data = False
            async with http_client.get_streaming_client() as client:
                async with client.stream(
                    "POST", target_url, json=body, headers=request_headers
                ) as r:
                    if r.status_code != 200:
                        error_text = await r.aread()
                        error_str = error_text.decode("utf-8", errors="ignore")
                        log.warning(
                            f"[CODEX] 请求失败: status={r.status_code}, "
                            f"credential={credential_name}, "
                            f"error={error_str[:500]}"
                        )

                        # 处理 429 速率限制
                        cooldown_until = None
                        if r.status_code == 429:
                            cooldown_until = _parse_codex_rate_limit(error_str)

                        await record_api_call_error(
                            credential_manager,
                            credential_name,
                            r.status_code,
                            cooldown_until=cooldown_until,
                            mode=MODE,
                            model_name=model_name,
                        )

                        should_retry = await handle_error_with_retry(
                            credential_manager,
                            r.status_code,
                            credential_name,
                            retry_enabled,
                            attempt,
                            max_retries,
                            retry_interval,
                            mode=MODE,
                        )
                        if should_retry:
                            continue

                        # 不重试，返回错误
                        yield Response(
                            content=error_text,
                            status_code=r.status_code,
                            media_type="application/json",
                        )
                        return

                    # 成功，流式读取响应
                    if native:
                        async for chunk in r.aiter_bytes():
                            has_data = True
                            yield chunk
                    else:
                        async for line in r.aiter_lines():
                            has_data = True
                            yield line

            if has_data:
                # 记录成功
                await record_api_call_success(
                    credential_manager, credential_name, mode=MODE, model_name=model_name
                )
                return
            else:
                log.warning(f"[CODEX] 空响应: credential={credential_name}")
                if attempt < max_retries:
                    continue
                return

        except Exception as e:
            log.error(
                f"[CODEX] 流式请求异常: {e}, "
                f"credential={credential_name}, "
                f"attempt={attempt + 1}/{max_retries + 1}"
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_interval)
                continue
            raise


async def non_stream_request(
    body: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
) -> Response:
    """
    Codex 非流式请求

    Args:
        body: Codex Responses API 格式请求体
        headers: 额外的请求头

    Returns:
        Response 对象
    """
    retry_config = await get_retry_config()
    retry_enabled = retry_config["retry_enabled"]
    max_retries = retry_config["max_retries"]
    retry_interval = retry_config["retry_interval"]

    model_name = body.get("model", "")
    codex_api_url = await get_codex_api_url()
    target_url = f"{codex_api_url.rstrip('/')}/responses/compact"

    for attempt in range(max_retries + 1):
        credential_name = None
        try:
            result = await credential_manager.get_valid_credential(
                mode=MODE, model_name=model_name
            )
            if not result:
                log.error(f"[CODEX] 没有可用的 Codex 凭证 (model={model_name})")
                return Response(
                    content=json.dumps({
                        "error": {
                            "message": "No available Codex credentials",
                            "type": "server_error",
                            "code": "no_credentials",
                        }
                    }),
                    status_code=503,
                    media_type="application/json",
                )

            credential_name, credential_data = result
            access_token, account_id, is_oauth = _extract_codex_creds(credential_data)

            if not access_token:
                log.error(f"[CODEX] 凭证 {credential_name} 没有 access_token")
                continue

            request_headers = build_codex_headers(
                access_token=access_token,
                account_id=account_id,
                is_stream=False,
                is_oauth=is_oauth,
            )
            if headers:
                request_headers.update(headers)

            # compact 端点: 删除不支持的字段
            body.pop("stream", None)
            body.pop("store", None)
            body.setdefault("instructions", "")
            body.pop("previous_response_id", None)
            body.pop("prompt_cache_retention", None)
            body.pop("safety_identifier", None)
            body.pop("context_management", None)
            # parallel_tool_calls 仅在有 tools 时才保留
            if not body.get("tools"):
                body.pop("parallel_tool_calls", None)

            log.info(
                f"[CODEX] 非流式请求: model={model_name}, "
                f"credential={credential_name}, "
                f"attempt={attempt + 1}/{max_retries + 1}"
            )

            async with http_client.get_client(timeout=600.0) as client:
                r = await client.post(target_url, json=body, headers=request_headers)

                if r.status_code != 200:
                    error_text = r.text
                    log.warning(
                        f"[CODEX] 非流式请求失败: status={r.status_code}, "
                        f"error={error_text[:500]}"
                    )

                    cooldown_until = None
                    if r.status_code == 429:
                        cooldown_until = _parse_codex_rate_limit(error_text)

                    await record_api_call_error(
                        credential_manager,
                        credential_name,
                        r.status_code,
                        cooldown_until=cooldown_until,
                        mode=MODE,
                        model_name=model_name,
                    )

                    should_retry = await handle_error_with_retry(
                        credential_manager,
                        r.status_code,
                        credential_name,
                        retry_enabled,
                        attempt,
                        max_retries,
                        retry_interval,
                        mode=MODE,
                    )
                    if should_retry:
                        continue

                    return Response(
                        content=r.content,
                        status_code=r.status_code,
                        media_type="application/json",
                    )

                await record_api_call_success(
                    credential_manager, credential_name, mode=MODE, model_name=model_name
                )
                return Response(
                    content=r.content,
                    status_code=200,
                    media_type="application/json",
                )

        except Exception as e:
            log.error(
                f"[CODEX] 非流式请求异常: {e}, attempt={attempt + 1}/{max_retries + 1}"
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_interval)
                continue
            return Response(
                content=json.dumps({"error": {"message": str(e), "type": "server_error"}}),
                status_code=500,
                media_type="application/json",
            )

    return Response(
        content=json.dumps({"error": {"message": "Max retries exceeded", "type": "server_error"}}),
        status_code=503,
        media_type="application/json",
    )


def _parse_codex_rate_limit(error_text: str) -> Optional[float]:
    """
    解析 Codex 429 错误中的速率限制重置时间

    Returns:
        Unix 时间戳，或 None
    """
    try:
        data = json.loads(error_text)
        error = data.get("error", {})

        # 检查 resets_at (Unix timestamp)
        resets_at = error.get("resets_at")
        if resets_at:
            return float(resets_at)

        # 检查 resets_in_seconds
        resets_in = error.get("resets_in_seconds")
        if resets_in:
            return time.time() + float(resets_in)

    except Exception:
        pass
    return None
