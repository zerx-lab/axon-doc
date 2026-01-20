# AxonDoc Docker 部署完全指南

## 📋 文件清单

本次实现包含以下文件：

### 核心配置文件

| 文件 | 说明 |
|------|------|
| **docker-compose.yml** | 主 Docker Compose 编排文件，定义所有服务 |
| **.env.production** | 生产环境变量配置（需自行创建） |
| **.env.production.example** | 环境变量配置示例模板 |
| **kong-config.yml** | Kong API 网关配置，定义路由规则 |

### Dockerfile 文件

| 文件 | 说明 |
|------|------|
| **Dockerfile.prod** | Next.js 生产环境多阶段构建 |
| **crawler-service/Dockerfile** | Crawler 服务 Python FastAPI 构建 |

### 脚本文件

| 文件 | 说明 | 用途 |
|------|------|------|
| **docker-entrypoint.sh** | Docker 启动入口脚本 | 自动化启动和初始化 |
| **docker-healthcheck.sh** | 服务健康检查脚本 | 验证所有服务正常运行 |
| **docker-troubleshoot.sh** | 故障诊断脚本 | 自动诊断常见问题 |

### 文档文件

| 文件 | 说明 |
|------|------|
| **DOCKER_DEPLOYMENT.md** | 完整部署指南（详细版）|
| **QUICK_START.md** | 快速开始指南（60秒快速启动）|
| **DOCKER_README.md** | 本文件，总览和文件说明 |

---

## 🚀 快速开始

### 1. 环境准备

```bash
# 复制环境配置
cp .env.production.example .env.production

# 编辑配置（重要！）
nano .env.production

# 关键要修改的项目：
# - POSTGRES_PASSWORD: 修改为强密码
# - JWT_SECRET: 修改为 32 字符以上的密钥
# - OPENAI_API_KEY: 如需使用爬虫 AI 分析功能，添加 API 密钥
```

### 2. 系统检查（推荐）

```bash
# 运行故障诊断脚本，检查系统配置
chmod +x docker-troubleshoot.sh
./docker-troubleshoot.sh
```

### 3. 启动服务

```bash
# 方式一：使用启动脚本（推荐）- 自动初始化和检查
chmod +x docker-entrypoint.sh
./docker-entrypoint.sh

# 方式二：直接启动
docker-compose up -d

# 查看实时日志
docker-compose logs -f
```

### 4. 验证服务

```bash
# 等待 2-3 分钟后运行健康检查
chmod +x docker-healthcheck.sh
./docker-healthcheck.sh
```

### 5. 访问应用

- **主应用**: http://localhost:4321
- **Crawler API**: http://localhost:4321/api/crawler
- **Supabase Studio**: http://localhost:4321 (通过 Kong 转发)

---

## 🏗️ 系统架构

### 服务架构图

```
┌───────────────────────────────────────────────────────┐
│         Kong API Gateway (4321)                       │
│    (所有请求的中央转发点)                            │
└─────────────────┬─────────────────┬──────────────────┘
                  │                 │
        ┌─────────▼─────────┐   ┌──▼──────────────┐
        │   Next.js App     │   │  Crawler Svc    │
        │   (3001)          │   │  (8001)         │
        └──────────────────┘   └─────────────────┘
                  │                 │
                  └─────────┬───────┘
                            │
                    ┌───────▼────────────────────┐
                    │  Supabase Services         │
                    ├────────────────────────────┤
                    │ • Auth (9999)              │
                    │ • REST API (3000)          │
                    │ • Realtime (4000)          │
                    │ • Analytics (4000)         │
                    │ • Studio (3000)            │
                    └───────┬──────────────┬─────┘
                            │              │
                    ┌───────▼─┐      ┌─────▼──┐
                    │PostgreSQL      Redis    │
                    │ (5433)         (6380)   │
                    └──────────────────────────┘
```

### 服务依赖关系

```
PostgreSQL (db)
    ├── Auth (supabase-auth)
    ├── REST API (rest)
    ├── Realtime (realtime)
    └── Analytics (analytics)

Kong (kong) 依赖:
    ├── Auth
    ├── REST API
    └── db (健康检查)

Next.js (nextjs) 依赖:
    ├── Kong
    └── Crawler

Crawler (crawler) 依赖:
    ├── Kong (访问 Supabase)
    ├── Redis
    └── db (健康检查)

Studio (studio) 依赖:
    ├── Auth
    ├── REST API
    └── Analytics

Redis (redis) 依赖:
    └── 无
```

---

## 📝 环境变量说明

### 必须配置的变量

```bash
# 数据库密码 - 生产环境请修改为强密码
POSTGRES_PASSWORD=your-strong-password

# JWT 密钥 - 用于签名认证令牌，必须修改
JWT_SECRET=your-secret-key-at-least-32-characters

# OpenAI API 密钥 - 如需使用爬虫 AI 分析功能
OPENAI_API_KEY=sk-your-api-key
```

### 网络配置

```bash
# Kong 暴露端口
KONG_HTTP_PORT=4321      # HTTP 端口
KONG_HTTPS_PORT=4322     # HTTPS 端口（可选）

# 公开访问地址
SUPABASE_PUBLIC_URL=http://localhost:4321
# 生产环境请修改为实际域名，例如：
# SUPABASE_PUBLIC_URL=https://api.yourdomain.com
```

### Crawler 配置

