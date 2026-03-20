"""
OpenAI Router - Handles OpenAI format API requests via Codex
通过 Codex (OpenAI Responses API) 处理 OpenAI 格式请求
"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse

from log import log
from src.converter.codex2openai import (
    CodexStreamState,
    convert_codex_event_to_openai,
    convert_codex_to_openai_non_stream,
    parse_codex_sse_event,
)
from src.converter.openai2codex import convert_openai_to_codex_request, _build_reverse_name_map_openai
from src.models import OpenAIChatCompletionRequest, model_to_dict
from src.openai_errors import openai_error_response, openai_error_sse_bytes
from src.router.hi_check import create_health_check_response, is_health_check_request
from src.utils import authenticate_bearer

router = APIRouter()


@router.post("/codex/v1/chat/completions")
async def chat_completions(
    openai_request: OpenAIChatCompletionRequest,
    token: str = Depends(authenticate_bearer),
):
    """
    处理 OpenAI 格式的聊天完成请求，通过 Codex Responses API 转发

    Args:
        openai_request: OpenAI 格式的请求体
        token: Bearer 认证令牌
    """
    log.debug(f"[CODEX-OPENAI] Request for model: {openai_request.model}")

    normalized_dict = model_to_dict(openai_request)

    # 健康检查
    if is_health_check_request(normalized_dict, format="openai"):
        response = create_health_check_response(format="openai")
        return JSONResponse(content=response)

    model = openai_request.model
    is_streaming = openai_request.stream

    # 构建工具名反向映射（用于响应中恢复原始工具名）
    reverse_name_map = _build_reverse_name_map_openai(normalized_dict)

    # 转换为 Codex Responses API 格式
    codex_request = convert_openai_to_codex_request(
        normalized_dict, model=model, stream=is_streaming
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
            log.error(f"[CODEX-OPENAI] Failed to parse Codex response: {e}")
            return openai_error_response(
                "Response parsing failed",
                status_code=500,
                default_message="Response parsing failed",
            )

        if status_code != 200:
            return openai_error_response(
                codex_response,
                status_code=status_code,
                default_message="Upstream Codex request failed",
            )

        # 将 Codex 非流式响应转换为 OpenAI 格式
        # Codex 非流式响应本身就类似 response.completed 事件
        openai_response = convert_codex_to_openai_non_stream(
            {"response": codex_response} if "output" in codex_response else codex_response,
            reverse_name_map=reverse_name_map,
        )
        return JSONResponse(content=openai_response, status_code=200)

    # ========== 流式请求 ==========
    async def stream_generator():
        from fastapi import Response
        from src.api.codex import stream_request

        state = CodexStreamState()
        stream_gen = stream_request(body=codex_request, native=False)

        async for chunk in stream_gen:
            # 检查是否是 Response 对象（错误情况）
            if isinstance(chunk, Response):
                error_content = chunk.body if isinstance(chunk.body, bytes) else (chunk.body or "")
                yield openai_error_sse_bytes(
                    error_content,
                    status_code=chunk.status_code,
                    default_message="Upstream Codex request failed",
                )
                yield "data: [DONE]\n\n".encode("utf-8")
                return

            chunk_str = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk

            if not chunk_str.strip():
                continue

            # 解析 Codex SSE 事件
            parsed = parse_codex_sse_event(chunk_str)
            if not parsed:
                # 非 data: 行（可能是 event: 行等），跳过
                continue

            event_type, event_data = parsed
            if event_type == "done":
                yield "data: [DONE]\n\n".encode("utf-8")
                return

            # 转换为 OpenAI 格式
            openai_chunk = convert_codex_event_to_openai(event_type, event_data, state, reverse_name_map=reverse_name_map)
            if openai_chunk:
                yield openai_chunk.encode("utf-8")

        yield "data: [DONE]\n\n".encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
