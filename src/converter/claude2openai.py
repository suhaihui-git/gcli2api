"""
Claude Messages API -> OpenAI Chat Completions 响应转换
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ClaudeToolCallAccumulator:
    id: str = ""
    name: str = ""
    arguments: List[str] = field(default_factory=list)


@dataclass
class ClaudeOpenAIStreamState:
    response_id: str = ""
    created: int = 0
    finish_reason: str = ""
    tool_calls: Dict[int, ClaudeToolCallAccumulator] = field(default_factory=dict)


def map_anthropic_stop_reason_to_openai(stop_reason: Optional[str]) -> str:
    if stop_reason == "tool_use":
        return "tool_calls"
    if stop_reason == "max_tokens":
        return "length"
    return "stop"


def convert_claude_to_openai_non_stream(
    claude_response: Dict[str, Any],
    *,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """将 Claude 非流式响应转换为 OpenAI Chat Completions 响应"""
    content_parts: List[str] = []
    reasoning_parts: List[str] = []
    tool_calls: List[Dict[str, Any]] = []

    for block in claude_response.get("content", []) or []:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type == "text":
            text = block.get("text")
            if isinstance(text, str):
                content_parts.append(text)
        elif block_type == "thinking":
            thinking = block.get("thinking")
            if isinstance(thinking, str):
                reasoning_parts.append(thinking)
        elif block_type == "tool_use":
            tool_calls.append(
                {
                    "id": block.get("id") or "",
                    "type": "function",
                    "function": {
                        "name": block.get("name") or "",
                        "arguments": json.dumps(block.get("input") or {}, ensure_ascii=False),
                    },
                }
            )

    usage = claude_response.get("usage") or {}
    prompt_tokens = int(usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("output_tokens") or 0)

    message: Dict[str, Any] = {
        "role": "assistant",
        "content": "".join(content_parts),
    }
    if reasoning_parts:
        message["reasoning_content"] = "".join(reasoning_parts)
    if tool_calls:
        message["tool_calls"] = tool_calls

    return {
        "id": claude_response.get("id") or f"chatcmpl-{int(time.time() * 1000)}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model or claude_response.get("model") or "",
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": map_anthropic_stop_reason_to_openai(
                    claude_response.get("stop_reason")
                ),
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def _build_chunk(
    state: ClaudeOpenAIStreamState,
    model: str,
    delta: Dict[str, Any],
    *,
    finish_reason: Optional[str] = None,
) -> str:
    payload = {
        "id": state.response_id or f"chatcmpl-{state.created}",
        "object": "chat.completion.chunk",
        "created": state.created or int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def convert_claude_event_to_openai(
    event_type: str,
    event_data: Dict[str, Any],
    state: ClaudeOpenAIStreamState,
    *,
    model: str,
) -> List[str]:
    """将单个 Claude SSE 事件转换为 OpenAI SSE 数据块"""
    chunks: List[str] = []

    if event_type == "message_start":
        message = event_data.get("message") or {}
        state.response_id = message.get("id") or state.response_id or f"chatcmpl-{int(time.time() * 1000)}"
        state.created = int(time.time())
        chunks.append(_build_chunk(state, model, {"role": "assistant"}))
        return chunks

    if event_type == "content_block_start":
        block = event_data.get("content_block") or {}
        if block.get("type") == "tool_use":
            index = int(event_data.get("index") or 0)
            state.tool_calls[index] = ClaudeToolCallAccumulator(
                id=block.get("id") or "",
                name=block.get("name") or "",
            )
        return chunks

    if event_type == "content_block_delta":
        delta = event_data.get("delta") or {}
        delta_type = delta.get("type")
        if delta_type == "text_delta":
            text = delta.get("text")
            if isinstance(text, str) and text:
                chunks.append(_build_chunk(state, model, {"content": text}))
        elif delta_type == "thinking_delta":
            thinking = delta.get("thinking")
            if isinstance(thinking, str) and thinking:
                chunks.append(_build_chunk(state, model, {"reasoning_content": thinking}))
        elif delta_type == "input_json_delta":
            index = int(event_data.get("index") or 0)
            partial_json = delta.get("partial_json")
            if isinstance(partial_json, str) and index in state.tool_calls:
                state.tool_calls[index].arguments.append(partial_json)
        return chunks

    if event_type == "content_block_stop":
        index = int(event_data.get("index") or 0)
        accumulator = state.tool_calls.pop(index, None)
        if accumulator:
            arguments = "".join(accumulator.arguments).strip() or "{}"
            chunks.append(
                _build_chunk(
                    state,
                    model,
                    {
                        "tool_calls": [
                            {
                                "index": index,
                                "id": accumulator.id,
                                "type": "function",
                                "function": {
                                    "name": accumulator.name,
                                    "arguments": arguments,
                                },
                            }
                        ]
                    },
                )
            )
        return chunks

    if event_type == "message_delta":
        delta = event_data.get("delta") or {}
        stop_reason = delta.get("stop_reason")
        if stop_reason:
            state.finish_reason = map_anthropic_stop_reason_to_openai(stop_reason)
            chunks.append(_build_chunk(state, model, {}, finish_reason=state.finish_reason))
        return chunks

    return chunks
