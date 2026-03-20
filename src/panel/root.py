"""
根路由模块 - 处理控制面板主页
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from log import log
from .utils import is_mobile_user_agent


# 创建路由器
router = APIRouter(tags=["root"])

HTML_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@router.get("/", response_class=HTMLResponse)
async def serve_control_panel(request: Request):
    """提供统一控制面板"""
    try:
        index_path = Path("front/index.html")
        if index_path.exists():
            return HTMLResponse(
                content=index_path.read_text(encoding="utf-8"),
                headers=HTML_NO_CACHE_HEADERS,
            )

        user_agent = request.headers.get("user-agent", "")
        html_file_path = (
            Path("front/control_panel_mobile.html")
            if is_mobile_user_agent(user_agent)
            else Path("front/control_panel.html")
        )

        if html_file_path.exists():
            return HTMLResponse(
                content=html_file_path.read_text(encoding="utf-8"),
                headers=HTML_NO_CACHE_HEADERS,
            )

        raise FileNotFoundError("front/index.html 与旧控制面板入口文件均不存在")

    except Exception as e:
        log.error(f"加载控制面板页面失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")
