# 📦 部署目录

本目录包含所有与生产部署相关的配置和脚本。

## 📋 目录结构

```
deployment/
├── README.md                          # 本文件 - 部署说明
├── docker-compose.prod.yml            # 生产环境 Docker Compose 配置
├── kong-config.yml                    # Kong API 网关配置
├── .env.production.example            # 环境变量配置示例
├── .env.production                    # 实际环境变量（不提交到 Git）
│
├── scripts/                           # 部署和管理脚本
│   ├── deploy.sh                      # 主部署脚本（自动拉取、备份、重启）
│   ├── docker-entrypoint.sh           # Docker 启动入口脚本（本地开发用）
│   ├── docker-healthcheck.sh          # 服务健康检查脚本
│   └── docker-troubleshoot.sh         # 故障诊断脚本
│
├── docs/                              # 部署文档
│   ├── DEPLOYMENT.md                  # 完整部署指南
│   ├── CI_CD_SETUP.md                 # GitHub Actions CI/CD 配置指南
│   ├── QUICK_START.md                 # 快速开始指南
│   ├── DEPLOY_QUICK_REFERENCE.md      # 快速参考
│   └── GHCR_SETUP.md                  # GitHub Container Registry 配置
│
└── examples/                          # 示例文件
    └── systemd-service.example        # systemd 服务文件示例（可选）
```

## 🚀 快速开始

### 1️⃣ 初始化服务器（首次部署）

```bash
# 克隆项目
git clone https://github.com/your-repo/axon-doc.git
cd axon-doc/deployment

# 复制和编辑环境配置
cp .env.production.example .env.production
nano .env.production

# 查看前置要求
source scripts/deploy.sh check

# 执行首次部署
./scripts/deploy.sh deploy
```

### 2️⃣ 日常更新（推送代码后）

```bash
cd /path/to/axon-doc/deployment

# 拉取最新镜像并重启
./scripts/deploy.sh update-images
```

### 3️⃣ 查看日志和状态

```bash
# 查看部署状态
./scripts/deploy.sh status

# 查看实时日志
./scripts/deploy.sh logs

# 健康检查
./scripts/docker-healthcheck.sh
```

## 📝 环境变量配置

### 必须配置的项目

编辑 `.env.production` 文件：

```bash
# 1. 数据库密码（生产环境请修改）
POSTGRES_PASSWORD=your-strong-password

# 2. JWT 密钥（至少 32 字符）
JWT_SECRET=$(openssl rand -base64 32)

# 3. GitHub 信息（用于拉取 GHCR 镜像）
GITHUB_USER=your-github-username
GITHUB_REPO=your-repo-name

# 4. OpenAI API 密钥（如需 AI 功能）
OPENAI_API_KEY=sk-xxx...

# 5. 公开访问地址（生产环境使用域名）
SUPABASE_PUBLIC_URL=https://your-domain.com
```

## 🔐 GitHub Container Registry (GHCR) 认证

使用 GHCR 存储镜像需要认证：

```bash
# 方式一：使用 GitHub Personal Access Token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
echo $GITHUB_TOKEN | docker login ghcr.io -u your-github-username --password-stdin

# 方式二：设置到环境变量（deploy.sh 会自动使用）
echo "export GITHUB_TOKEN=ghp_xxxxxxxxxxxx" >> ~/.bashrc
```

## 📚 文档索引

| 文档 | 适合场景 | 阅读时间 |
|------|--------|---------|
| **QUICK_START.md** | 60秒快速上手 | 5 分钟 |
| **DEPLOYMENT.md** | 完整部署指南 | 30 分钟 |
| **CI_CD_SETUP.md** | 配置 GitHub Actions | 20 分钟 |
| **GHCR_SETUP.md** | 配置 GHCR 认证 | 10 分钟 |
| **DEPLOY_QUICK_REFERENCE.md** | 常用命令速查 | 3 分钟 |

## 🛠️ 脚本说明

### deploy.sh - 主部署脚本

