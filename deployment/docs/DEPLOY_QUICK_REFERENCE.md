# AxonDoc 快速部署参考

## 🎯 5 分钟快速部署

### 第 1 步：配置 GitHub Secrets（一次性，5 分钟）

```bash
# 1. 生成 Docker Hub Token
https://hub.docker.com/settings/security → New Access Token

# 2. 添加到 GitHub
https://github.com/your-repo/settings/secrets/actions
  - DOCKERHUB_USERNAME: your-username
  - DOCKERHUB_TOKEN: dckr_pat_xxx...
```

### 第 2 步：服务器初始化（一次性，10 分钟）

```bash
# 服务器上运行一次
git clone https://github.com/your-repo/axon-doc.git
cd axon-doc

# 创建环境文件
cp .env.production.example .env.production
nano .env.production  # 编辑关键配置

# 给部署脚本权限
chmod +x deploy.sh

# 首次部署
./deploy.sh deploy
```

### 第 3 步：推送代码，自动部署（每次迭代）

```bash
# 推送到 main 分支会自动触发：
git add .
git commit -m "feat: add new feature"
git push origin main

# GitHub Actions 自动：
# 1. 构建 Next.js 镜像 (~5 min)
# 2. 构建 Crawler 镜像 (~3 min)
# 3. 推送到 Docker Hub (~2 min)

# 服务器更新镜像
./deploy.sh update-images
```

---

## 📋 完整命令速查

### 本地开发

```bash
# 开发新功能
git checkout -b feature/my-feature main
# ... 编码 ...
git push origin feature/my-feature

# 创建 PR 审核后合并
git checkout main
git merge feature/my-feature
git push origin main  # ← 触发自动构建
```

### GitHub Actions

```bash
# 查看构建状态
# https://github.com/your-repo/actions

# 查看镜像
# https://hub.docker.com/repositories/your-username

# 手动重新触发
# Actions → 选择工作流 → Re-run jobs
```

### 服务器操作

```bash
# 标准部署（拉取 + 备份 + 重启 + 检查）
./deploy.sh deploy

# 仅更新镜像并重启
./deploy.sh update-images

# 拉取但不启动
./deploy.sh pull-only

# 查看状态
./deploy.sh status

# 查看日志
./deploy.sh logs

# 回滚上一个版本
./deploy.sh rollback
```

---

## 🌊 完整工作流

```
┌─────────────────┐
│  1. git push    │  推送代码到 GitHub main 分支
└────────┬────────┘
         │
         ▼
    ⏳ 等待 7-12 分钟
         │
    ┌────┴──────────────────────┐
    │  GitHub Actions 自动:      │
    ├───────────────────────────┤
    │ • 构建 Next.js 镜像       │
    │ • 构建 Crawler 镜像       │
    │ • 推送到 Docker Hub       │
    └────┬──────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Docker Hub 镜像更新完成      │
│ 标签: latest, main, sha      │
└────┬────────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ 2. 服务器更新            │
│ ./deploy.sh update-images│
└────┬─────────────────────┘
     │
     ▼
  ⏳ 1-2 分钟
     │
     ▼
┌──────────────────────────┐
│ 3. 验证新版本            │
│ http://localhost:4321    │
└──────────────────────────┘
```

---

## 📊 性能参考

| 阶段 | 时间 | 说明 |
|------|------|------|
| GitHub Actions 构建 | 7-12 分钟 | 首次可能更长 |
| 镜像推送 | 1-2 分钟 | 取决于网络 |
| 服务器拉取 + 启动 | 1-5 分钟 | 取决于网络和硬件 |
| 健康检查 | 30-60 秒 | 验证服务正常 |
| **总耗时** | **10-20 分钟** | 代码推送到上线 |

---

## 🔐 关键配置

### .env.production 必改项

```bash
# 1. 数据库密码
POSTGRES_PASSWORD=your-strong-password

# 2. JWT 密钥（32+ 字符）
JWT_SECRET=generate-with-openssl-rand-base64-32

# 3. OpenAI API 密钥（可选）
OPENAI_API_KEY=sk-xxx...

# 4. 生产域名
SUPABASE_PUBLIC_URL=https://your-domain.com
```

### 镜像仓库地址

