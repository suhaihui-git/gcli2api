#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "========== 拉取最新代码 =========="
git pull origin "$(git rev-parse --abbrev-ref HEAD)"

echo "========== 停止旧容器 =========="
docker compose down

echo "========== 重新构建并启动 =========="
docker compose up -d --build

echo "========== 部署完成 =========="
docker compose ps
