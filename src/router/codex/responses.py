"""
Responses Router - Handles OpenAI Responses API format requests via Codex
通过 Codex 处理 OpenAI Responses API 格式请求（近似直通，做必要字段清理）
参考 CLIProxyAPI 的 codex_openai-responses_request.go 实现
"""

import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from log import log
from src.converter.openai2codex import parse_model_thinking_suffix
from src.utils import authenticate_bearer

router = APIRouter()


def _clean_responses_request(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    清理 OpenAI Responses API 请求体，使其兼容 Codex 上游

    纯直通策略：仅解析模型后缀 + 确保必需字段 + 删除已知不兼容字段
    不注入任何客户端未发送的参数（reasoning, include, parallel_tool_calls 等全部由客户端控制）
    """
    # 解析模型名中的思考等级后缀，仅用于清理模型名
    model = body.get("model", "")
    base_model, _ = parse_model_thinking_suffix(model)
    body["model"] = base_model

    # 仅设置上游必需的字段
    body.setdefault("instructions", "")
    body["store"] = False

    # 删除 Codex 上游已知不支持的字段
    for field in [
        "max_output_tokens", "max_completion_tokens",
        "temperature", "top_p", "service_tier",
        "truncation", "user", "context_management",
    ]:
        body.pop(field, None)

    # 转换 input 中的 system role → developer
    input_items = body.get("input", [])
    if isinstance(input_items, str):
        body["input"] = [{
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": input_items}],
        }]
    elif isinstance(input_items, list):
        for item in input_items:
            if isinstance(item, dict) and item.get("role") == "system":
                item["role"] = "developer"

    return body


@router.post("/codex/v1/responses")
async def responses(
    request: Request,
    token: str = Depends(authenticate_bearer),
):
    """
    处理 OpenAI Responses API 格式请求，近似直通转发到 Codex 上游
    仅做必要的字段清理和兼容性处理
    """
    try:
        body = await request.json()
    except Exception as e:
        log.error(f"[CODEX-RESPONSES] Failed to parse request body: {e}")
        return JSONResponse(
            content={"error": {"message": "Invalid JSON", "type": "invalid_request_error"}},
            status_code=400,
        )

    model = body.get("model", "")
    is_streaming = body.get("stream", True)
    log.debug(f"[CODEX-RESPONSES] Request for model: {model}, stream={is_streaming}")

    # 保存原始 instructions（用于响应中恢复）
    original_instructions = body.get("instructions", "")

    # 清理请求体
    body = _clean_responses_request(body)

    # 调试日志：显示清理后的请求体 top-level keys 和关键字段
    from config import get_codex_api_url
    codex_url = await get_codex_api_url()
    log.info(
        f"[CODEX-RESPONSES] target={codex_url}/responses, "
        f"model={body.get('model')}, "
        f"keys={list(body.keys())}"
    )

    # ========== 非流式请求 ==========
    if not is_streaming:
        from src.api.codex import non_stream_request

        response = await non_stream_request(body=body)

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
            log.error(f"[CODEX-RESPONSES] Failed to parse response: {e}")
            return JSONResponse(
                content={"error": {"message": "Response parsing failed", "type": "server_error"}},
                status_code=500,
            )

        if status_code != 200:
            return JSONResponse(content=codex_response, status_code=status_code)

        # 恢复 instructions（参考 CPA 的 response 处理）
        if "instructions" in codex_response and original_instructions:
            codex_response["instructions"] = original_instructions

        return JSONResponse(content=codex_response, status_code=200)

    # ========== 流式请求 ==========
    async def stream_generator():
        from fastapi import Response
        from src.api.codex import stream_request

        stream_gen = stream_request(body=body, native=True)

        async for chunk in stream_gen:
            # 检查是否是 Response 对象（错误情况）
            if isinstance(chunk, Response):
                error_content = (
                    chunk.body if isinstance(chunk.body, bytes) else chunk.body.encode("utf-8")
                )
                yield error_content
                return

            # 直通 SSE 数据（Responses 格式上游和下游一致）
            if isinstance(chunk, bytes):
                yield chunk
            else:
                yield chunk.encode("utf-8") if isinstance(chunk, str) else chunk

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
