"""
Anthropic Router - Handles Anthropic Messages format API requests via Claude
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from log import log
from src.models import ClaudeRequest, model_to_dict
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


def _anthropic_error_sse_bytes(
    error_content,
    *,
    status_code: int = 500,
    default_message: str = "Upstream Claude request failed",
) -> bytes:
    if isinstance(error_content, bytes):
        error_content = error_content.decode("utf-8", errors="ignore")

    payload = None
    if isinstance(error_content, dict):
        payload = error_content
    else:
        try:
            payload = json.loads(error_content) if error_content else None
        except Exception:
            payload = None

    if not isinstance(payload, dict):
        payload = {
            "error": {
                "type": "api_error",
                "message": str(error_content or default_message),
            }
        }

    if payload.get("type") != "error":
        payload = {
            "type": "error",
            "error": payload.get("error")
            if isinstance(payload.get("error"), dict)
            else {
                "type": "api_error",
                "message": str(error_content or default_message),
            },
        }

    return f"event: error\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


@router.post("/claude/v1/messages")
async def messages(
    claude_request: ClaudeRequest,
    token: str = Depends(authenticate_bearer),
):
    """
    处理 Anthropic Messages 格式请求，通过 Claude 上游直通转发
    """
    normalized_dict = model_to_dict(claude_request)

    if is_health_check_request(normalized_dict, format="anthropic"):
        return JSONResponse(content=create_health_check_response(format="anthropic"))

    is_streaming = bool(normalized_dict.get("stream"))
    log.debug(f"[CLAUDE-ANTHROPIC] Request for model: {normalized_dict.get('model')}")

    if not is_streaming:
        from src.api.claude import non_stream_request

        response = await non_stream_request(body=normalized_dict)
        status_code = getattr(response, "status_code", 200)
        response_text = _response_body_to_text(response)
        try:
            payload = json.loads(response_text)
        except Exception as e:
            log.error(f"[CLAUDE-ANTHROPIC] Failed to parse response: {e}")
            raise HTTPException(status_code=500, detail="Response parsing failed")
        return JSONResponse(content=payload, status_code=status_code)

    async def stream_generator():
        from fastapi import Response
        from src.api.claude import stream_request

        stream_gen = stream_request(body=normalized_dict, native=True)
        async for chunk in stream_gen:
            if isinstance(chunk, Response):
                yield _anthropic_error_sse_bytes(
                    chunk.body if isinstance(chunk.body, bytes) else chunk.body,
                    status_code=chunk.status_code,
                )
                return
            if isinstance(chunk, bytes):
                yield chunk
                continue
            if hasattr(chunk, "body"):
                body = chunk.body if isinstance(chunk.body, bytes) else str(chunk.body).encode("utf-8")
                yield body
                return
            if isinstance(chunk, str):
                yield chunk.encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


@router.post("/claude/v1/messages/count_tokens")
async def count_tokens(
    request: Request,
    token: str = Depends(authenticate_bearer),
):
    """Anthropic count_tokens 直通接口"""
    try:
        body = await request.json()
    except Exception as e:
        log.error(f"[CLAUDE-COUNT] Failed to parse request body: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    from src.api.claude import count_tokens_request

    response = await count_tokens_request(body=body)
    status_code = getattr(response, "status_code", 200)
    response_text = _response_body_to_text(response)
    try:
        payload = json.loads(response_text)
    except Exception as e:
        log.error(f"[CLAUDE-COUNT] Failed to parse response: {e}")
        raise HTTPException(status_code=500, detail="Response parsing failed")
    return JSONResponse(content=payload, status_code=status_code)
