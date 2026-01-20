#!/bin/bash

# ==========================================
# Docker Compose 启动入口脚本
# ==========================================
# 自动初始化数据库和启动所有服务

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AxonDoc Docker 启动脚本${NC}"
echo -e "${BLUE}========================================${NC}\n"

# 检查 .env 文件
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠ 未找到 .env.production 文件${NC}"
    echo "请将 .env.production.example 复制为 .env.production 并配置"
    exit 1
fi

echo -e "${BLUE}[1/5]${NC} 启动 Docker Compose 服务...\n"
docker-compose up -d --build

echo -e "\n${BLUE}[2/5]${NC} 等待数据库启动...\n"
sleep 10

# 检查数据库连接
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker exec axon-doc-db pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 数据库已启动${NC}"
        break
    fi
    attempt=$((attempt + 1))
    echo "等待数据库... ($attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${YELLOW}✗ 数据库启动超时${NC}"
fi

echo -e "\n${BLUE}[3/5]${NC} 初始化数据库...\n"

# 检查是否需要运行迁移
if docker exec axon-doc-db psql -U postgres -d postgres -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name='supabase_migrations';" 2>/dev/null | grep -q supabase_migrations; then
    echo -e "${GREEN}✓ 数据库已初始化${NC}"
else
    echo "运行数据库迁移..."
    # 在这里添加您的迁移命令
    # docker exec axon-doc-db psql -U postgres < supabase/seed.sql
fi

echo -e "\n${BLUE}[4/5]${NC} 等待所有服务就绪...\n"

# 等待关键服务
services=("axon-doc-kong" "axon-doc-nextjs" "axon-doc-crawler")
for service in "${services[@]}"; do
    max_attempts=60
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker exec "$service" curl -s -f http://localhost/health > /dev/null 2>&1 || \
           docker exec "$service" curl -s -f http://localhost:8000/status > /dev/null 2>&1 || \
           docker exec "$service" curl -s -f http://localhost:3001/ > /dev/null 2>&1 || \
           docker exec "$service" curl -s -f http://localhost:8001/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $service 已就绪"
            break
        fi
        attempt=$((attempt + 1))
        echo "等待 $service... ($attempt/$max_attempts)"
        sleep 1
    done
done

echo -e "\n${BLUE}[5/5]${NC} 服务健康检查...\n"

# 可选: 运行健康检查脚本
if [ -f docker-healthcheck.sh ]; then
    chmod +x docker-healthcheck.sh
    ./docker-healthcheck.sh
else
    echo -e "${YELLOW}未找到健康检查脚本${NC}"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ AxonDoc 已启动成功！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "访问地址:"
echo -e "  应用: ${BLUE}http://localhost:4321${NC}"
echo -e "  Supabase Studio: ${BLUE}http://localhost:4321${NC} (通过 Kong 转发)"
echo -e "  Crawler API: ${BLUE}http://localhost:4321/api/crawler${NC}"
echo ""
echo -e "日志查看:"
echo -e "  所有服务: ${BLUE}docker-compose logs -f${NC}"
echo -e "  特定服务: ${BLUE}docker-compose logs -f nextjs${NC}"
echo ""
echo -e "停止服务:"
echo -e "  ${BLUE}docker-compose down${NC}"
echo ""
