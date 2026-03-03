"""
Model List Router - Provides model list for Codex channel
提供 Codex 渠道的模型列表
"""

import time
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from log import log
from src.utils import authenticate_bearer

router = APIRouter()

# Codex 模型定义：(模型名, 支持的思考等级列表)
# 参考 CLIProxyAPI 的 model_definitions_static_data.go
CODEX_MODEL_DEFINITIONS: List[Tuple[str, List[str]]] = [
    # GPT-5 系列
    ("gpt-5", ["minimal", "low", "medium", "high"]),
    ("gpt-5-codex", ["low", "medium", "high"]),
    ("gpt-5-codex-mini", ["low", "medium", "high"]),
    ("gpt-5.1", ["none", "low", "medium", "high"]),
    ("gpt-5.1-codex", ["low", "medium", "high"]),
    ("gpt-5.1-codex-mini", ["low", "medium", "high"]),
    ("gpt-5.1-codex-max", ["low", "medium", "high", "xhigh"]),
    ("gpt-5.2", ["none", "low", "medium", "high", "xhigh"]),
    ("gpt-5.2-codex", ["low", "medium", "high", "xhigh"]),
    ("gpt-5.3-codex", ["low", "medium", "high", "xhigh"]),
    ("gpt-5.3-codex-spark", ["low", "medium", "high", "xhigh"]),
    # GPT-4.1 系列
    ("gpt-4.1-nano", []),
]


def _get_all_model_ids() -> List[str]:
    """生成所有模型ID（包含思考等级后缀变体）"""
    model_ids = []
    for base_model, levels in CODEX_MODEL_DEFINITIONS:
        # 基础模型
        model_ids.append(base_model)
        # 思考等级后缀变体
        for level in levels:
            model_ids.append(f"{base_model}({level})")
    return model_ids


@router.get("/codex/v1/models")
async def list_models(token: str = Depends(authenticate_bearer)):
    """
    返回 Codex 渠道支持的模型列表（OpenAI 格式）
    """
    models = []
    for model_id in _get_all_model_ids():
        models.append({
            "id": model_id,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "openai",
        })

    return JSONResponse(content={
        "object": "list",
        "data": models,
    })