```bash
# 爬虫参数
CRAWLER_TIMEOUT=60000      # 超时时间（毫秒）
CRAWLER_MAX_DEPTH=3        # 最大深度
CRAWLER_MAX_PAGES=100      # 最大页面数

# 回调地址 - Crawler 完成后回调通知 Next.js
NEXTJS_WEBHOOK_URL=http://nextjs:3001/api/webhook/crawl
```

---

## 🔧 常用命令

### 启动和停止

```bash
# 启动所有服务
docker-compose up -d

# 停止服务（保留数据）
docker-compose stop

# 删除容器（保留数据）
docker-compose down

# 删除一切（包括数据）
docker-compose down -v

# 重启服务
docker-compose restart
```

### 日志查看

```bash
# 查看所有日志
docker-compose logs -f

# 查看特定服务
docker-compose logs -f nextjs
docker-compose logs -f crawler
docker-compose logs -f kong

# 查看最近行数
docker-compose logs --tail 50 nextjs
```

### 进入容器

```bash
# 进入 Next.js
docker-compose exec nextjs bash

# 进入 Crawler
docker-compose exec crawler bash

# 进入数据库
docker-compose exec db bash

# 进入 PostgreSQL 命令行
docker-compose exec db psql -U postgres
```

### 数据库操作

```bash
# 运行 SQL 文件
docker-compose exec db psql -U postgres < migrations.sql

# 备份数据库
docker-compose exec db pg_dump -U postgres > backup.sql

# 恢复数据库
docker-compose exec db psql -U postgres < backup.sql

# 连接数据库
docker-compose exec db psql -U postgres -d postgres -c "SELECT 1;"
```

---

## ✅ 部署检查清单

### 启动前检查

- [ ] Docker 和 Docker Compose 已安装
- [ ] 4321, 4322, 5433, 6380 等端口未被占用
- [ ] `.env.production` 文件已创建并配置
- [ ] 磁盘空间至少 20GB
- [ ] 内存至少 8GB

### 启动后检查

- [ ] 所有容器正常运行：`docker-compose ps`
- [ ] 健康检查通过：`./docker-healthcheck.sh`
- [ ] 应用可访问：http://localhost:4321
- [ ] 服务间通信正常
- [ ] 日志无错误：`docker-compose logs`

### 生产环境检查

- [ ] 修改了所有默认密码
- [ ] JWT_SECRET 已更改为强密码
- [ ] SUPABASE_PUBLIC_URL 使用真实域名
- [ ] 启用了 HTTPS/SSL
- [ ] 配置了备份策略
- [ ] 配置了监控告警
- [ ] 设置了 SMTP 邮件服务

---

## 🐛 常见问题

### Q1: 容器无法启动

**解决方案**：
```bash
# 1. 查看详细错误
docker-compose logs <service-name>

# 2. 检查端口占用
lsof -i :4321

# 3. 清理并重启
docker-compose down -v
docker-compose up -d
```

### Q2: 服务间无法通信

**解决方案**：
```bash
# 检查网络连接
docker-compose exec nextjs curl -v http://crawler:8001/health

# 检查 DNS
docker-compose exec nextjs nslookup crawler

# 查看网络配置
docker network inspect axon-doc_axon-network
```

### Q3: 数据库连接失败

**解决方案**：
```bash
# 等待数据库启动
docker-compose exec db pg_isready -U postgres

# 查看数据库日志
docker-compose logs db

# 手动测试连接
docker-compose exec db psql -U postgres -c "SELECT 1;"
```

### Q4: 内存或磁盘不足

**解决方案**：
```bash
# 清理 Docker 资源
docker system prune -a --volumes

# 查看磁盘占用
docker system df

# 增加 Docker 可用资源 (需要在 Docker Desktop 中配置)
```

更多常见问题详见：[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md#故障排除)

---

## 📚 相关文档

1. **[QUICK_START.md](./QUICK_START.md)** - 60秒快速启动指南
2. **[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)** - 完整部署指南
3. **[AGENTS.md](./AGENTS.md)** - 项目规范和开发指南
4. **[README.md](./README.md)** - 项目主文档

---

## 🔐 安全建议

### 生产环境必做

1. **修改默认密码**
   ```bash
   POSTGRES_PASSWORD=generate-strong-password-here
   DASHBOARD_PASSWORD=another-strong-password
   ```

2. **生成强 JWT 密钥**
   ```bash
   openssl rand -base64 32
   # 将输出粘贴到 JWT_SECRET
   ```

3. **启用 HTTPS**
   - 获取 SSL 证书（Let's Encrypt）
   - 配置 Kong HTTPS

4. **限制网络访问**
   ```bash
   # 只允许特定 IP 访问
   KONG_PROXY_IP_ADDR=10.0.0.0/8
   ```

5. **配置备份**
   ```bash
   # 定期备份数据库
   0 2 * * * docker-compose exec db pg_dump -U postgres > /backup/db_$(date +\%Y\%m\%d).sql
   ```

---

## 📞 获取支持

如有问题，请：

1. 检查日志：`docker-compose logs`
2. 运行诊断：`./docker-troubleshoot.sh`
3. 查看文档：[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
4. 提交 Issue：项目 GitHub

---

## 📄 许可证

此配置遵循项目主许可证。

---

**最后更新**: 2026-01-20  
**版本**: 1.0.0  
**维护者**: AxonDoc Team