```bash
./scripts/deploy.sh deploy              # 完整部署（拉取+备份+重启+检查）
./scripts/deploy.sh pull-only           # 仅拉取镜像
./scripts/deploy.sh update-images       # 更新镜像并重启
./scripts/deploy.sh rollback            # 回滚到上一个版本
./scripts/deploy.sh status              # 查看状态
./scripts/deploy.sh logs                # 查看日志
./scripts/deploy.sh clean               # 清理所有容器和数据
```

### docker-healthcheck.sh - 健康检查

验证所有服务是否正常运行：

```bash
./scripts/docker-healthcheck.sh
```

### docker-troubleshoot.sh - 故障诊断

自动诊断常见问题：

```bash
./scripts/docker-troubleshoot.sh
```

## 📊 部署流程

```
1. git push origin main
   ↓
2. GitHub Actions 自动构建镜像（7-12 分钟）
   ├─ 构建 Next.js 镜像
   └─ 构建 Crawler 镜像
   ↓
3. 推送到 GitHub Container Registry (GHCR)
   ↓
4. 服务器拉取新镜像
   ./scripts/deploy.sh update-images
   ↓
5. 容器自动重启并进行健康检查
   ↓
6. 新版本上线 ✅
```

## ✅ 部署检查清单

### 首次部署前

- [ ] Docker 已安装 (20.10+)
- [ ] Docker Compose 已安装 (2.0+)
- [ ] `.env.production` 已配置
- [ ] GITHUB_TOKEN 已设置
- [ ] 磁盘空间 >= 20GB
- [ ] 内存 >= 8GB

### 首次部署后

- [ ] `./scripts/deploy.sh status` 显示所有服务运行
- [ ] `./scripts/docker-healthcheck.sh` 显示所有检查通过
- [ ] 应用可访问: http://your-server:4321
- [ ] 查看日志无错误: `./scripts/deploy.sh logs`

### 每次代码推送后

- [ ] GitHub Actions 构建成功
- [ ] 镜像已推送到 GHCR
- [ ] 运行: `./scripts/deploy.sh update-images`
- [ ] 验证应用正常: http://your-server:4321

## 🔄 定时更新设置（可选）

使用 crontab 定期更新镜像：

```bash
# 编辑 crontab
crontab -e

# 每 6 小时检查一次更新
0 */6 * * * cd /path/to/axon-doc/deployment && ./scripts/deploy.sh update-images

# 每天凌晨 2 点更新
0 2 * * * cd /path/to/axon-doc/deployment && ./scripts/deploy.sh update-images
```

## 📞 常见问题

### Q: 如何查看部署日志？
```bash
./scripts/deploy.sh logs
```

### Q: 如何回滚到上一个版本？
```bash
./scripts/deploy.sh rollback
```

### Q: 如何重启所有服务？
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Q: 如何备份数据库？
```bash
docker-compose -f docker-compose.prod.yml exec db pg_dump -U postgres > backup.sql
```

### Q: 如何进入容器调试？
```bash
docker-compose -f docker-compose.prod.yml exec nextjs bash
```

## 📖 更多信息

- 完整部署指南: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- GitHub Actions 配置: [docs/CI_CD_SETUP.md](./docs/CI_CD_SETUP.md)
- 快速参考: [docs/DEPLOY_QUICK_REFERENCE.md](./docs/DEPLOY_QUICK_REFERENCE.md)
- 根项目目录: [../README.md](../README.md)

## 🎯 项目结构概览

```
axon-doc/
├── deployment/               # 👈 你在这里 - 部署相关
│   ├── scripts/             # 部署脚本
│   ├── docs/                # 部署文档
│   └── ...
├── docker/                  # Docker 镜像定义
│   ├── Dockerfile.prod      # Next.js 生产镜像
│   └── ...
├── app/                     # Next.js 应用代码
├── lib/                     # 工具库
├── components/              # React 组件
├── crawler-service/         # Crawler Python 服务
├── .github/                 # GitHub 配置
│   └── workflows/           # GitHub Actions 工作流
└── ...
```

---

**版本**: 1.0.0  
**最后更新**: 2026-01-20  
**维护者**: AxonDoc Team
