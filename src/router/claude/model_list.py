"""
Claude Model List Router - Provides model list for Claude channel
"""

import time
from typing import List

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from src.utils import authenticate_bearer

router = APIRouter()

CLAUDE_MODEL_IDS: List[str] = [
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-latest",
    "claude-sonnet-4-5",
    "claude-opus-4-1",
]


@router.get("/claude/v1/models")
async def list_models(token: str = Depends(authenticate_bearer)):
    """返回 Claude 渠道支持的模型列表（OpenAI 格式）"""
    created = int(time.time())
    return JSONResponse(
        content={
            "object": "list",
            "data": [
                {
                    "id": model_id,
                    "object": "model",
                    "created": created,
                    "owned_by": "anthropic",
                }
                for model_id in CLAUDE_MODEL_IDS
            ],
        }
    )
