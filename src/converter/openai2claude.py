"""
OpenAI Chat Completions -> Claude Messages API 请求转换
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from log import log
from src.converter.openai2gemini import _clean_schema_for_claude

DEFAULT_MAX_TOKENS = 32000


def _parse_data_url(url: str) -> Optional[Tuple[str, str]]:
    if not isinstance(url, str) or not url.startswith("data:"):
        return None
    try:
        header, data = url.split(",", 1)
        mime_type = header[5:].split(";")[0] or "image/png"
        return mime_type, data
    except ValueError:
        return None


def _extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    parts: List[str] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
    return "".join(parts)


def _convert_content_to_claude_blocks(content: Any) -> List[Dict[str, Any]]:
    if isinstance(content, str):
        return [{"type": "text", "text": content}]

    if not isinstance(content, list):
        return []

    blocks: List[Dict[str, Any]] = []
    for item in content:
        if not isinstance(item, dict):
            continue

        item_type = item.get("type")
        if item_type == "text":
            text = item.get("text")
            if isinstance(text, str):
                blocks.append({"type": "text", "text": text})
        elif item_type == "image":
            source = item.get("source") or {}
            source_type = source.get("type") if isinstance(source, dict) else None
            if source_type == "base64":
                mime_type = source.get("media_type") or "image/png"
                data = source.get("data")
                if isinstance(data, str) and data:
                    blocks.append(
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": data,
                            },
                        }
                    )
            elif source_type == "url":
                url = source.get("url")
                if isinstance(url, str) and url:
                    blocks.append({"type": "text", "text": url})
                    log.warning("[OPENAI->CLAUDE] 远程图片 URL 已降级为文本 URL")
        elif item_type in ("image_url", "input_image"):
            image_url = item.get("image_url") or {}
            if item_type == "input_image" and not image_url:
                image_url = item.get("source") or {}

            url = image_url.get("url") if isinstance(image_url, dict) else None
            parsed = _parse_data_url(url) if isinstance(url, str) else None
            if parsed:
                mime_type, data = parsed
                blocks.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": data,
                        },
                    }
                )
            elif isinstance(url, str) and url:
                # Claude Messages API 不支持直接远程 URL，这里降级为文本，避免整条请求被拒
                blocks.append({"type": "text", "text": url})
                log.warning("[OPENAI->CLAUDE] 非 data URL 图片已降级为文本 URL")

    return blocks


def _convert_tool_result_content(content: Any) -> Any:
    if isinstance(content, str):
        return content

    if isinstance(content, dict):
        blocks = _convert_content_to_claude_blocks([content])
        if blocks:
            return blocks
        text = content.get("text") if isinstance(content, dict) else None
        if isinstance(text, str):
            return [{"type": "text", "text": text}]
        return json.dumps(content, ensure_ascii=False)

    if isinstance(content, list):
        blocks: List[Dict[str, Any]] = []
        for item in content:
            if isinstance(item, str):
                blocks.append({"type": "text", "text": item})
                continue

            if isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    blocks.append({"type": "text", "text": item["text"]})
                    continue

                converted_blocks = _convert_content_to_claude_blocks([item])
                if converted_blocks:
                    blocks.extend(converted_blocks)
                    continue

                if isinstance(item.get("text"), str):
                    blocks.append({"type": "text", "text": item["text"]})
                    continue

                blocks.append({"type": "text", "text": json.dumps(item, ensure_ascii=False)})
                continue

            blocks.append({"type": "text", "text": json.dumps(item, ensure_ascii=False)})

        return blocks or json.dumps(content, ensure_ascii=False)

    if content is None:
        return ""
    return json.dumps(content, ensure_ascii=False)


def _parse_tool_arguments(arguments: Any) -> Dict[str, Any]:
    if isinstance(arguments, dict):
        return arguments
    if not isinstance(arguments, str) or not arguments.strip():
        return {}
    try:
        parsed = json.loads(arguments)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _convert_tool_calls(message: Dict[str, Any]) -> List[Dict[str, Any]]:
    tool_calls = message.get("tool_calls") or []
    blocks: List[Dict[str, Any]] = []
    for tool_call in tool_calls:
        if not isinstance(tool_call, dict):
            continue
        function = tool_call.get("function") or {}
        name = function.get("name")
        if not isinstance(name, str) or not name:
            continue
        blocks.append(
            {
                "type": "tool_use",
                "id": tool_call.get("id") or "",
                "name": name,
                "input": _parse_tool_arguments(function.get("arguments")),
            }
        )
    return blocks


def _convert_openai_message(message: Dict[str, Any]) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[str]]:
    role = message.get("role")
    if role == "system":
        return "system", None, _extract_text_from_content(message.get("content"))

    if role == "tool":
        tool_call_id = message.get("tool_call_id")
        if not isinstance(tool_call_id, str) or not tool_call_id:
            return None, None, None
        return (
            "message",
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_call_id,
                        "content": _convert_tool_result_content(message.get("content")),
                    }
                ],
            },
            None,
        )

    if role not in ("user", "assistant"):
        return None, None, None

    blocks = _convert_content_to_claude_blocks(message.get("content"))
    if role == "assistant":
        blocks.extend(_convert_tool_calls(message))

    if not blocks:
        blocks = [{"type": "text", "text": ""}]

    return "message", {"role": role, "content": blocks}, None


def _convert_openai_tools(tools: Any) -> List[Dict[str, Any]]:
    if not isinstance(tools, list):
        return []

    result: List[Dict[str, Any]] = []
    for tool in tools:
        if not isinstance(tool, dict) or tool.get("type") != "function":
            continue
        function = tool.get("function") or {}
        name = function.get("name")
        if not isinstance(name, str) or not name:
            continue
        input_schema = function.get("parameters") or {"type": "object", "properties": {}}
        cleaned_schema = _clean_schema_for_claude(input_schema)
        result.append(
            {
                "name": name,
                "description": function.get("description"),
                "input_schema": cleaned_schema,
            }
        )
    return result


def _convert_tool_choice(tool_choice: Any) -> Optional[Dict[str, Any]]:
    if isinstance(tool_choice, str):
        mapping = {
            "auto": {"type": "auto"},
            "none": {"type": "none"},
            "required": {"type": "any"},
        }
        return mapping.get(tool_choice)

    if isinstance(tool_choice, dict) and tool_choice.get("type") == "function":
        function = tool_choice.get("function") or {}
        name = function.get("name")
        if isinstance(name, str) and name:
            return {"type": "tool", "name": name}

    return None


def convert_openai_to_claude_request(
    openai_request: Dict[str, Any],
    *,
    model: Optional[str] = None,
    stream: Optional[bool] = None,
) -> Dict[str, Any]:
    """将 OpenAI Chat Completions 请求转换为 Claude Messages 请求"""
    claude_request: Dict[str, Any] = {
        "model": model or openai_request.get("model", ""),
        "messages": [],
        "max_tokens": openai_request.get("max_tokens") or DEFAULT_MAX_TOKENS,
        "stream": bool(openai_request.get("stream")) if stream is None else bool(stream),
    }

    if openai_request.get("temperature") is not None:
        claude_request["temperature"] = openai_request.get("temperature")
    if openai_request.get("top_p") is not None:
        claude_request["top_p"] = openai_request.get("top_p")
    if openai_request.get("top_k") is not None:
        claude_request["top_k"] = openai_request.get("top_k")

    stop = openai_request.get("stop")
    if isinstance(stop, str) and stop:
        claude_request["stop_sequences"] = [stop]
    elif isinstance(stop, list):
        stop_sequences = [item for item in stop if isinstance(item, str) and item]
        if stop_sequences:
            claude_request["stop_sequences"] = stop_sequences

    system_parts: List[Dict[str, str]] = []
    for message in openai_request.get("messages", []):
        kind, converted, system_text = _convert_openai_message(message)
        if kind == "system" and system_text:
            system_parts.append({"type": "text", "text": system_text})
        elif kind == "message" and converted:
            claude_request["messages"].append(converted)

    if system_parts:
        claude_request["system"] = system_parts

    tools = _convert_openai_tools(openai_request.get("tools"))
    if tools:
        claude_request["tools"] = tools

    tool_choice = _convert_tool_choice(openai_request.get("tool_choice"))
    if tool_choice:
        claude_request["tool_choice"] = tool_choice

    return claude_request
