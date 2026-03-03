"""
Codex SSE → OpenAI/Anthropic 响应格式转换器
参考 CLIProxyAPI 的 codex_openai_response.go 和 codex_claude_response.go 实现
"""

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from log import log


class CodexStreamState:
    """Codex 流式响应的状态跟踪"""

    def __init__(self):
        self.response_id = ""
        self.created_at = 0
        self.model = ""
        self.function_call_index = -1
        self.has_received_arguments_delta = False
        self.has_tool_call_announced = False
        # Anthropic 特有
        self.content_block_index = 0
        self.in_thinking_block = False
        self.in_text_block = False
        self.has_tool_call = False  # 是否有工具调用（用于 stop_reason）
        self.anthropic_has_received_arguments_delta = False  # Anthropic 独立跟踪


def parse_codex_sse_event(line: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    """
    解析 Codex SSE 事件行

    Args:
        line: SSE 数据行 (格式: "data: {...}")

    Returns:
        (event_type, event_data) 元组，或 None
    """
    if not line.startswith("data: "):
        return None

    raw = line[6:].strip()
    if raw == "[DONE]":
        return ("done", {})

    try:
        data = json.loads(raw)
        event_type = data.get("type", "")
        return (event_type, data)
    except json.JSONDecodeError:
        log.debug(f"[CODEX] Failed to parse SSE data: {raw[:200]}")
        return None


# =============================================================================
# Codex → OpenAI 转换
# =============================================================================


def convert_codex_event_to_openai(
    event_type: str,
    event_data: Dict[str, Any],
    state: CodexStreamState,
    reverse_name_map: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    """
    将单个 Codex SSE 事件转换为 OpenAI Chat Completions SSE 格式

    Returns:
        OpenAI 格式的 SSE 字符串 (含 "data: " 前缀)，或 None
    """
    if event_type == "response.created":
        # 提取 ID、created_at、model
        response = event_data.get("response", {})
        state.response_id = response.get("id", f"chatcmpl-{uuid.uuid4().hex[:12]}")
        state.created_at = response.get("created_at", int(time.time()))
        state.model = response.get("model", "")
        state.function_call_index = -1
        state.has_received_arguments_delta = False
        state.has_tool_call_announced = False
        return None

    if event_type == "response.reasoning_summary_text.delta":
        # reasoning → delta.reasoning_content
        delta_text = event_data.get("delta", "")
        if delta_text:
            chunk = _build_openai_chunk(state, delta={"reasoning_content": delta_text})
            return f"data: {json.dumps(chunk)}\n\n"
        return None

    if event_type == "response.reasoning_summary_text.done":
        # 思考完成，添加换行
        chunk = _build_openai_chunk(state, delta={"reasoning_content": "\n\n"})
        return f"data: {json.dumps(chunk)}\n\n"

    if event_type == "response.output_text.delta":
        delta_text = event_data.get("delta", "")
        if delta_text:
            chunk = _build_openai_chunk(state, delta={"content": delta_text})
            return f"data: {json.dumps(chunk)}\n\n"
        return None

    if event_type == "response.output_item.added":
        item = event_data.get("item", {})
        if item.get("type") == "function_call":
            state.function_call_index += 1
            state.has_tool_call_announced = True
            state.has_received_arguments_delta = False
            func_name = item.get("name", "")
            # 恢复原始工具名
            if reverse_name_map and func_name in reverse_name_map:
                func_name = reverse_name_map[func_name]
            call_id = item.get("call_id", item.get("id", ""))
            delta = {
                "tool_calls": [{
                    "index": state.function_call_index,
                    "id": call_id,
                    "type": "function",
                    "function": {"name": func_name, "arguments": ""},
                }]
            }
            chunk = _build_openai_chunk(state, delta=delta)
            return f"data: {json.dumps(chunk)}\n\n"
        return None

    if event_type == "response.function_call_arguments.delta":
        delta_args = event_data.get("delta", "")
        state.has_received_arguments_delta = True
        if delta_args:
            delta = {
                "tool_calls": [{
                    "index": state.function_call_index,
                    "function": {"arguments": delta_args},
                }]
            }
            chunk = _build_openai_chunk(state, delta=delta)
            return f"data: {json.dumps(chunk)}\n\n"
        return None

    if event_type == "response.function_call_arguments.done":
        # 如果没有通过 delta 接收到参数，发送完整参数
        if not state.has_received_arguments_delta:
            full_args = event_data.get("arguments", "")
            if full_args:
                delta = {
                    "tool_calls": [{
                        "index": state.function_call_index,
                        "function": {"arguments": full_args},
                    }]
                }
                chunk = _build_openai_chunk(state, delta=delta)
                return f"data: {json.dumps(chunk)}\n\n"
        return None

    if event_type == "response.output_item.done":
        # 如果是 function_call 且未通过 .added 事件处理
        item = event_data.get("item", {})
        if item.get("type") == "function_call" and not state.has_tool_call_announced:
            state.function_call_index += 1
            func_name = item.get("name", "")
            if reverse_name_map and func_name in reverse_name_map:
                func_name = reverse_name_map[func_name]
            call_id = item.get("call_id", item.get("id", ""))
            func_args = item.get("arguments", "")
            delta = {
                "tool_calls": [{
                    "index": state.function_call_index,
                    "id": call_id,
                    "type": "function",
                    "function": {"name": func_name, "arguments": func_args},
                }]
            }
            chunk = _build_openai_chunk(state, delta=delta)
            return f"data: {json.dumps(chunk)}\n\n"
        state.has_tool_call_announced = False
        return None

    if event_type == "response.completed":
        response = event_data.get("response", {})
        # 确定 finish_reason
        finish_reason = "stop"
        if state.function_call_index != -1:
            finish_reason = "tool_calls"

        # 构建 usage (包含详细字段)
        usage_data = response.get("usage", {})
        usage = {
            "prompt_tokens": usage_data.get("input_tokens", 0),
            "completion_tokens": usage_data.get("output_tokens", 0),
            "total_tokens": usage_data.get("total_tokens",
                usage_data.get("input_tokens", 0) + usage_data.get("output_tokens", 0)),
        }
        # 缓存详情
        cached_tokens = usage_data.get("input_tokens_details", {}).get("cached_tokens", 0)
        if cached_tokens:
            usage["prompt_tokens_details"] = {"cached_tokens": cached_tokens}
        # 推理详情
        reasoning_tokens = usage_data.get("output_tokens_details", {}).get("reasoning_tokens", 0)
        if reasoning_tokens:
            usage["completion_tokens_details"] = {"reasoning_tokens": reasoning_tokens}

        chunk = _build_openai_chunk(state, delta={}, finish_reason=finish_reason)
        chunk["usage"] = usage
        return f"data: {json.dumps(chunk)}\n\n"

    return None


def _build_openai_chunk(
    state: CodexStreamState,
    delta: Dict[str, Any],
    finish_reason: Optional[str] = None,
) -> Dict[str, Any]:
    """构建 OpenAI Chat Completions 流式 chunk"""
    return {
        "id": state.response_id or f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion.chunk",
        "created": state.created_at or int(time.time()),
        "model": state.model,
        "choices": [{
            "index": 0,
            "delta": delta,
            "finish_reason": finish_reason,
        }],
    }


def convert_codex_to_openai_non_stream(
    completed_event: Dict[str, Any],
    reverse_name_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    将 Codex response.completed 事件转换为 OpenAI Chat Completions 非流式响应
    """
    response = completed_event.get("response", {})
    response_id = response.get("id", f"chatcmpl-{uuid.uuid4().hex[:12]}")
    created_at = response.get("created_at", int(time.time()))
    model = response.get("model", "")

    # 解析 output
    output = response.get("output", [])
    content = ""
    reasoning_content = ""
    tool_calls = []
    finish_reason = "stop"

    for item in output:
        item_type = item.get("type", "")
        if item_type == "reasoning":
            # 提取 reasoning summary
            summary = item.get("summary", [])
            for s in summary:
                if s.get("type") == "summary_text":
                    reasoning_content += s.get("text", "")
        elif item_type == "message":
            # 提取文本内容
            content_parts = item.get("content", [])
            for part in content_parts:
                if part.get("type") == "output_text":
                    content += part.get("text", "")
        elif item_type == "function_call":
            finish_reason = "tool_calls"
            func_name = item.get("name", "")
            if reverse_name_map and func_name in reverse_name_map:
                func_name = reverse_name_map[func_name]
            tool_calls.append({
                "id": item.get("call_id", item.get("id", "")),
                "type": "function",
                "function": {
                    "name": func_name,
                    "arguments": item.get("arguments", ""),
                },
            })

    # 构建 message
    message = {"role": "assistant", "content": content or None}
    if reasoning_content:
        message["reasoning_content"] = reasoning_content
    if tool_calls:
        message["tool_calls"] = tool_calls

    # 构建 usage (包含详细字段)
    usage_data = response.get("usage", {})
    usage = {
        "prompt_tokens": usage_data.get("input_tokens", 0),
        "completion_tokens": usage_data.get("output_tokens", 0),
        "total_tokens": usage_data.get("total_tokens",
            usage_data.get("input_tokens", 0) + usage_data.get("output_tokens", 0)),
    }
    cached_tokens = usage_data.get("input_tokens_details", {}).get("cached_tokens", 0)
    if cached_tokens:
        usage["prompt_tokens_details"] = {"cached_tokens": cached_tokens}
    reasoning_tokens = usage_data.get("output_tokens_details", {}).get("reasoning_tokens", 0)
    if reasoning_tokens:
        usage["completion_tokens_details"] = {"reasoning_tokens": reasoning_tokens}

    return {
        "id": response_id,
        "object": "chat.completion",
        "created": created_at,
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason,
        }],
        "usage": usage,
    }


# =============================================================================
# Codex → Anthropic 转换
# =============================================================================


def convert_codex_event_to_anthropic(
    event_type: str,
    event_data: Dict[str, Any],
    state: CodexStreamState,
    model: str = "",
    reverse_name_map: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    """
    将单个 Codex SSE 事件转换为 Anthropic Messages SSE 格式

    Returns:
        Anthropic 格式的 SSE 字符串（可能包含多个事件），或 None
    """
    if event_type == "response.created":
        response = event_data.get("response", {})
        state.response_id = response.get("id", f"msg_{uuid.uuid4().hex[:20]}")
        state.created_at = response.get("created_at", int(time.time()))
        state.model = model or response.get("model", "")
        state.content_block_index = 0
        state.in_thinking_block = False
        state.in_text_block = False

        # 发送 message_start
        msg_start = {
            "type": "message_start",
            "message": {
                "id": state.response_id,
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": state.model,
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        }
        return f"event: message_start\ndata: {json.dumps(msg_start)}\n\n"

    if event_type == "response.reasoning_summary_part.added":
        # 开始一个 thinking content block
        state.in_thinking_block = True
        block_start = {
            "type": "content_block_start",
            "index": state.content_block_index,
            "content_block": {"type": "thinking", "thinking": ""},
        }
        return f"event: content_block_start\ndata: {json.dumps(block_start)}\n\n"

    if event_type == "response.reasoning_summary_text.delta":
        delta_text = event_data.get("delta", "")
        if delta_text:
            delta = {
                "type": "content_block_delta",
                "index": state.content_block_index,
                "delta": {"type": "thinking_delta", "thinking": delta_text},
            }
            return f"event: content_block_delta\ndata: {json.dumps(delta)}\n\n"
        return None

    if event_type == "response.reasoning_summary_part.done":
        # 结束 thinking block
        if state.in_thinking_block:
            state.in_thinking_block = False
            block_stop = {
                "type": "content_block_stop",
                "index": state.content_block_index,
            }
            state.content_block_index += 1
            return f"event: content_block_stop\ndata: {json.dumps(block_stop)}\n\n"
        return None

    if event_type == "response.content_part.added":
        # 开始一个 text content block
        state.in_text_block = True
        block_start = {
            "type": "content_block_start",
            "index": state.content_block_index,
            "content_block": {"type": "text", "text": ""},
        }
        return f"event: content_block_start\ndata: {json.dumps(block_start)}\n\n"

    if event_type == "response.output_text.delta":
        delta_text = event_data.get("delta", "")
        if delta_text:
            if not state.in_text_block:
                # 自动开始 text block
                state.in_text_block = True
                block_start = {
                    "type": "content_block_start",
                    "index": state.content_block_index,
                    "content_block": {"type": "text", "text": ""},
                }
                delta = {
                    "type": "content_block_delta",
                    "index": state.content_block_index,
                    "delta": {"type": "text_delta", "text": delta_text},
                }
                return (
                    f"event: content_block_start\ndata: {json.dumps(block_start)}\n\n"
                    f"event: content_block_delta\ndata: {json.dumps(delta)}\n\n"
                )
            delta = {
                "type": "content_block_delta",
                "index": state.content_block_index,
                "delta": {"type": "text_delta", "text": delta_text},
            }
            return f"event: content_block_delta\ndata: {json.dumps(delta)}\n\n"
        return None

    if event_type == "response.content_part.done":
        if state.in_text_block:
            state.in_text_block = False
            block_stop = {
                "type": "content_block_stop",
                "index": state.content_block_index,
            }
            state.content_block_index += 1
            return f"event: content_block_stop\ndata: {json.dumps(block_stop)}\n\n"
        return None

    if event_type == "response.output_item.added":
        item = event_data.get("item", {})
        if item.get("type") == "function_call":
            state.has_tool_call = True
            state.anthropic_has_received_arguments_delta = False
            func_name = item.get("name", "")
            # 恢复原始工具名
            if reverse_name_map and func_name in reverse_name_map:
                func_name = reverse_name_map[func_name]
            call_id = item.get("call_id", item.get("id", ""))
            block_start = {
                "type": "content_block_start",
                "index": state.content_block_index,
                "content_block": {
                    "type": "tool_use",
                    "id": call_id,
                    "name": func_name,
                    "input": {},
                },
            }
            # 发送 content_block_start + 初始空 input_json_delta
            initial_delta = {
                "type": "content_block_delta",
                "index": state.content_block_index,
                "delta": {"type": "input_json_delta", "partial_json": ""},
            }
            return (
                f"event: content_block_start\ndata: {json.dumps(block_start)}\n\n"
                f"event: content_block_delta\ndata: {json.dumps(initial_delta)}\n\n"
            )
        return None

    if event_type == "response.function_call_arguments.delta":
        state.anthropic_has_received_arguments_delta = True
        delta_args = event_data.get("delta", "")
        if delta_args:
            delta = {
                "type": "content_block_delta",
                "index": state.content_block_index,
                "delta": {"type": "input_json_delta", "partial_json": delta_args},
            }
            return f"event: content_block_delta\ndata: {json.dumps(delta)}\n\n"
        return None

    if event_type == "response.function_call_arguments.done":
        # 回退：如果没有通过 delta 事件接收到参数，发送完整参数
        if not state.anthropic_has_received_arguments_delta:
            full_args = event_data.get("arguments", "")
            if full_args:
                delta = {
                    "type": "content_block_delta",
                    "index": state.content_block_index,
                    "delta": {"type": "input_json_delta", "partial_json": full_args},
                }
                return f"event: content_block_delta\ndata: {json.dumps(delta)}\n\n"
        return None

    if event_type == "response.output_item.done":
        item = event_data.get("item", {})
        if item.get("type") == "function_call":
            block_stop = {
                "type": "content_block_stop",
                "index": state.content_block_index,
            }
            state.content_block_index += 1
            return f"event: content_block_stop\ndata: {json.dumps(block_stop)}\n\n"
        return None

    if event_type == "response.completed":
        response = event_data.get("response", {})

        # 关闭任何未关闭的 block
        result = ""
        if state.in_text_block:
            state.in_text_block = False
            block_stop = {"type": "content_block_stop", "index": state.content_block_index}
            state.content_block_index += 1
            result += f"event: content_block_stop\ndata: {json.dumps(block_stop)}\n\n"

        # 确定 stop_reason (优先使用状态跟踪)
        stop_reason = "end_turn"
        if state.has_tool_call:
            stop_reason = "tool_use"
        else:
            codex_stop = response.get("stop_reason", "")
            if codex_stop == "max_tokens":
                stop_reason = "max_tokens"
            elif codex_stop == "stop":
                stop_reason = codex_stop

        # usage (包含 cache_read_input_tokens)
        usage_data = response.get("usage", {})
        input_tokens = usage_data.get("input_tokens", 0)
        output_tokens = usage_data.get("output_tokens", 0)
        cached_tokens = usage_data.get("input_tokens_details", {}).get("cached_tokens", 0)
        if cached_tokens > 0 and input_tokens >= cached_tokens:
            input_tokens -= cached_tokens

        usage = {"output_tokens": output_tokens}

        # message_delta
        msg_delta = {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": usage,
        }
        if cached_tokens > 0:
            msg_delta["usage"]["cache_read_input_tokens"] = cached_tokens
        result += f"event: message_delta\ndata: {json.dumps(msg_delta)}\n\n"

        # message_stop
        result += f"event: message_stop\ndata: {{\"type\": \"message_stop\"}}\n\n"

        return result

    return None