```bash
# Docker Hub 镜像
docker.io/your-username/axon-doc-nextjs:latest
docker.io/your-username/axon-doc-crawler:latest

# GitHub Container Registry（可选）
ghcr.io/your-username/axon-doc-nextjs:latest
ghcr.io/your-username/axon-doc-crawler:latest
```

---

## 🚨 故障快速处理

### 问题: 镜像无法拉取

```bash
# 1. 检查镜像是否存在
docker pull docker.io/your-username/axon-doc-nextjs:latest

# 2. 登录 Docker Hub
docker login
# Username: your-username
# Password: (或 Token)

# 3. 检查权限
# Docker Hub → 仓库 → Settings → Public
```

### 问题: 服务无法启动

```bash
# 查看详细错误
./deploy.sh logs

# 查看容器状态
./deploy.sh status

# 回滚上一个版本
./deploy.sh rollback
```

### 问题: GitHub Actions 构建失败

```bash
# 查看构建日志
https://github.com/your-repo/actions

# 常见原因：
# - 代码语法错误
# - 依赖版本不兼容
# - 磁盘空间不足

# 本地验证 Dockerfile
docker build -f Dockerfile.prod .
```

---

## 📱 推荐的工作流

### 日常开发

```bash
# 1. 创建功能分支
git checkout -b feature/my-feature

# 2. 开发测试（本地）
npm run dev
# ... 测试 ...

# 3. 提交代码
git add .
git commit -m "feat: add feature"
git push origin feature/my-feature

# 4. 创建 PR（审核代码）
# GitHub → Create Pull Request

# 5. 代码审核通过后合并
# Merge Pull Request

# 6. 自动部署
# main 分支推送触发 GitHub Actions
```

### 紧急修复

```bash
# 1. 从 main 创建修复分支
git checkout -b hotfix/critical-fix main

# 2. 快速修复
git commit -m "fix: critical issue"

# 3. 直接合并到 main
git checkout main
git merge hotfix/critical-fix
git push origin main

# 4. 服务器自动更新
./deploy.sh update-images
```

---

## 📞 常用链接

| 资源 | 链接 |
|------|------|
| **GitHub Actions** | https://github.com/your-repo/actions |
| **Docker Hub** | https://hub.docker.com/repositories/your-username |
| **服务器应用** | http://your-server:4321 |
| **Supabase Studio** | http://your-server:4321 (通过 Kong) |

---

## ✅ 部署检查清单

启动新服务器时检查:
- [ ] Docker 已安装
- [ ] Docker Compose 已安装
- [ ] .env.production 已配置
- [ ] deploy.sh 已授予执行权限
- [ ] GitHub Secrets 已配置
- [ ] 首次 ./deploy.sh deploy 已运行
- [ ] http://localhost:4321 可以访问

日常部署时检查:
- [ ] 代码已推送到 main 分支
- [ ] GitHub Actions 已完成构建
- [ ] 镜像已推送到 Docker Hub
- [ ] 服务器已运行 ./deploy.sh update-images
- [ ] 应用可以正常访问

---

## 🎓 学习资源

- **GitHub Actions**: https://docs.github.com/en/actions
- **Docker Compose**: https://docs.docker.com/compose/
- **Docker Hub**: https://docs.docker.com/docker-hub/

---

## 💡 Pro 技巧

### 1. 自动部署到服务器

```bash
# 编辑 crontab
crontab -e

# 每 6 小时自动检查更新
0 */6 * * * cd /path/to/axon-doc && ./deploy.sh update-images
```

### 2. 保留构建历史

```bash
# deploy.sh 自动保存日志
ls logs/deploy_*.log

# 查看部署历史
tail -f logs/deploy_*.log
```

### 3. 回滚快速恢复

```bash
# 自动备份数据库
ls backups/db_*.sql

# 快速回滚
./deploy.sh rollback
```

### 4. 跳过 CI/CD 构建

```bash
# 在提交信息中添加 [skip ci]
git commit -m "docs: update README [skip ci]"
```

---

## 🚀 下一步

1. 阅读 [.github/SECRETS_SETUP.md](.github/SECRETS_SETUP.md) - 配置 GitHub Secrets
2. 阅读 [CI_CD_SETUP.md](CI_CD_SETUP.md) - 完整的 CI/CD 详解
3. 阅读 [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) - 服务器部署指南

---

**开始部署！🚀**

```bash
# 一行命令完成初始化
git push origin main
```

---

**版本**: 1.0.0  
**最后更新**: 2026-01-20
