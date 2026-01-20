#!/bin/bash

# ==========================================
# AxonDoc 服务器部署脚本
# ==========================================
# 使用预构建的 Docker 镜像自动更新和部署应用
# 
# 使用方式:
#   ./deploy.sh                    # 标准部署
#   ./deploy.sh --pull-only        # 仅拉取镜像
#   ./deploy.sh --update-images    # 更新镜像并重启
#   ./deploy.sh --rollback         # 回滚到上一个版本
#   ./deploy.sh --status           # 查看部署状态

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置（基于 deployment/scripts 目录的相对路径）
COMPOSE_FILE="../docker-compose.prod.yml"
ENV_FILE="../.env.production"
BACKUP_DIR="../backups"
LOG_DIR="../logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/deploy_$TIMESTAMP.log"

# 确保日志目录存在
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"

# 日志函数
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_section() {
    log "\n${BLUE}========================================${NC}"
    log "${BLUE}$1${NC}"
    log "${BLUE}========================================${NC}\n"
}

# ==========================================
# 函数定义
# ==========================================

check_prerequisites() {
    log_section "✅ 检查前置条件"
    
    # 检查 docker-compose 文件
    if [ ! -f "$COMPOSE_FILE" ]; then
        log "${RED}❌ 错误: $COMPOSE_FILE 不存在${NC}"
        exit 1
    fi
    
    # 检查环境文件
    if [ ! -f "$ENV_FILE" ]; then
        log "${RED}❌ 错误: $ENV_FILE 不存在${NC}"
        log "请将 .env.production.example 复制为 .env.production 并配置"
        exit 1
    fi
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log "${RED}❌ 错误: Docker 未安装${NC}"
        exit 1
    fi
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log "${RED}❌ 错误: Docker Compose 未安装${NC}"
        exit 1
    fi
    
    log "${GREEN}✓ 所有前置条件检查通过${NC}"
}

pull_images() {
    log_section "📥 拉取最新镜像"
    
    # 检查是否需要登录 GHCR
    if grep -q "ghcr.io" "$COMPOSE_FILE"; then
        log "需要登录 GitHub Container Registry (GHCR)..."
        
        if [ -z "$GITHUB_TOKEN" ]; then
            log "${YELLOW}⚠️  GITHUB_TOKEN 未设置${NC}"
            log "需要登录 GHCR 来拉取私有镜像"
            log ""
            log "请设置 GITHUB_TOKEN 环境变量:"
            log "  export GITHUB_TOKEN=ghp_xxxxxxxxxxxx"
            log ""
            log "或在提示时输入 GitHub Token:"
            read -sp "GitHub Token: " github_token
            export GITHUB_TOKEN=$github_token
        fi
        
        log "登录 GHCR..."
        echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USER --password-stdin
    fi
    
    log "从 Docker Registry 拉取镜像..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    log "${GREEN}✓ 镜像拉取完成${NC}"
}

backup_state() {
    log_section "💾 备份当前状态"
    
    # 备份数据库
    log "备份数据库..."
    if docker-compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q running; then
        docker-compose -f "$COMPOSE_FILE" exec -T db pg_dump -U postgres postgres \
            > "$BACKUP_DIR/db_$TIMESTAMP.sql" 2>> "$LOG_FILE"
        log "${GREEN}✓ 数据库已备份: db_$TIMESTAMP.sql${NC}"
    fi
    
    # 保存当前镜像信息
    log "保存镜像信息..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" images \
        > "$BACKUP_DIR/images_$TIMESTAMP.txt" 2>> "$LOG_FILE"
    
    log "${GREEN}✓ 状态备份完成${NC}"
}

stop_services() {
    log_section "⏹️ 停止现有服务"
    
    log "停止所有容器..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop || true
    
    log "${GREEN}✓ 服务已停止${NC}"
}

start_services() {
    log_section "🚀 启动服务"
    
    log "启动所有容器..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log "等待服务启动..."
    sleep 10
    
    log "${GREEN}✓ 服务已启动${NC}"
}

