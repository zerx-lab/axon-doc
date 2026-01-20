#!/bin/bash

# ==========================================
# AxonDoc Docker 自动故障排除脚本
# ==========================================
# 诊断常见 Docker Compose 问题

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 诊断结果
ISSUES=()
WARNINGS=()
FIXES=()

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AxonDoc Docker 故障诊断工具${NC}"
echo -e "${BLUE}========================================${NC}\n"

# ==========================================
# 1. 系统检查
# ==========================================
echo -e "${BLUE}[1/8] 检查系统环境...${NC}\n"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    ISSUES+=("Docker 未安装或未在 PATH 中")
    FIXES+=("请访问 https://docs.docker.com/get-docker/ 安装 Docker")
else
    echo -e "${GREEN}✓ Docker${NC}"
fi

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    ISSUES+=("Docker Compose 未安装或未在 PATH 中")
    FIXES+=("请运行: pip install docker-compose 或使用 Docker Desktop")
else
    echo -e "${GREEN}✓ Docker Compose${NC}"
fi

# 检查 Docker 守护进程
if ! docker ps > /dev/null 2>&1; then
    ISSUES+=("Docker 守护进程未运行")
    FIXES+=("请启动 Docker Desktop 或运行: sudo systemctl start docker")
else
    echo -e "${GREEN}✓ Docker 守护进程${NC}"
fi

# ==========================================
# 2. 环境文件检查
# ==========================================
echo -e "\n${BLUE}[2/8] 检查环境配置...${NC}\n"

if [ ! -f .env.production ]; then
    ISSUES+=(".env.production 不存在")
    FIXES+=("请运行: cp .env.production.example .env.production")
else
    echo -e "${GREEN}✓ .env.production${NC}"
    
    # 检查关键变量
    source .env.production
    
    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "super-secret-jwt-token-with-at-least-32-characters" ]; then
        WARNINGS+=("JWT_SECRET 使用默认值，生产环境不安全")
    fi
    
    if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "jysuXvKLDhmYuyKZSLYQxSzU" ]; then
        WARNINGS+=("POSTGRES_PASSWORD 使用默认值，生产环境不安全")
    fi
fi

# ==========================================
# 3. 端口检查
# ==========================================
echo -e "\n${BLUE}[3/8] 检查端口占用...${NC}\n"

PORTS=(4321 4322 5433 6380 8001 3001)
OCCUPIED=0

for port in "${PORTS[@]}"; do
    if lsof -i ":$port" > /dev/null 2>&1; then
        ISSUES+=("端口 $port 已被占用")
        PROC=$(lsof -i ":$port" | grep LISTEN | awk '{print $2}' | head -1)
        FIXES+=("请运行: kill -9 $PROC 或修改 .env.production 中的端口")
        OCCUPIED=$((OCCUPIED + 1))
    else
        echo -e "${GREEN}✓ 端口 $port 可用${NC}"
    fi
done

# ==========================================
# 4. 磁盘空间检查
# ==========================================
echo -e "\n${BLUE}[4/8] 检查磁盘空间...${NC}\n"

DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    WARNINGS+=("磁盘使用率 $DISK_USAGE% (超过 80%)")
    FIXES+=("请清理磁盘或运行: docker system prune -a --volumes")
else
    echo -e "${GREEN}✓ 磁盘空间充足 (使用率 $DISK_USAGE%)${NC}"
fi

# ==========================================
# 5. Docker 镜像检查
# ==========================================
echo -e "\n${BLUE}[5/8] 检查 Docker 镜像...${NC}\n"

REQUIRED_IMAGES=(
    "oven/bun:latest"
    "python:3.12-slim"
    "postgres:15"
    "redis:7.2-alpine"
    "kong:3.3.1-alpine"
    "supabase/gotrue:v2.184.0"
    "postgrest/postgrest:v12.0.1"
)

for image in "${REQUIRED_IMAGES[@]}"; do
    if docker image ls | grep -q $(echo $image | cut -d':' -f1); then
        echo -e "${GREEN}✓ $image${NC}"
    else
        WARNINGS+=("镜像 $image 不存在，将在启动时自动下载")
    fi
done

# ==========================================
# 6. Docker 网络检查
# ==========================================
echo -e "\n${BLUE}[6/8] 检查 Docker 网络...${NC}\n"

if docker network ls | grep -q axon-doc_axon-network; then
    echo -e "${GREEN}✓ axon-doc_axon-network 网络存在${NC}"
else
    echo -e "${YELLOW}⚠ axon-doc_axon-network 网络不存在${NC}"
    echo "   将在启动 docker-compose 时自动创建"
fi

# ==========================================
# 7. 现有容器检查
# ==========================================
echo -e "\n${BLUE}[7/8] 检查现有容器...${NC}\n"

CONTAINERS=$(docker ps -a | grep axon-doc | wc -l)
if [ $CONTAINERS -gt 0 ]; then
    echo -e "${YELLOW}⚠ 发现 $CONTAINERS 个已存在的容器${NC}"
    echo "   这些容器可能与新容器冲突"
    echo ""
    FIXES+=("如需清理，请运行: docker-compose down -v")
else
    echo -e "${GREEN}✓ 无冲突的现有容器${NC}"
fi

# ==========================================
# 8. 权限检查
# ==========================================
echo -e "\n${BLUE}[8/8] 检查文件权限...${NC}\n"

# 检查脚本权限
SCRIPTS=("docker-entrypoint.sh" "docker-healthcheck.sh" "docker-troubleshoot.sh")
for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo -e "${GREEN}✓ $script 可执行${NC}"
        else
            WARNINGS+=("$script 没有执行权限")
            FIXES+=("请运行: chmod +x $script")
        fi
    fi
done

# ==========================================
# 结果摘要
# ==========================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}诊断结果${NC}"
echo -e "${BLUE}========================================${NC}\n"

if [ ${#ISSUES[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ 检查完成！所有系统配置正常${NC}"
    echo ""
    echo -e "可以继续启动服务:"
    echo -e "  ${BLUE}./docker-entrypoint.sh${NC}"
    exit 0
fi

if [ ${#ISSUES[@]} -gt 0 ]; then
    echo -e "${RED}发现 ${#ISSUES[@]} 个问题:${NC}\n"
    for i in "${!ISSUES[@]}"; do
        echo -e "${RED}❌ ${ISSUES[$i]}${NC}"
        if [ -n "${FIXES[$i]}" ]; then
            echo -e "   修复: ${FIXES[$i]}"
        fi
        echo ""
    done
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}发现 ${#WARNINGS[@]} 个警告:${NC}\n"
    for warning in "${WARNINGS[@]}"; do
        echo -e "${YELLOW}⚠ $warning${NC}"
    done
    echo ""
fi

echo -e "${BLUE}========================================${NC}"

if [ ${#ISSUES[@]} -gt 0 ]; then
    echo -e "${RED}请解决上述问题后重试${NC}"
    exit 1
else
    echo -e "${GREEN}✓ 可以启动服务，但请注意上述警告${NC}"
    exit 0
fi
