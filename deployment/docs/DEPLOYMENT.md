# AxonDoc Docker 完整部署指南

## 目录

1. [架构设计](#架构设计)
2. [环境准备](#环境准备)
3. [快速启动](#快速启动)
4. [配置说明](#配置说明)
5. [服务管理](#服务管理)
6. [故障排除](#故障排除)
7. [生产环境部署](#生产环境部署)

---

## 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Kong API Gateway (4321)                  │
│                 (所有请求的中央转发点)                      │
└─────┬──────────────────┬──────────────────┬──────────────────┘
      │                  │                  │
      ▼                  ▼                  ▼
  ┌────────────┐   ┌──────────────┐   ┌──────────────┐
  │ Next.js    │   │   Crawler    │   │  Supabase    │
  │ (3001)     │   │   (8001)     │   │  Services    │
  │            │   │              │   │  (8000/...)  │
  └────────────┘   └──────────────┘   └──────────────┘
      │                  │                  │
      └──────────────────┴──────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │    Supabase 核心服务          │
         ├───────────────────────────────┤
         │ • Auth (9999)                 │
         │ • REST API (3000)             │
         │ • Realtime (4000)             │
         │ • Analytics (4000)            │
         │ • Studio (3000)               │
         └───────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
    ┌─────────┐                   ┌──────────┐
    │PostgreSQL                   │  Redis   │
    │  (5433) │                   │ (6380)   │
    └─────────┘                   └──────────┘
```

### 服务拓扑

| 服务 | 端口 | 依赖关系 | 功能 |
|------|------|--------|------|
| **PostgreSQL** | 5433 | 无 | 核心数据库 |
| **Redis** | 6380 | 无 | 缓存和消息队列 |
| **Supabase Auth** | 9999 | PostgreSQL | 用户认证 |
| **Supabase REST** | 3000 | PostgreSQL | REST API |
| **Supabase Realtime** | 4000 | PostgreSQL | 实时订阅 |
| **Supabase Studio** | 3000 | Auth, REST | 管理后台 |
| **Kong** | 4321/4322 | Auth, REST | API 网关 |
| **Next.js** | 3001 | Kong, Crawler | 前端应用 |
| **Crawler** | 8001 | Kong, Redis | 爬虫服务 |

---

## 环境准备

### 系统要求

- **操作系统**: Linux/macOS/Windows (WSL2)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **磁盘空间**: 最少 20GB
- **内存**: 最少 8GB

### 安装依赖

#### 1. 安装 Docker

**Ubuntu/Debian:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**macOS:**
```bash
# 使用 Homebrew
brew install docker
brew install docker-compose

# 或下载 Docker Desktop
# https://www.docker.com/products/docker-desktop
```

**Windows (WSL2):**
```bash
# 使用 Chocolatey
choco install docker-desktop

# 或从官方网站下载
# https://www.docker.com/products/docker-desktop
```

#### 2. 验证安装

```bash
docker --version
docker-compose --version
```

---

## 快速启动

### 第一步：准备环境文件

1. 复制环境模板文件：
```bash
cp .env.production.example .env.production
```

2. 编辑 `.env.production` 配置必需的环境变量：
```bash
nano .env.production
```

关键配置项：
- `POSTGRES_PASSWORD`: PostgreSQL 密码 (生产环境请修改)
- `JWT_SECRET`: JWT 签名密钥 (至少 32 字符)
- `OPENAI_API_KEY`: OpenAI API 密钥 (用于爬虫分析)
- `SUPABASE_PUBLIC_URL`: 公开 URL (生产环境使用域名)

### 第二步：启动服务

#### 方式一：使用启动脚本（推荐）

```bash
chmod +x docker-entrypoint.sh
./docker-entrypoint.sh
```

#### 方式二：使用 docker-compose 直接启动

```bash
# 启动所有服务（后台运行）
docker-compose up -d

# 或查看实时日志
docker-compose up
```

### 第三步：验证服务

```bash
# 运行健康检查
chmod +x docker-healthcheck.sh
./docker-healthcheck.sh

# 或手动检查
docker-compose ps
```

### 第四步：初始化数据库

```bash
# 运行数据库种子数据
docker-compose exec db psql -U postgres < supabase/seed.sql
```

### 第五步：访问应用

- **应用主页**: http://localhost:4321
- **Crawler API**: http://localhost:4321/api/crawler
- **Supabase REST API**: http://localhost:4321/rest/v1

---

## 配置说明

### .env.production 详细说明

#### 通用配置

```bash
NODE_ENV=production          # 应用运行环境
ENVIRONMENT=production       # 环境标识
APP_NAME=axon-doc            # 应用名称
APP_VERSION=0.1.0            # 应用版本
```

#### 网关配置

```bash
KONG_HTTP_PORT=4321          # Kong HTTP 监听端口
KONG_HTTPS_PORT=4322         # Kong HTTPS 监听端口
SUPABASE_PUBLIC_URL=http://localhost:4321  # 公开访问地址
```

#### 数据库配置

```bash
POSTGRES_HOST=db             # 数据库主机 (Docker 网络内部名称)
POSTGRES_PORT=5432           # 数据库端口 (容器内部)
POSTGRES_DB=postgres          # 数据库名称
POSTGRES_USER=postgres        # 数据库用户名
POSTGRES_PASSWORD=xxx         # ⚠️ 生产环境请修改！

DATABASE_URL=postgresql://postgres:xxx@db:5432/postgres
```

#### JWT 和认证配置

```bash
# JWT 密钥：用于签名所有认证令牌
# ⚠️ 生产环境必须修改为强密码，至少 32 字符
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters

# ANON 密钥：客户端公钥（浏览器请求使用）
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# SERVICE_ROLE 密钥：服务端密钥（完全权限）
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Crawler 配置

```bash
CRAWLER_TIMEOUT=60000        # 爬虫超时时间（毫秒）
CRAWLER_MAX_DEPTH=3          # 最大爬取深度
CRAWLER_MAX_PAGES=100        # 最大页面数
CRAWLER_WAIT_UNTIL=load      # 页面加载等待条件

OPENAI_API_KEY=sk-xxx        # OpenAI API 密钥（用于内容分析）
```

#### Redis 配置

```bash
REDIS_HOST=redis             # Redis 主机
REDIS_PORT=6379              # Redis 端口
REDIS_PASSWORD=              # Redis 密码（留空表示无密码）
```

### Kong 网关配置

Kong 配置文件: `kong-config.yml`

关键路由规则：

```yaml
# REST API 路由
/rest/v1 -> http://rest:3000

# 认证路由
/auth/v1 -> http://auth:9999

# Realtime 路由
/realtime/v1 -> http://realtime:4000

# 爬虫服务路由
/api/crawler -> http://crawler:8001

# 默认路由（Next.js）
/ -> http://nextjs:3001
```

---

## 服务管理

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f nextjs    # Next.js
docker-compose logs -f crawler   # Crawler
docker-compose logs -f kong      # Kong 网关
docker-compose logs -f db        # 数据库

# 查看最近 100 行日志
docker-compose logs --tail 100 nextjs
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart nextjs
docker-compose restart crawler

# 重启并更新镜像
docker-compose up -d --force-recreate
```

### 停止服务

```bash
# 停止所有服务（保留数据）
docker-compose stop

# 停止并删除容器（保留数据）
docker-compose down

# 完全清理（包括数据）
docker-compose down -v
```

### 进入容器

```bash
# 进入 Next.js 容器
docker-compose exec nextjs bash

# 进入 Crawler 容器
docker-compose exec crawler bash

# 进入数据库容器
docker-compose exec db bash
```

### 数据库管理

```bash
# 进入 PostgreSQL 命令行
docker-compose exec db psql -U postgres

# 运行 SQL 文件
docker-compose exec db psql -U postgres < migrations.sql

# 备份数据库
docker-compose exec db pg_dump -U postgres postgres > backup.sql

# 恢复数据库
docker-compose exec db psql -U postgres < backup.sql
```

---

## 故障排除

### 问题 1: 容器启动失败

**症状**: `docker-compose up` 失败，容器立即退出

**解决方案**:
```bash
# 查看错误日志
docker-compose logs <service-name>

# 确保端口未被占用
lsof -i :4321
lsof -i :5433

# 删除旧容器并重新启动
docker-compose down -v
docker-compose up -d
```

### 问题 2: 服务间通信失败

**症状**: 网络超时错误，服务无法连接到其他服务

**解决方案**:
```bash
# 检查 Docker 网络
docker network ls
docker network inspect axon-doc_axon-network

# 检查服务 DNS
docker-compose exec nextjs nslookup crawler
docker-compose exec crawler nslookup kong

# 验证连接
docker-compose exec nextjs curl -v http://crawler:8001/health
```

### 问题 3: 数据库连接错误

**症状**: `ERROR: could not translate host name "db" to address`

**解决方案**:
```bash
# 检查 PostgreSQL 是否启动
docker-compose ps db

# 查看数据库日志
docker-compose logs db

# 等待数据库完全启动
docker-compose exec db pg_isready -U postgres
```

### 问题 4: 磁盘空间不足

**症状**: `no space left on device`

**解决方案**:
```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的数据卷
docker volume prune

# 查看磁盘占用
docker system df

# 完全清理
docker system prune -a --volumes
```

### 问题 5: 端口已被占用

**症状**: `bind: address already in use`

**解决方案**:
```bash
# 查看占用的进程
lsof -i :4321

# 修改 .env.production 中的端口
KONG_HTTP_PORT=4322

# 或杀死占用进程
kill -9 <PID>
```

### 问题 6: Next.js 构建失败

**症状**: `error - Failed to compile`

**解决方案**:
```bash
# 清理 Next.js 缓存
docker-compose exec nextjs rm -rf .next

# 重新构建
docker-compose down
docker-compose up -d

# 查看详细日志
docker-compose logs nextjs
```

---

## 生产环境部署

### 安全性检查清单

- [ ] 修改所有默认密码 (POSTGRES_PASSWORD, DASHBOARD_PASSWORD)
- [ ] 生成新的 JWT_SECRET (至少 32 字符的随机字符串)
- [ ] 配置 SUPABASE_PUBLIC_URL 为实际域名
- [ ] 启用 HTTPS (配置 Kong HTTPS_PORT)
- [ ] 配置 SMTP 邮件服务
- [ ] 启用 SSL 证书 (Let's Encrypt)
- [ ] 配置防火墙规则
- [ ] 启用日志聚合
- [ ] 配置备份策略
- [ ] 设置监控告警

### 生成安全的环境变量

```bash
# 生成强密码
openssl rand -base64 32

# 生成 JWT 密钥
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# 示例输出
# abc123xyz789...
```

### SSL/TLS 配置

编辑 `kong-config.yml` 中的 HTTPS 部分：

```yaml
services:
  - name: nextjs-app
    url: https://nextjs:3001
    # 添加 SSL 证书
    tls:
      enabled: true
      cert: /etc/kong/certs/cert.pem
      key: /etc/kong/certs/key.pem
```

### 数据备份

```bash
# 每天自动备份
0 2 * * * docker-compose exec db pg_dump -U postgres postgres > backup_$(date +\%Y\%m\%d).sql

# 添加到 crontab
crontab -e
```

### 监控和日志

```bash
# 启用 Docker 日志驱动
# /etc/docker/daemon.json
{
  "log-driver": "splunk",
  "log-opts": {
    "splunk-token": "your-token",
    "splunk-url": "https://your-splunk-instance:8088"
  }
}
```

### 性能优化

```bash
# 增加 PostgreSQL 并发连接
POSTGRES_CONNECTIONS=200

# 增加 Kong 工作进程
KONG_NGINX_WORKER_PROCESSES=auto

# 启用 Redis 持久化
REDIS_SAVE=900 1 300 10 60 10000
```

---

## 常用命令速查

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 进入容器
docker-compose exec <service> bash

# 重启服务
docker-compose restart <service>

# 更新镜像并重启
docker-compose up -d --build

# 清理所有数据
docker-compose down -v

# 运行数据库迁移
docker-compose exec db psql -U postgres < migrations.sql

# 备份数据库
docker-compose exec db pg_dump -U postgres > backup.sql
```

---

## 支持和反馈

如有问题，请提交 Issue: https://github.com/your-repo/issues

---

**最后更新**: 2026-01-20
**版本**: 1.0.0
