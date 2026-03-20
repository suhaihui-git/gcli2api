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

# 可安全自动剥离的参数白名单（避免剥离关键字段如 model, input）
_SAFE_TO_STRIP_PARAMS = {
    "reasoning", "include", "parallel_tool_calls",
    "store", "stream", "reasoning.effort", "reasoning.summary",
    "tools", "tool_choice", "prompt_cache_key",
}

# Codex 上游已知不支持或不稳定的字段，发送前统一清理
_PRE_STRIP_PARAMS = {
    "previous_response_id",
    "prompt_cache_retention",
    "safety_identifier",
    "context_management",
    "max_output_tokens",
    "max_completion_tokens",
    "temperature",
    "top_p",
    "truncation",
    "user",
}

# 仅在显式要求紧凑非流式时走 /responses/compact
_NON_STREAM_COMPACT_HINTS = {
    "response_format",
    "text",
}


def _prune_dependent_fields(body: Dict[str, Any]) -> None:
    """按字段依赖关系清理请求体。"""
    if not body.get("tools"):
        body.pop("tools", None)
        body.pop("parallel_tool_calls", None)
        body.pop("tool_choice", None)

    reasoning = body.get("reasoning")
    if not isinstance(reasoning, dict) or not reasoning:
        body.pop("reasoning", None)
        body.pop("include", None)

    if body.get("service_tier") != "priority":
        body.pop("service_tier", None)

    body.pop("_prefer_compact", None)


def _sanitize_codex_body(body: Dict[str, Any]) -> None:
    """统一清理 Codex 请求体中的不兼容字段。"""
    body.setdefault("instructions", "")
    for field in _PRE_STRIP_PARAMS:
        body.pop(field, None)
    _prune_dependent_fields(body)


def _strip_body_param(body: Dict[str, Any], bad_param: str) -> bool:
    """剥离被上游拒绝的参数，支持嵌套字段。"""
    removed = False

    if "." not in bad_param:
        removed = bad_param in body
        body.pop(bad_param, None)
    else:
        parts = bad_param.split(".")
        target: Any = body
        for part in parts[:-1]:
            if not isinstance(target, dict) or part not in target:
                target = None
                break
            target = target.get(part)
        if isinstance(target, dict) and parts[-1] in target:
            target.pop(parts[-1], None)
            removed = True

    reasoning = body.get("reasoning")
    if isinstance(reasoning, dict) and not reasoning:
        body.pop("reasoning", None)

    _prune_dependent_fields(body)
    return removed


def _should_use_compact_endpoint_for_non_stream(body: Dict[str, Any]) -> bool:
    """仅对明确的简单/紧凑请求使用 /responses/compact。"""
    if body.get("_prefer_compact"):
        return True
    return any(field in body for field in _NON_STREAM_COMPACT_HINTS)


def _parse_unknown_parameter(error_str: str) -> Optional[str]:
    """
    解析 400 unknown_parameter 错误，提取被拒绝的参数名

    返回参数名（仅当在安全剥离白名单中时），否则返回 None
    """
    try:
        data = json.loads(error_str)
        error = data.get("error", {})
        if error.get("code") == "unknown_parameter":
            param = error.get("param", "")
            if param and param in _SAFE_TO_STRIP_PARAMS:
                return param
    except Exception:
        pass
    return None


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


def _apply_prompt_cache_identity(body: Dict[str, Any], request_headers: Dict[str, str]) -> None:
    """
    绑定显式 prompt_cache_key 到请求体和会话头。

    安全策略：
    - 仅信任请求体中显式提供的 prompt_cache_key
    - 若存在，则将 prompt_cache_key / Conversation_id / Session_id 绑定为同一值
    - 若不存在，则保留现有随机 Session_id 行为
    """
    prompt_cache_key = body.get("prompt_cache_key")
    if prompt_cache_key is None:
        return

    cache_key = str(prompt_cache_key).strip()
    if not cache_key or "\r" in cache_key or "\n" in cache_key:
        body.pop("prompt_cache_key", None)
        return

    body["prompt_cache_key"] = cache_key
    request_headers["Conversation_id"] = cache_key
    request_headers["Session_id"] = cache_key


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
                        "message": "No available credentials",
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
            _sanitize_codex_body(body)

            _apply_prompt_cache_identity(body, request_headers)

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

                        # 400 unknown_parameter: 自动剥离问题参数并重试
                        if r.status_code == 400:
                            bad_param = _parse_unknown_parameter(error_str)
                            if bad_param and _strip_body_param(body, bad_param):
                                log.info(
                                    f"[CODEX] 自动剥离不支持的参数 '{bad_param}' 并重试"
                                )
                                continue  # 重试（不消耗常规重试次数）

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
    use_compact_endpoint = _should_use_compact_endpoint_for_non_stream(body)

    if not use_compact_endpoint:
        completed_line = None
        stream_gen = stream_request(body=body, native=False, headers=headers)

        async for chunk in stream_gen:
            if isinstance(chunk, Response):
                return chunk

            chunk_str = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
            if not chunk_str or not chunk_str.strip():
                continue
            if not chunk_str.startswith("data: "):
                continue

            payload = chunk_str[6:].strip()
            if payload == "[DONE]":
                break

            try:
                event = json.loads(payload)
            except Exception:
                continue

            if event.get("type") == "response.completed":
                completed_line = payload.encode("utf-8")
                break

        if completed_line is None:
            return Response(
                content=json.dumps({
                    "error": {
                        "message": "Codex stream ended before response.completed",
                        "type": "server_error",
                        "code": "stream_incomplete",
                    }
                }),
                status_code=502,
                media_type="application/json",
            )

        return Response(
            content=completed_line,
            status_code=200,
            media_type="application/json",
        )

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
                            "message": "No available credentials",
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

            _sanitize_codex_body(body)
            body.pop("stream", None)
            body.pop("store", None)

            _apply_prompt_cache_identity(body, request_headers)

            log.info(
                f"[CODEX] 非流式 compact 请求: model={model_name}, "
                f"credential={credential_name}, "
                f"url={target_url}, "
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

                    # 400 unknown_parameter: 自动剥离问题参数并重试
                    if r.status_code == 400:
                        bad_param = _parse_unknown_parameter(error_text)
                        if bad_param and _strip_body_param(body, bad_param):
                            log.info(
                                f"[CODEX] 自动剥离不支持的参数 '{bad_param}' 并重试"
                            )
                            continue

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
