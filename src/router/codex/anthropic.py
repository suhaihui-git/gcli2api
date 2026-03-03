"""
Anthropic Router - Handles Anthropic Messages format API requests via Codex
通过 Codex (OpenAI Responses API) 处理 Anthropic 格式请求
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from log import log
from src.converter.codex2openai import (
    CodexStreamState,
    convert_codex_event_to_anthropic,
    parse_codex_sse_event,
)
from src.converter.openai2codex import convert_anthropic_to_codex_request, _build_reverse_name_map_anthropic
from src.models import ClaudeRequest, model_to_dict
from src.router.hi_check import create_health_check_response, is_health_check_request
from src.utils import authenticate_bearer

router = APIRouter()


@router.post("/codex/v1/messages")
async def messages(
    claude_request: ClaudeRequest,
    token: str = Depends(authenticate_bearer),
):
    """
    处理 Anthropic Messages 格式的请求，通过 Codex Responses API 转发

    Args:
        claude_request: Anthropic 格式的请求体
        token: Bearer 认证令牌
    """
    log.debug(f"[CODEX-ANTHROPIC] Request for model: {claude_request.model}")

    normalized_dict = model_to_dict(claude_request)

    # 健康检查
    if is_health_check_request(normalized_dict, format="anthropic"):
        response = create_health_check_response(format="anthropic")
        return JSONResponse(content=response)

    model = claude_request.model
    is_streaming = claude_request.stream if hasattr(claude_request, "stream") else False

    # 构建工具名反向映射（用于响应中恢复原始工具名）
    reverse_name_map = _build_reverse_name_map_anthropic(normalized_dict)

    # 转换为 Codex Responses API 格式
    codex_request = convert_anthropic_to_codex_request(
        normalized_dict, model=model, stream=is_streaming or True
    )

    # ========== 非流式请求 ==========
    if not is_streaming:
        from src.api.codex import non_stream_request

        response = await non_stream_request(body=codex_request)

        status_code = getattr(response, "status_code", 200)
        if hasattr(response, "body"):
            response_body = (
                response.body.decode() if isinstance(response.body, bytes) else response.body
            )
        elif hasattr(response, "content"):
            response_body = (
                response.content.decode()
                if isinstance(response.content, bytes)
                else response.content
            )
        else:
            response_body = str(response)

        try:
            codex_response = json.loads(response_body)
        except Exception as e:
            log.error(f"[CODEX-ANTHROPIC] Failed to parse Codex response: {e}")
            raise HTTPException(status_code=500, detail="Response parsing failed")

        if status_code != 200:
            return JSONResponse(content=codex_response, status_code=status_code)

        # 将 Codex 非流式响应转换为 Anthropic 格式
        import uuid

        anthropic_response = _convert_codex_to_anthropic_non_stream(codex_response, model, reverse_name_map=reverse_name_map)
        return JSONResponse(content=anthropic_response, status_code=200)

    # ========== 流式请求 ==========
    async def stream_generator():
        from fastapi import Response
        from src.api.codex import stream_request

        state = CodexStreamState()
        stream_gen = stream_request(body=codex_request, native=False)

        async for chunk in stream_gen:
            if isinstance(chunk, Response):
                error_content = (
                    chunk.body if isinstance(chunk.body, bytes) else chunk.body.encode("utf-8")
                )
                yield error_content
                return

            chunk_str = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk

            if not chunk_str.strip():
                continue

            parsed = parse_codex_sse_event(chunk_str)
            if not parsed:
                continue

            event_type, event_data = parsed
            if event_type == "done":
                return

            # 转换为 Anthropic SSE 格式
            anthropic_chunk = convert_codex_event_to_anthropic(
                event_type, event_data, state, model=model,
                reverse_name_map=reverse_name_map,
            )
            if anthropic_chunk:
                yield anthropic_chunk.encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


def _convert_codex_to_anthropic_non_stream(
    codex_response: dict, model: str,
    reverse_name_map: Optional[dict] = None,
) -> dict:
    """将 Codex 非流式响应转换为 Anthropic Messages 格式"""
    import uuid

    response = codex_response if "output" in codex_response else codex_response.get("response", {})
    output = response.get("output", [])
    usage_data = response.get("usage", {})

    content = []
    stop_reason = "end_turn"

    for item in output:
        item_type = item.get("type", "")
        if item_type == "reasoning":
            # 优先从 summary 提取，其次从 content 提取
            thinking_text = ""
            summary = item.get("summary", [])
            if isinstance(summary, list):
                for s in summary:
                    if isinstance(s, dict) and s.get("text"):
                        thinking_text += s.get("text", "")
                    elif isinstance(s, str):
                        thinking_text += s
            elif isinstance(summary, str):
                thinking_text = summary
            if not thinking_text:
                reasoning_content = item.get("content", [])
                if isinstance(reasoning_content, list):
                    for part in reasoning_content:
                        if isinstance(part, dict) and part.get("text"):
                            thinking_text += part.get("text", "")
                        elif isinstance(part, str):
                            thinking_text += part
                elif isinstance(reasoning_content, str):
                    thinking_text = reasoning_content
            if thinking_text:
                content.append({"type": "thinking", "thinking": thinking_text})
        elif item_type == "message":
            content_parts = item.get("content", [])
            if isinstance(content_parts, list):
                for part in content_parts:
                    if part.get("type") == "output_text":
                        text = part.get("text", "")
                        if text:
                            content.append({"type": "text", "text": text})
            elif isinstance(content_parts, str) and content_parts:
                content.append({"type": "text", "text": content_parts})
        elif item_type == "function_call":
            stop_reason = "tool_use"
            func_name = item.get("name", "")
            if reverse_name_map and func_name in reverse_name_map:
                func_name = reverse_name_map[func_name]
            args_str = item.get("arguments", "{}")
            try:
                args = json.loads(args_str)
                if not isinstance(args, dict):
                    args = {}
            except (json.JSONDecodeError, TypeError):
                args = {}
            content.append({
                "type": "tool_use",
                "id": item.get("call_id", item.get("id", str(uuid.uuid4()))),
                "name": func_name,
                "input": args,
            })

    # 处理 stop_reason
    codex_stop = response.get("stop_reason", "")
    if stop_reason != "tool_use":
        if codex_stop == "max_tokens":
            stop_reason = "max_tokens"
        elif codex_stop == "stop":
            stop_reason = codex_stop

    # usage (含 cache_read_input_tokens)
    input_tokens = usage_data.get("input_tokens", 0)
    output_tokens = usage_data.get("output_tokens", 0)
    cached_tokens = usage_data.get("input_tokens_details", {}).get("cached_tokens", 0)
    if cached_tokens > 0 and input_tokens >= cached_tokens:
        input_tokens -= cached_tokens

    usage = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
    if cached_tokens > 0:
        usage["cache_read_input_tokens"] = cached_tokens

    return {
        "id": response.get("id", f"msg_{uuid.uuid4().hex[:20]}"),
        "type": "message",
        "role": "assistant",
        "content": content,
        "model": model,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": usage,
    }
