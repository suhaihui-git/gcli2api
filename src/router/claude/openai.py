"""
OpenAI Router - Handles OpenAI format API requests via Claude
"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse

from log import log
from src.converter.claude2openai import (
    ClaudeOpenAIStreamState,
    convert_claude_event_to_openai,
    convert_claude_to_openai_non_stream,
)
from src.converter.openai2claude import convert_openai_to_claude_request
from src.models import OpenAIChatCompletionRequest, model_to_dict
from src.openai_errors import openai_error_response, openai_error_sse_bytes
from src.router.hi_check import create_health_check_response, is_health_check_request
from src.utils import authenticate_bearer

router = APIRouter()


def _response_body_to_text(response) -> str:
    if hasattr(response, "body"):
        body = response.body
        return body.decode("utf-8") if isinstance(body, bytes) else str(body)
    if hasattr(response, "content"):
        body = response.content
        return body.decode("utf-8") if isinstance(body, bytes) else str(body)
    return str(response)


@router.post("/claude/v1/chat/completions")
async def chat_completions(
    openai_request: OpenAIChatCompletionRequest,
    token: str = Depends(authenticate_bearer),
):
    """处理 OpenAI Chat Completions 请求，通过 Claude Messages API 转发"""
    normalized_dict = model_to_dict(openai_request)

    if is_health_check_request(normalized_dict, format="openai"):
        return JSONResponse(content=create_health_check_response(format="openai"))

    model = normalized_dict.get("model", "")
    is_streaming = bool(normalized_dict.get("stream"))
    log.debug(f"[CLAUDE-OPENAI] Request for model: {model}")

    claude_request = convert_openai_to_claude_request(
        normalized_dict,
        model=model,
        stream=is_streaming,
    )

    if not is_streaming:
        from src.api.claude import non_stream_request

        response = await non_stream_request(body=claude_request)
        status_code = getattr(response, "status_code", 200)
        response_text = _response_body_to_text(response)

        try:
            payload = json.loads(response_text)
        except Exception as e:
            log.error(f"[CLAUDE-OPENAI] Failed to parse Claude response: {e}")
            return openai_error_response(
                "Response parsing failed",
                status_code=500,
                default_message="Response parsing failed",
            )

        if status_code != 200:
            return openai_error_response(
                payload,
                status_code=status_code,
                default_message="Upstream Claude request failed",
            )

        return JSONResponse(
            content=convert_claude_to_openai_non_stream(payload, model=model),
            status_code=200,
        )

    async def stream_generator():
        from fastapi import Response
        from src.api.claude import stream_request

        state = ClaudeOpenAIStreamState()
        current_event = ""
        stream_gen = stream_request(body=claude_request, native=False)

        async for line in stream_gen:
            if isinstance(line, Response):
                error_content = line.body if isinstance(line.body, bytes) else (line.body or "")
                yield openai_error_sse_bytes(
                    error_content,
                    status_code=line.status_code,
                    default_message="Upstream Claude request failed",
                )
                yield b"data: [DONE]\n\n"
                return

            line_str = line.decode("utf-8") if isinstance(line, bytes) else str(line)
            if not line_str.strip():
                continue

            if line_str.startswith("event:"):
                current_event = line_str.split(":", 1)[1].strip()
                continue

            if not line_str.startswith("data:"):
                continue

            payload_text = line_str.split(":", 1)[1].strip()
            if not payload_text:
                continue

            if payload_text == "[DONE]":
                yield b"data: [DONE]\n\n"
                return

            try:
                event_payload = json.loads(payload_text)
            except Exception as e:
                log.error(f"[CLAUDE-OPENAI] Failed to parse SSE payload: {e}")
                yield openai_error_sse_bytes(
                    payload_text,
                    status_code=500,
                    default_message="Response parsing failed",
                )
                yield b"data: [DONE]\n\n"
                return

            if current_event == "error":
                yield openai_error_sse_bytes(
                    event_payload,
                    status_code=500,
                    default_message="Upstream Claude request failed",
                )
                yield b"data: [DONE]\n\n"
                return

            for chunk in convert_claude_event_to_openai(
                current_event,
                event_payload,
                state,
                model=model,
            ):
                yield chunk.encode("utf-8")

        yield b"data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
