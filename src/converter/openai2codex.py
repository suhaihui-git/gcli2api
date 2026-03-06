"""
OpenAI Chat Completions → Codex Responses API 格式转换器
参考 CLIProxyAPI 的 codex_openai_request.go 实现
"""

import json
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from log import log


# 有效的思考等级
VALID_THINKING_LEVELS = {"none", "auto", "minimal", "low", "medium", "high", "xhigh"}


def parse_model_thinking_suffix(model: str) -> Tuple[str, Optional[str]]:
    """
    解析模型名称中的思考等级后缀

    例如:
        "gpt-5.2(high)"    -> ("gpt-5.2", "high")
        "gpt-5.2(xhigh)"   -> ("gpt-5.2", "xhigh")
        "gpt-5.2(8192)"    -> ("gpt-5.2", "medium")  # 数值转换为最近的等级
        "gpt-5.2(none)"    -> ("gpt-5.2", "none")
        "gpt-5.2"          -> ("gpt-5.2", None)

    Returns:
        (base_model, thinking_level) 元组
    """
    match = re.match(r'^(.+?)\(([^)]+)\)$', model)
    if not match:
        return model, None

    base_model = match.group(1)
    suffix = match.group(2).strip().lower()

    if suffix in VALID_THINKING_LEVELS:
        return base_model, suffix

    # 尝试数值 -> 等级转换
    try:
        budget = int(suffix)
        if budget <= 0:
            return base_model, "none"
        elif budget <= 512:
            return base_model, "minimal"
        elif budget <= 1024:
            return base_model, "low"
        elif budget <= 8192:
            return base_model, "medium"
        elif budget <= 24576:
            return base_model, "high"
        else:
            return base_model, "xhigh"
    except ValueError:
        # 无法识别的后缀，忽略
        log.warning(f"无法识别的模型思考等级后缀: {suffix}")
        return model, None


def convert_openai_to_codex_request(
    openai_request: Dict[str, Any],
    model: str,
    stream: bool = True,
) -> Dict[str, Any]:
    """
    将 OpenAI Chat Completions 格式请求转换为 Codex Responses API 格式

    Args:
        openai_request: OpenAI 格式的请求体
        model: 模型名称（可能包含思考等级后缀如 "gpt-5(high)"）
        stream: 是否流式

    Returns:
        Codex Responses API 格式的请求体
    """
    # 解析模型名称中的思考等级后缀
    base_model, thinking_level = parse_model_thinking_suffix(model)

    codex_request = {
        "model": base_model,
        "instructions": "",
        "stream": stream,
        "store": False,
    }

    # 转换 messages → input
    messages = openai_request.get("messages", [])
    codex_input = _convert_messages_to_input(messages)
    codex_request["input"] = codex_input

    # 转换 tools
    tools = openai_request.get("tools")
    if tools:
        codex_tools = _convert_tools(tools)
        if codex_tools:
            codex_request["tools"] = codex_tools
            codex_request["parallel_tool_calls"] = True

    # 设置 reasoning 配置
    # 优先级: 请求中的 reasoning_effort > 模型名后缀
    # 不再默认 medium —— 对不支持 reasoning 的模型（如 gpt-5.2），不发送该参数
    effort = None
    if thinking_level:
        effort = thinking_level
    # 检查请求中是否有 reasoning_effort 参数
    req_effort = openai_request.get("reasoning_effort")
    if req_effort and str(req_effort).lower() in VALID_THINKING_LEVELS:
        effort = str(req_effort).lower()

    if effort and effort != "none":
        codex_request["reasoning"] = {
            "effort": effort,
            "summary": "auto",
        }
        codex_request["include"] = ["reasoning.encrypted_content"]

    # 转换 tool_choice
    tool_choice = openai_request.get("tool_choice")
    if tool_choice is not None:
        if isinstance(tool_choice, str):
            codex_request["tool_choice"] = tool_choice
        elif isinstance(tool_choice, dict):
            tc_type = tool_choice.get("type", "")
            if tc_type == "function":
                name = tool_choice.get("function", {}).get("name", "")
                if name:
                    name = _shorten_name_if_needed(name)
                choice = {"type": "function"}
                if name:
                    choice["name"] = name
                codex_request["tool_choice"] = choice
            elif tc_type:
                codex_request["tool_choice"] = tool_choice

    # 转换 response_format / text.verbosity
    text_config = {}

    response_format = openai_request.get("response_format")
    if response_format:
        format_type = response_format.get("type")
        if format_type == "json_schema":
            text_config["format"] = response_format
        elif format_type == "json_object":
            text_config["format"] = {"type": "json_object"}

    text_options = openai_request.get("text")
    if isinstance(text_options, dict):
        verbosity = text_options.get("verbosity")
        if verbosity is not None:
            text_config["verbosity"] = verbosity

    if text_config:
        codex_request["text"] = text_config

    return codex_request


