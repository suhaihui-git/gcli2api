"""
Main Web Integration - Integrates all routers and modules
集合router并开启主服务
"""

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from config import get_server_host, get_server_port
from log import log
from src.openai_errors import is_openai_compatible_path, openai_error_response

# Import managers and utilities
from src.credential_manager import credential_manager

# Import all routers
from src.router.antigravity.openai import router as antigravity_openai_router
from src.router.antigravity.gemini import router as antigravity_gemini_router
from src.router.antigravity.anthropic import router as antigravity_anthropic_router
from src.router.antigravity.model_list import router as antigravity_model_list_router
from src.router.geminicli.openai import router as geminicli_openai_router
from src.router.geminicli.gemini import router as geminicli_gemini_router
from src.router.geminicli.anthropic import router as geminicli_anthropic_router
from src.router.geminicli.model_list import router as geminicli_model_list_router
from src.router.codex.openai import router as codex_openai_router
from src.router.codex.anthropic import router as codex_anthropic_router
from src.router.codex.responses import router as codex_responses_router
from src.router.codex.model_list import router as codex_model_list_router
from src.router.claude.openai import router as claude_openai_router
from src.router.claude.anthropic import router as claude_anthropic_router
from src.router.claude.model_list import router as claude_model_list_router
from src.task_manager import shutdown_all_tasks
from src.panel import router as panel_router
from src.keeplive import keepalive_service

# 全局凭证管理器
global_credential_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global global_credential_manager

    log.info("启动 Gemini API Pool 主服务")

    # 初始化配置缓存（优先执行）
    try:
        import config
        await config.init_config()
        log.info("配置缓存初始化成功")
    except Exception as e:
        log.error(f"配置缓存初始化失败: {e}")

    # 初始化全局凭证管理器（通过单例工厂）
    try:
        # credential_manager 会在第一次调用时自动初始化
        # 这里预先触发初始化以便在启动时检测错误
        await credential_manager._get_or_create()
        log.info("凭证管理器初始化成功")
    except Exception as e:
        log.error(f"凭证管理器初始化失败: {e}")
        global_credential_manager = None

    # OAuth回调服务器将在需要时按需启动

    # 启动保活服务（未配置URL时自动跳过，零开销）
    try:
        await keepalive_service.start()
    except Exception as e:
        log.error(f"保活服务启动失败: {e}")

    yield

    # 清理资源
    log.info("开始关闭 Gemini API Pool 主服务")

    # 停止保活服务
    try:
        await keepalive_service.stop()
    except Exception as e:
        log.error(f"关闭保活服务时出错: {e}")

    # 首先关闭所有异步任务
    try:
        await shutdown_all_tasks(timeout=10.0)
        log.info("所有异步任务已关闭")
    except Exception as e:
        log.error(f"关闭异步任务时出错: {e}")

    # 然后关闭凭证管理器
    if global_credential_manager:
        try:
            await global_credential_manager.close()
            log.info("凭证管理器已关闭")
        except Exception as e:
            log.error(f"关闭凭证管理器时出错: {e}")

    log.info("Gemini API Pool 主服务已停止")


