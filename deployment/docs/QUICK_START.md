# AxonDoc Docker 快速开始

## 60 秒快速启动

### 1. 准备环境

```bash
# 复制环境文件
cp .env.production.example .env.production
```

### 2. 启动所有服务

```bash
# 方式一：使用启动脚本（推荐）
chmod +x docker-entrypoint.sh
./docker-entrypoint.sh

# 方式二：直接使用 docker-compose
docker-compose up -d
```

### 3. 等待服务启动（2-3 分钟）

```bash
# 监控启动进度
docker-compose logs -f
```

### 4. 验证服务

```bash
# 检查所有服务状态
docker-compose ps

# 运行健康检查
chmod +x docker-healthcheck.sh
./docker-healthcheck.sh
```

### 5. 访问应用

| 服务 | 地址 |
|------|------|
| 主应用 | http://localhost:4321 |
| Supabase Studio | http://localhost:4321 (通过 Kong 转发) |
| Crawler API | http://localhost:4321/api/crawler |

---

## 环境变量快速配置

### 最小化配置（用于本地开发）

编辑 `.env.production`，修改以下项目：

```bash
# 数据库密码（生产环境请修改）
POSTGRES_PASSWORD=your-strong-password

# JWT 密钥（生产环境必须修改）
JWT_SECRET=your-secret-key-at-least-32-chars

# OpenAI API 密钥（如需使用爬虫分析功能）
OPENAI_API_KEY=your-openai-api-key
```

### 生产环境配置

额外配置项：

```bash
# 生产 URL（使用真实域名）
SUPABASE_PUBLIC_URL=https://your-domain.com

# SMTP 邮件配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Logflare 日志服务
LOGFLARE_API_KEY=your-logflare-api-key
```

---

## 常见操作

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务
docker-compose logs -f nextjs

# 查看最近 50 行
docker-compose logs --tail 50 crawler
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart nextjs

# 重新构建并重启
docker-compose up -d --build
```

### 停止服务

```bash
# 保留数据停止
docker-compose stop

# 删除容器但保留数据
docker-compose down

# 删除一切（包括数据）
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

---

## 故障快速排查

### 服务无法启动

```bash
# 1. 查看详细错误
docker-compose logs <service-name>

# 2. 检查端口是否被占用
lsof -i :4321

# 3. 清理并重新启动
docker-compose down -v
docker-compose up -d
```

### 服务之间无法通信

```bash
# 1. 测试连接
docker-compose exec nextjs curl -v http://crawler:8001/health

# 2. 检查 DNS
docker-compose exec nextjs nslookup crawler

# 3. 查看网络
docker network inspect axon-doc_axon-network
```

### 数据库连接错误

```bash
# 1. 检查数据库状态
docker-compose exec db pg_isready -U postgres

# 2. 查看数据库日志
docker-compose logs db

# 3. 测试连接
docker-compose exec db psql -U postgres -c "SELECT 1;"
```

---

## 重要提示

⚠️ **生产环境安全建议**：

1. **修改默认密码**
   - POSTGRES_PASSWORD
   - DASHBOARD_PASSWORD

2. **生成强密钥**
   - JWT_SECRET（至少 32 字符）
   - 使用 `openssl rand -base64 32` 生成

3. **配置真实域名**
   - SUPABASE_PUBLIC_URL 使用真实域名而非 localhost

4. **启用 HTTPS**
   - 配置 SSL 证书
   - 修改 Kong HTTPS_PORT

5. **备份数据**
   - 定期备份 PostgreSQL 数据
   - 备份命令: `docker-compose exec db pg_dump -U postgres > backup.sql`

---

## 下一步

详细文档请参考: [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)

需要帮助? 查看常见问题: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