def _convert_messages_to_input(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """将 OpenAI messages 数组转换为 Codex input 数组"""
    codex_input = []
    # 用于匹配 tool_call_id 的队列
    pending_tool_calls = {}

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content")

        if role == "system":
            # system → developer
            input_item = {
                "type": "message",
                "role": "developer",
                "content": _make_content_parts(content, "input_text"),
            }
            codex_input.append(input_item)

        elif role == "user":
            input_item = {
                "type": "message",
                "role": "user",
                "content": _make_content_parts(content, "input_text"),
            }
            codex_input.append(input_item)

        elif role == "assistant":
            # assistant 消息可能包含文本和/或 tool_calls
            if content:
                input_item = {
                    "type": "message",
                    "role": "assistant",
                    "content": _make_content_parts(content, "output_text"),
                }
                codex_input.append(input_item)

            # 处理 tool_calls
            tool_calls = msg.get("tool_calls", [])
            for tc in tool_calls:
                tc_id = tc.get("id", str(uuid.uuid4()))
                func = tc.get("function", {})
                func_name = func.get("name", "")
                func_args = func.get("arguments", "")

                call_item = {
                    "type": "function_call",
                    "id": tc_id,
                    "call_id": tc_id,
                    "name": func_name,
                    "arguments": func_args,
                }
                codex_input.append(call_item)
                pending_tool_calls[tc_id] = func_name

        elif role == "tool":
            # tool → function_call_output
            tool_call_id = msg.get("tool_call_id", "")
            output_content = content if isinstance(content, str) else json.dumps(content)

            output_item = {
                "type": "function_call_output",
                "call_id": tool_call_id,
                "output": output_content,
            }
            codex_input.append(output_item)

    return codex_input


def _make_content_parts(content: Any, text_type: str) -> List[Dict[str, Any]]:
    """将内容转换为 Codex content parts 格式"""
    if content is None:
        return []

    if isinstance(content, str):
        return [{"type": text_type, "text": content}]

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append({"type": text_type, "text": item})
            elif isinstance(item, dict):
                item_type = item.get("type", "text")
                if item_type == "text":
                    parts.append({"type": text_type, "text": item.get("text", "")})
                elif item_type == "image_url":
                    # 传递图片URL
                    image_url = item.get("image_url", {})
                    url = image_url.get("url", "") if isinstance(image_url, dict) else str(image_url)
                    parts.append({
                        "type": "input_image",
                        "image_url": url,
                    })
                elif item_type == "file":
                    file_info = item.get("file", {})
                    if isinstance(file_info, dict):
                        file_data = file_info.get("file_data")
                        if file_data:
                            file_part = {
                                "type": "input_file",
                                "file_data": file_data,
                            }
                            filename = file_info.get("filename")
                            if filename:
                                file_part["filename"] = filename
                            parts.append(file_part)
        return parts

    return [{"type": text_type, "text": str(content)}]


def _convert_tools(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """将 OpenAI tools 格式转换为 Codex tools 格式"""
    codex_tools = []
    # 构建工具名缩短映射
    names = []
    for tool in tools:
        if tool.get("type") == "function":
            func = tool.get("function", {})
            name = func.get("name", "")
            if name:
                names.append(name)
    short_name_map = _build_short_name_map(names) if names else {}

    for tool in tools:
        tool_type = tool.get("type", "")
        # 非 function 类型工具直接透传 (如 web_search)
        if tool_type and tool_type != "function":
            codex_tools.append(tool)
            continue

        if tool_type == "function":
            func = tool.get("function", {})
            name = func.get("name", "")
            # 应用缩短映射
            if name in short_name_map:
                name = short_name_map[name]
            else:
                name = _shorten_name_if_needed(name)
            codex_tool = {
                "type": "function",
                "name": name,
                "description": func.get("description", ""),
                "parameters": _normalize_tool_parameters(func.get("parameters", {})),
                "strict": False,
            }
            codex_tools.append(codex_tool)
    return codex_tools


def convert_anthropic_to_codex_request(
    anthropic_request: Dict[str, Any],
    model: str,
    stream: bool = True,
) -> Dict[str, Any]:
    """
    将 Anthropic Messages 格式请求转换为 Codex Responses API 格式

    Args:
        anthropic_request: Anthropic 格式的请求体
        model: 模型名称（可能包含思考等级后缀如 "gpt-5(high)"）
        stream: 是否流式

    Returns:
        Codex Responses API 格式的请求体
    """
    # 解析模型名称中的思考等级后缀
    base_model, thinking_level = parse_model_thinking_suffix(model)
    effort = thinking_level  # None if no suffix

    # 从 Claude thinking 配置映射 reasoning effort
    thinking_config = anthropic_request.get("thinking")
    if thinking_config and isinstance(thinking_config, dict):
        thinking_type = thinking_config.get("type", "")
        if thinking_type == "enabled":
            budget = thinking_config.get("budget_tokens", 0)
            if isinstance(budget, int):
                effort = _convert_budget_to_level(budget)
        elif thinking_type in ("adaptive", "auto"):
            effort = "xhigh"
        elif thinking_type == "disabled":
            effort = "none"

    codex_request = {
        "model": base_model,
        "instructions": "",
        "stream": stream,
        "store": False,
    }

    # 仅在有明确 thinking 配置时才添加 reasoning（避免对不支持的模型发送该参数）
    if effort and effort != "none":
        codex_request["reasoning"] = {
            "effort": effort,
            "summary": "auto",
        }
        codex_request["include"] = ["reasoning.encrypted_content"]

    # 构建工具名缩短映射
    tools = anthropic_request.get("tools", [])
    tool_names = [t.get("name", "") for t in tools if t.get("name")] if tools else []
    short_name_map = _build_short_name_map(tool_names) if tool_names else {}

    codex_input = []

    # 处理 system prompt
    system = anthropic_request.get("system")
    if system:
        if isinstance(system, str):
            codex_input.append({
                "type": "message",
                "role": "developer",
                "content": [{"type": "input_text", "text": system}],
            })
        elif isinstance(system, list):
            text_parts = []
            for part in system:
                if isinstance(part, dict) and part.get("type") == "text":
                    text = part.get("text", "")
                    if text.startswith("x-anthropic-billing-header: "):
                        continue
                    text_parts.append(text)
                elif isinstance(part, str):
                    text_parts.append(part)
            if text_parts:
                codex_input.append({
                    "type": "message",
                    "role": "developer",
                    "content": [{"type": "input_text", "text": "\n".join(text_parts)}],
                })

    # 处理 messages
    messages = anthropic_request.get("messages", [])
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content")

        if role == "user":
            # 用户消息：需要将 tool_result 提取为顶层 item，其余为 message content
            if isinstance(content, str):
                codex_input.append({
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": content}],
                })
            elif isinstance(content, list):
                # 参考 CLIProxyAPI: flush message before/after tool_result
                current_parts = []
                for block in content:
                    if isinstance(block, str):
                        current_parts.append({"type": "input_text", "text": block})
                    elif isinstance(block, dict):
                        block_type = block.get("type", "")
                        if block_type == "text":
                            current_parts.append({"type": "input_text", "text": block.get("text", "")})
                        elif block_type == "image":
                            source = block.get("source", {})
                            data = source.get("data", "") or source.get("base64", "")
                            if data:
                                media_type = source.get("media_type", "") or source.get("mime_type", "")
                                if not media_type:
                                    media_type = "application/octet-stream"
                                current_parts.append({
                                    "type": "input_image",
                                    "image_url": f"data:{media_type};base64,{data}",
                                })
                        elif block_type == "tool_result":
                            # 先 flush 当前积累的 message parts
                            if current_parts:
                                codex_input.append({"type": "message", "role": "user", "content": current_parts})
                                current_parts = []
                            # tool_result 作为顶层 function_call_output
                            tool_use_id = block.get("tool_use_id", "")
                            result_content = block.get("content", "")
                            if isinstance(result_content, list):
                                texts = [p.get("text", "") for p in result_content if isinstance(p, dict) and p.get("type") == "text"]
                                result_content = "\n".join(texts)
                            codex_input.append({
                                "type": "function_call_output",
                                "call_id": tool_use_id,
                                "output": str(result_content),
                            })
                # flush 剩余 parts
                if current_parts:
                    codex_input.append({"type": "message", "role": "user", "content": current_parts})

        elif role == "assistant":
            if isinstance(content, str):
                codex_input.append({
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": content}],
                })
            elif isinstance(content, list):
                current_parts = []
                for block in content:
                    if isinstance(block, dict):
                        block_type = block.get("type", "")
                        if block_type == "text":
                            current_parts.append({"type": "output_text", "text": block.get("text", "")})
                        elif block_type == "tool_use":
                            # flush 当前文本 parts
                            if current_parts:
                                codex_input.append({"type": "message", "role": "assistant", "content": current_parts})
                                current_parts = []
                            tool_id = block.get("id", str(uuid.uuid4()))
                            name = block.get("name", "")
                            if name in short_name_map:
                                name = short_name_map[name]
                            else:
                                name = _shorten_name_if_needed(name)
                            codex_input.append({
                                "type": "function_call",
                                "call_id": tool_id,
                                "name": name,
                                "arguments": json.dumps(block.get("input", {})),
                            })
                        elif block_type == "tool_result":
                            if current_parts:
                                codex_input.append({"type": "message", "role": "assistant", "content": current_parts})
                                current_parts = []
                            tool_use_id = block.get("tool_use_id", "")
                            result_content = block.get("content", "")
                            if isinstance(result_content, list):
                                texts = [p.get("text", "") for p in result_content if isinstance(p, dict) and p.get("type") == "text"]
                                result_content = "\n".join(texts)
                            codex_input.append({
                                "type": "function_call_output",
                                "call_id": tool_use_id,
                                "output": str(result_content),
                            })
                if current_parts:
                    codex_input.append({"type": "message", "role": "assistant", "content": current_parts})

    codex_request["input"] = codex_input

    # 转换 tools
    if tools:
        codex_tools = []
        for tool in tools:
            # 特殊处理: Claude web_search_20250305 → Codex web_search
            if tool.get("type") == "web_search_20250305":
                codex_tools.append({"type": "web_search"})
                continue
            name = tool.get("name", "")
            if name in short_name_map:
                name = short_name_map[name]
            else:
                name = _shorten_name_if_needed(name)
            codex_tools.append({
                "type": "function",
                "name": name,
                "description": tool.get("description", ""),
                "parameters": _normalize_tool_parameters(tool.get("input_schema", {})),
                "strict": False,
            })
        if codex_tools:
            codex_request["tools"] = codex_tools
            codex_request["tool_choice"] = "auto"
            codex_request["parallel_tool_calls"] = True

    return codex_request


def _convert_budget_to_level(budget: int) -> str:
    """将 Claude thinking budget_tokens 转换为 Codex reasoning effort 等级"""
    if budget <= 0:
        return "none"
    elif budget <= 512:
        return "minimal"
    elif budget <= 1024:
        return "low"
    elif budget <= 8192:
        return "medium"
    elif budget <= 24576:
        return "high"
    else:
        return "xhigh"


def _shorten_name_if_needed(name: str) -> str:
    """
    缩短工具名称到64字符以内
    参考 CLIProxyAPI shortenNameIfNeeded
    """
    limit = 64
    if len(name) <= limit:
        return name
    if name.startswith("mcp__"):
        idx = name.rfind("__")
        if idx > 0:
            candidate = "mcp__" + name[idx + 2:]
            if len(candidate) > limit:
                return candidate[:limit]
            return candidate
    return name[:limit]


def _build_short_name_map(names: List[str]) -> Dict[str, str]:
    """
    构建唯一的缩短名称映射
    参考 CLIProxyAPI buildShortNameMap
    """
    limit = 64
    used = set()
    m = {}

    def base_candidate(n: str) -> str:
        if len(n) <= limit:
            return n
        if n.startswith("mcp__"):
            idx = n.rfind("__")
            if idx > 0:
                cand = "mcp__" + n[idx + 2:]
                if len(cand) > limit:
                    cand = cand[:limit]
                return cand
        return n[:limit]

    def make_unique(cand: str) -> str:
        if cand not in used:
            return cand
        base = cand
        i = 1
        while True:
            suffix = f"_{i}"
            allowed = limit - len(suffix)
            if allowed < 0:
                allowed = 0
            tmp = base[:allowed] + suffix
            if tmp not in used:
                return tmp
            i += 1

    for n in names:
        cand = base_candidate(n)
        uniq = make_unique(cand)
        used.add(uniq)
        m[n] = uniq
    return m


def _build_reverse_name_map_openai(original_request: Dict[str, Any]) -> Dict[str, str]:
    """
    从原始 OpenAI 请求构建 缩短名 -> 原始名 的反向映射
    用于响应转换时恢复原始工具名
    """
    tools = original_request.get("tools", [])
    if not tools:
        return {}
    names = []
    for tool in tools:
        if tool.get("type") == "function":
            func = tool.get("function", {})
            name = func.get("name", "")
            if name:
                names.append(name)
    if not names:
        return {}
    short_map = _build_short_name_map(names)
    return {short: orig for orig, short in short_map.items()}


def _build_reverse_name_map_anthropic(original_request: Dict[str, Any]) -> Dict[str, str]:
    """
    从原始 Anthropic 请求构建 缩短名 -> 原始名 的反向映射
    """
    tools = original_request.get("tools", [])
    if not tools:
        return {}
    names = [t.get("name", "") for t in tools if t.get("name")]
    if not names:
        return {}
    short_map = _build_short_name_map(names)
    return {short: orig for orig, short in short_map.items()}


def _normalize_tool_parameters(params: Any) -> Dict[str, Any]:
    """
    规范化工具参数 schema
    参考 CLIProxyAPI normalizeToolParameters
    """
    if params is None or params == "null":
        return {"type": "object", "properties": {}}
    if not isinstance(params, dict):
        return {"type": "object", "properties": {}}
    result = dict(params)
    # 移除 $schema
    result.pop("$schema", None)
    if "type" not in result:
        result["type"] = "object"
    if result.get("type") == "object" and "properties" not in result:
        result["properties"] = {}
    return result


def _convert_anthropic_content(content: Any, text_type: str) -> List[Dict[str, Any]]:
    """将 Anthropic content 转换为 Codex content parts"""
    if isinstance(content, str):
        return [{"type": text_type, "text": content}]

    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append({"type": text_type, "text": block})
            elif isinstance(block, dict):
                block_type = block.get("type", "")
                if block_type == "text":
                    parts.append({"type": text_type, "text": block.get("text", "")})
                elif block_type == "image":
                    source = block.get("source", {})
                    if source.get("type") == "base64":
                        media_type = source.get("media_type", "image/png")
                        data = source.get("data", "")
                        parts.append({
                            "type": "input_image",
                            "image_url": f"data:{media_type};base64,{data}",
                        })
                elif block_type == "tool_result":
                    # tool_result 在 user 消息中
                    tool_use_id = block.get("tool_use_id", "")
                    result_content = block.get("content", "")
                    if isinstance(result_content, list):
                        texts = [p.get("text", "") for p in result_content if isinstance(p, dict) and p.get("type") == "text"]
                        result_content = "\n".join(texts)
                    parts.append({
                        "type": "function_call_output",
                        "call_id": tool_use_id,
                        "output": str(result_content),
                    })
        return parts

    return [{"type": text_type, "text": str(content)}]