# 创建FastAPI应用
app = FastAPI(
    title="Gemini API Pool",
    description="Gemini API proxy with OpenAI compatibility",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def openai_http_exception_handler(request: Request, exc: HTTPException):
    if is_openai_compatible_path(request.url.path):
        return openai_error_response(
            {"detail": exc.detail},
            status_code=exc.status_code,
            default_message="Request failed",
            headers=exc.headers,
        )
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def openai_validation_exception_handler(request: Request, exc: RequestValidationError):
    if is_openai_compatible_path(request.url.path):
        return openai_error_response(
            {"detail": exc.errors()},
            status_code=400,
            default_message="Invalid request body",
        )
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(Exception)
async def openai_unhandled_exception_handler(request: Request, exc: Exception):
    log.error(f"Unhandled exception on {request.url.path}: {exc}")
    if is_openai_compatible_path(request.url.path):
        return openai_error_response(
            status_code=500,
            default_message="Internal server error",
        )
    return PlainTextResponse("Internal Server Error", status_code=500)

# 挂载路由器
# OpenAI兼容路由 - 处理OpenAI格式请求
app.include_router(geminicli_openai_router, prefix="", tags=["Geminicli OpenAI API"])

# Gemini原生路由 - 处理Gemini格式请求
app.include_router(geminicli_gemini_router, prefix="", tags=["Geminicli Gemini API"])

# Geminicli模型列表路由 - 处理Gemini格式的模型列表请求
app.include_router(geminicli_model_list_router, prefix="", tags=["Geminicli Model List"])

# Antigravity路由 - 处理OpenAI格式请求并转换为Antigravity API
app.include_router(antigravity_openai_router, prefix="", tags=["Antigravity OpenAI API"])

# Antigravity路由 - 处理Gemini格式请求并转换为Antigravity API
app.include_router(antigravity_gemini_router, prefix="", tags=["Antigravity Gemini API"])

# Antigravity模型列表路由 - 处理Gemini格式的模型列表请求
app.include_router(antigravity_model_list_router, prefix="", tags=["Antigravity Model List"])

# Antigravity Anthropic Messages 路由 - Anthropic Messages 格式兼容
app.include_router(antigravity_anthropic_router, prefix="", tags=["Antigravity Anthropic Messages"])

# Geminicli Anthropic Messages 路由 - Anthropic Messages 格式兼容 (Geminicli)
app.include_router(geminicli_anthropic_router, prefix="", tags=["Geminicli Anthropic Messages"])

# Codex 路由 - 通过 OpenAI Codex Responses API 转发
app.include_router(codex_openai_router, prefix="", tags=["Codex OpenAI API"])
app.include_router(codex_anthropic_router, prefix="", tags=["Codex Anthropic Messages"])
app.include_router(codex_responses_router, prefix="", tags=["Codex Responses API"])
app.include_router(codex_model_list_router, prefix="", tags=["Codex Model List"])

# Claude 路由 - 通过 Anthropic Claude Messages API 转发
app.include_router(claude_openai_router, prefix="", tags=["Claude OpenAI API"])
app.include_router(claude_anthropic_router, prefix="", tags=["Claude Anthropic Messages"])
app.include_router(claude_model_list_router, prefix="", tags=["Claude Model List"])

# Panel路由 - 包含认证、凭证管理和控制面板功能
app.include_router(panel_router, prefix="", tags=["Panel Interface"])

# 静态文件路由 - 服务front目录下的文件（HTML、JS、CSS等）
app.mount("/front", StaticFiles(directory="front"), name="front")

# 保活接口（仅响应 HEAD）
@app.head("/keepalive")
async def keepalive() -> Response:
    return Response(status_code=200)


async def main():
    """异步主启动函数"""
    from hypercorn.asyncio import serve
    from hypercorn.config import Config

    # 日志系统现在直接使用环境变量，无需初始化
    # 从环境变量或配置获取端口和主机
    port = await get_server_port()
    host = await get_server_host()

    workers = int(os.environ.get("WORKERS", 1))

    log.info("=" * 60)
    log.info("启动 Gemini API Pool")
    log.info("=" * 60)
    log.info(f"控制面板: http://127.0.0.1:{port}")
    if workers > 1:
        log.info(f"Worker 数量: {workers}")
    log.info("=" * 60)

    log.info(f"   Codex (OpenAI格式): http://127.0.0.1:{port}/codex/v1")
    log.info(f"   Codex (Claude格式): http://127.0.0.1:{port}/codex/v1")
    log.info(f"   Codex (Responses格式): http://127.0.0.1:{port}/codex/v1")
    log.info(f"   Claude (OpenAI格式): http://127.0.0.1:{port}/claude/v1")
    log.info(f"   Claude (Claude格式): http://127.0.0.1:{port}/claude/v1")

    # 配置hypercorn
    config = Config()
    config.bind = [f"{host}:{port}"]
    config.accesslog = "-"
    config.errorlog = "-"
    config.loglevel = "INFO"
    config.workers = workers

    # 设置连接超时
    config.keep_alive_timeout = 600  # 10分钟
    config.read_timeout = 600  # 10分钟读取超时

    await serve(app, config)


if __name__ == "__main__":
    asyncio.run(main())
