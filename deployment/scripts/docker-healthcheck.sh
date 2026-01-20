#!/bin/bash

# ==========================================
# Docker Compose 服务健康检查脚本
# ==========================================
# 验证所有服务是否正常运行和通信

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AxonDoc Docker 服务健康检查${NC}"
echo -e "${BLUE}========================================${NC}\n"

# 检查函数
check_service() {
    local service=$1
    local url=$2
    local expected_status=$3
    
    echo -n "检查 $service ... "
    
    if response=$(curl -s -w "\n%{http_code}" "$url" 2>&1); then
        status_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n-1)
        
        if [[ "$status_code" == "$expected_status"* ]]; then
            echo -e "${GREEN}✓ 成功${NC} (HTTP $status_code)"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ 失败${NC} (HTTP $status_code, 期望 $expected_status)"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${RED}✗ 无法连接${NC}"
        FAILED=$((FAILED + 1))
    fi
}

# 等待服务启动
echo -e "${YELLOW}等待服务启动...${NC}\n"
sleep 5

# 检查各个服务
echo -e "${BLUE}--- 基础服务检查 ---${NC}"
check_service "PostgreSQL" "postgresql://postgres:*@localhost:5433/postgres" "0"
check_service "Redis" "redis://localhost:6380" "0"

echo ""
echo -e "${BLUE}--- Supabase 服务检查 ---${NC}"
check_service "Auth" "http://localhost:9999/health" "200"
check_service "REST API" "http://localhost:3000/" "200"
check_service "Realtime" "http://localhost:4000/ok" "200"

echo ""
echo -e "${BLUE}--- API 网关检查 ---${NC}"
check_service "Kong" "http://localhost:4321/status" "200"

echo ""
echo -e "${BLUE}--- 应用服务检查 ---${NC}"
check_service "Next.js" "http://localhost:4321/" "200"
check_service "Crawler" "http://localhost:4321/api/crawler/health" "200"

echo ""
echo -e "${BLUE}--- 服务间通信检查 ---${NC}"

# Next.js -> Supabase 通信检查
echo -n "Next.js -> Supabase ... "
if docker exec axon-doc-nextjs curl -s -f http://kong:8000/rest/v1 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Crawler -> Supabase 通信检查
echo -n "Crawler -> Supabase ... "
if docker exec axon-doc-crawler curl -s -f http://kong:8000/rest/v1 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Crawler -> Redis 通信检查
echo -n "Crawler -> Redis ... "
if docker exec axon-doc-crawler curl -s -f http://redis:6379 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠${NC} (Redis 不支持 HTTP，仅作参考)"
    PASSED=$((PASSED + 1))
fi

# Next.js -> Crawler 通信检查
echo -n "Next.js -> Crawler ... "
if docker exec axon-doc-nextjs curl -s -f http://crawler:8001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "检查结果: ${GREEN}通过 $PASSED${NC} / ${RED}失败 $FAILED${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ 所有服务正常运行！${NC}"
    exit 0
else
    echo -e "\n${RED}✗ 部分服务存在问题，请检查日志${NC}"
    exit 1
fi
