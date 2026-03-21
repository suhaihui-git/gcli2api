"""
Utilities for normalizing downstream errors to the OpenAI error schema.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi.responses import JSONResponse


_OPENAI_EXACT_PATHS = {
    "/v1/chat/completions",
    "/v1/models",
    "/antigravity/v1/chat/completions",
    "/antigravity/v1/models",
    "/codex/v1/chat/completions",
    "/codex/v1/models",
    "/codex/v1/responses",
    "/claude/v1/chat/completions",
    "/claude/v1/models",
}

_STATUS_TO_TYPE = {
    400: "invalid_request_error",
    401: "invalid_request_error",
    403: "invalid_request_error",
    404: "invalid_request_error",
    409: "invalid_request_error",
    422: "invalid_request_error",
    429: "rate_limit_error",
    500: "server_error",
    502: "server_error",
    503: "server_error",
    504: "server_error",
}

_STATUS_TO_CODE = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "unprocessable_entity",
    429: "rate_limit_exceeded",
    500: "internal_server_error",
    502: "bad_gateway",
    503: "service_unavailable",
    504: "gateway_timeout",
}

_UPSTREAM_STATUS_TO_TYPE = {
    "INVALID_ARGUMENT": "invalid_request_error",
    "FAILED_PRECONDITION": "invalid_request_error",
    "OUT_OF_RANGE": "invalid_request_error",
    "NOT_FOUND": "invalid_request_error",
    "ALREADY_EXISTS": "invalid_request_error",
    "UNAUTHENTICATED": "invalid_request_error",
    "PERMISSION_DENIED": "invalid_request_error",
    "RESOURCE_EXHAUSTED": "rate_limit_error",
    "UNAVAILABLE": "server_error",
    "DEADLINE_EXCEEDED": "server_error",
    "INTERNAL": "server_error",
    "UNKNOWN": "server_error",
    "DATA_LOSS": "server_error",
}

_ALLOWED_ERROR_TYPES = {
    "invalid_request_error",
    "authentication_error",
    "permission_error",
    "not_found_error",
    "conflict_error",
    "rate_limit_error",
    "server_error",
}

_ERROR_TYPE_ALIASES = {
    "api_error": "server_error",
    "internal_error": "server_error",
}


def is_openai_compatible_path(path: str) -> bool:
    """Return True when the request path should use OpenAI-style errors."""
    return path in _OPENAI_EXACT_PATHS


def build_openai_error(
    message: Optional[str],
    status_code: int = 500,
    error_type: Optional[str] = None,
    param: Optional[str] = None,
    code: Optional[str] = None,
) -> dict[str, Any]:
    """Build a normalized OpenAI error object."""
    final_message = str(message or "Internal server error")
    final_type = error_type or _STATUS_TO_TYPE.get(status_code, "server_error")
    final_code = code or _STATUS_TO_CODE.get(status_code, "error")
    return {
        "error": {
            "message": final_message,
            "type": final_type,
            "param": param,
            "code": final_code,
        }
    }


def _extract_message_from_validation_detail(detail: list[Any]) -> Optional[str]:
    messages: list[str] = []
    for item in detail[:3]:
        if not isinstance(item, dict):
            continue
        loc = item.get("loc", [])
        loc_str = ".".join(str(part) for part in loc if part != "body")
        msg = item.get("msg")
        if loc_str and msg:
            messages.append(f"{loc_str}: {msg}")
        elif msg:
            messages.append(str(msg))
    if not messages:
        return None
    return "Invalid request body: " + "; ".join(messages)


def _extract_param_from_details(details: Any) -> Optional[str]:
    if not isinstance(details, list):
        return None
    for detail in details:
        if not isinstance(detail, dict):
            continue
        violations = detail.get("fieldViolations") or detail.get("field_violations")
        if not isinstance(violations, list):
            continue
        for violation in violations:
            if not isinstance(violation, dict):
                continue
            field = violation.get("field")
            if field:
                return str(field)
    return None


def _extract_openai_error_fields(
    payload: Any,
    status_code: int,
    default_message: str,
) -> tuple[str, str, Optional[str], str]:
    if isinstance(payload, dict) and isinstance(payload.get("response"), dict):
        response_payload = payload["response"]
        if "error" in response_payload:
            payload = response_payload

    if isinstance(payload, dict):
        if isinstance(payload.get("error"), dict):
            error_obj = payload["error"]
            message = str(error_obj.get("message") or default_message)
            upstream_status = error_obj.get("status")
            raw_code = error_obj.get("code")

            inferred_status_code = status_code
            if isinstance(raw_code, int):
                inferred_status_code = raw_code
            elif isinstance(raw_code, str) and raw_code.isdigit():
                inferred_status_code = int(raw_code)

            error_type = error_obj.get("type")
            if isinstance(error_type, str) and error_type:
                error_type = _ERROR_TYPE_ALIASES.get(error_type, error_type)
                if error_type not in _ALLOWED_ERROR_TYPES:
                    error_type = None
            if not error_type and isinstance(upstream_status, str):
                error_type = _UPSTREAM_STATUS_TO_TYPE.get(upstream_status.upper())
            if not error_type:
                error_type = _STATUS_TO_TYPE.get(inferred_status_code, "server_error")

            param = error_obj.get("param")
            if param is None:
                param = _extract_param_from_details(error_obj.get("details"))

            code: Optional[str]
            if isinstance(raw_code, str) and raw_code:
                if raw_code.isdigit():
                    code = _STATUS_TO_CODE.get(int(raw_code), raw_code)
                else:
                    code = raw_code
            elif isinstance(raw_code, int):
                code = _STATUS_TO_CODE.get(raw_code, str(raw_code))
            elif isinstance(upstream_status, str) and upstream_status:
                code = upstream_status.lower()
            else:
                code = _STATUS_TO_CODE.get(status_code, "error")

            return message, error_type, param, code

        if isinstance(payload.get("error"), str):
            return (
                str(payload["error"]),
                _STATUS_TO_TYPE.get(status_code, "server_error"),
                None,
                _STATUS_TO_CODE.get(status_code, "error"),
            )

        if "detail" in payload:
            detail = payload["detail"]
            if isinstance(detail, list):
                message = _extract_message_from_validation_detail(detail) or default_message
                return message, "invalid_request_error", None, _STATUS_TO_CODE.get(status_code, "error")
            if isinstance(detail, dict):
                message = str(detail.get("message") or default_message)
                return (
                    message,
                    _STATUS_TO_TYPE.get(status_code, "server_error"),
                    detail.get("param"),
                    str(detail.get("code") or _STATUS_TO_CODE.get(status_code, "error")),
                )
            return (
                str(detail),
                _STATUS_TO_TYPE.get(status_code, "server_error"),
                None,
                _STATUS_TO_CODE.get(status_code, "error"),
            )

        if "message" in payload:
            return (
                str(payload["message"]),
                _STATUS_TO_TYPE.get(status_code, "server_error"),
                None,
                _STATUS_TO_CODE.get(status_code, "error"),
            )

    if isinstance(payload, bytes):
        try:
            payload = payload.decode("utf-8")
        except Exception:
            payload = payload.decode("utf-8", errors="ignore")

    if isinstance(payload, str):
        stripped = payload.strip()
        if stripped:
            try:
                return _extract_openai_error_fields(json.loads(stripped), status_code, default_message)
            except Exception:
                return (
                    stripped,
                    _STATUS_TO_TYPE.get(status_code, "server_error"),
                    None,
                    _STATUS_TO_CODE.get(status_code, "error"),
                )

    return (
        default_message,
        _STATUS_TO_TYPE.get(status_code, "server_error"),
        None,
        _STATUS_TO_CODE.get(status_code, "error"),
    )


def normalize_openai_error(
    payload: Any = None,
    *,
    status_code: int = 500,
    default_message: str = "Internal server error",
) -> dict[str, Any]:
    """Normalize arbitrary payloads into the OpenAI error schema."""
    message, error_type, param, code = _extract_openai_error_fields(
        payload,
        status_code,
        default_message,
    )
    return build_openai_error(
        message,
        status_code=status_code,
        error_type=error_type,
        param=param,
        code=code,
    )


def openai_error_response(
    payload: Any = None,
    *,
    status_code: int = 500,
    default_message: str = "Internal server error",
    headers: Optional[dict[str, str]] = None,
) -> JSONResponse:
    """Create a JSONResponse with a normalized OpenAI error body."""
    return JSONResponse(
        content=normalize_openai_error(
            payload,
            status_code=status_code,
            default_message=default_message,
        ),
        status_code=status_code,
        headers=headers,
    )


def openai_error_sse_bytes(
    payload: Any = None,
    *,
    status_code: int = 500,
    default_message: str = "Internal server error",
    event: Optional[str] = None,
) -> bytes:
    """Serialize a normalized OpenAI error object as an SSE event."""
    error_payload = normalize_openai_error(
        payload,
        status_code=status_code,
        default_message=default_message,
    )
    data = json.dumps(error_payload, ensure_ascii=False)
    if event:
        return f"event: {event}\ndata: {data}\n\n".encode("utf-8")
    return f"data: {data}\n\n".encode("utf-8")