health_check() {
    log_section "🏥 服务健康检查"
    
    local max_retries=30
    local retry=0
    local failed_services=()
    
    # 检查关键服务
    local services=("db" "kong" "nextjs" "crawler")
    
    for service in "${services[@]}"; do
        retry=0
        while [ $retry -lt $max_retries ]; do
            if docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps "$service" 2>/dev/null | grep -q "Up"; then
                log "${GREEN}✓ $service 运行中${NC}"
                break
            fi
            retry=$((retry + 1))
            echo -n "."
            sleep 1
        done
        
        if [ $retry -eq $max_retries ]; then
            log "${RED}✗ $service 启动失败${NC}"
            failed_services+=("$service")
        fi
    done
    
    # 检查 HTTP 端点
    log "\n检查 HTTP 端点..."
    if curl -s -f http://localhost:4321/ > /dev/null 2>&1; then
        log "${GREEN}✓ 应用可访问 (http://localhost:4321)${NC}"
    else
        log "${YELLOW}⚠ 应用暂不可访问${NC}"
    fi
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        log "\n${GREEN}✓ 所有服务健康检查通过${NC}"
        return 0
    else
        log "\n${RED}❌ 以下服务启动失败: ${failed_services[*]}${NC}"
        return 1
    fi
}

rollback() {
    log_section "⏮️ 回滚到上一个版本"
    
    # 获取最新的备份
    local latest_backup=$(ls -t "$BACKUP_DIR/db_"*.sql 2>/dev/null | head -1)
    
    if [ -z "$latest_backup" ]; then
        log "${RED}❌ 没有找到备份文件${NC}"
        return 1
    fi
    
    log "恢复数据库从备份: $(basename $latest_backup)..."
    
    # 停止数据库容器
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop db || true
    
    # 等待容器停止
    sleep 5
    
    # 恢复数据
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db
    sleep 10
    
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db psql -U postgres < "$latest_backup"
    
    # 重启其他服务
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log "${GREEN}✓ 回滚完成${NC}"
}

show_status() {
    log_section "📊 部署状态"
    
    log "容器状态:"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    
    log "\n磁盘使用:"
    docker system df
    
    log "\n最近日志:"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail 20
}

cleanup_old_images() {
    log_section "🧹 清理旧镜像"
    
    log "删除未使用的镜像..."
    docker image prune -f || true
    
    log "${GREEN}✓ 清理完成${NC}"
}

# ==========================================
# 主流程
# ==========================================

main() {
    local action="${1:-deploy}"
    
    log "${BLUE}╔════════════════════════════════════╗${NC}"
    log "${BLUE}║  AxonDoc 服务器部署工具             ║${NC}"
    log "${BLUE}╚════════════════════════════════════╝${NC}"
    log "时间戳: $TIMESTAMP"
    log "操作: $action"
    log "日志: $LOG_FILE\n"
    
    case "$action" in
        deploy|"")
            log_section "🚀 标准部署流程"
            check_prerequisites
            backup_state
            pull_images
            stop_services
            start_services
            health_check
            cleanup_old_images
            log_section "✅ 部署完成！"
            log "访问应用: ${BLUE}http://localhost:4321${NC}"
            ;;
        
        pull-only)
            log_section "📥 仅拉取镜像"
            check_prerequisites
            pull_images
            log_section "✅ 完成"
            ;;
        
        update-images)
            log_section "🔄 更新镜像并重启"
            check_prerequisites
            pull_images
            stop_services
            start_services
            health_check
            log_section "✅ 更新完成"
            ;;
        
        rollback)
            log_section "⏮️ 回滚部署"
            check_prerequisites
            rollback
            health_check
            log_section "✅ 回滚完成"
            ;;
        
        status)
            show_status
            ;;
        
        clean)
            log_section "🗑️ 完全清理"
            read -p "确定要删除所有容器和数据吗? (y/N) " confirm
            if [ "$confirm" = "y" ]; then
                docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v
                log "${GREEN}✓ 清理完成${NC}"
            fi
            ;;
        
        logs)
            docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f
            ;;
        
        *)
            echo "未知的操作: $action"
            echo ""
            echo "用法:"
            echo "  $0 deploy           - 标准部署（拉取、备份、重启、检查）"
            echo "  $0 pull-only        - 仅拉取最新镜像"
            echo "  $0 update-images    - 更新镜像并重启服务"
            echo "  $0 rollback         - 回滚到上一个版本"
            echo "  $0 status           - 查看部署状态"
            echo "  $0 logs             - 查看实时日志"
            echo "  $0 clean            - 删除所有容器和数据"
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"

log "\n日志已保存: $LOG_FILE\n"
