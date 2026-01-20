# AxonDoc CI/CD 完整指南

## 📋 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [GitHub 密钥配置](#github-密钥配置)
4. [本地开发](#本地开发)
5. [CI/CD 流程](#cicd-流程)
6. [服务器部署](#服务器部署)
7. [故障排除](#故障排除)
8. [常见问题](#常见问题)

---

## 概述

本方案使用 GitHub Actions 自动构建 Docker 镜像并推送到镜像仓库，然后在服务器上使用 `docker-compose pull` 拉取预构建镜像进行部署。

### 优势

✅ **一次构建，多次部署** - 镜像构建一次后可在任意服务器使用  
✅ **快速迭代** - 服务器端无需编译，直接拉取镜像  
✅ **节省资源** - 服务器无需安装编译工具  
✅ **自动化部署** - 推送到 main 分支时自动触发部署  
✅ **版本管理** - 每个提交都有对应的镜像版本  

---

## 架构设计

### CI/CD 工作流

```
┌─────────────────┐
│  git push       │ (推送代码到 GitHub)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  GitHub Actions                 │
├─────────────────────────────────┤
│ 1. 检出代码                     │
│ 2. 构建 Next.js 镜像            │
│ 3. 构建 Crawler 镜像            │
│ 4. 推送到 Docker Registry       │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────┐
│  Docker Registry     │
│  (Docker Hub /       │
│   GHCR)              │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  生产服务器          │
│  (docker-compose     │
│   pull & up)         │
└──────────────────────┘
```

### 部署流程

```
1️⃣ 开发者推送代码
   git push origin main

2️⃣ GitHub Actions 自动触发
   - 环境: Ubuntu Latest
   - 缓存: GitHub Actions Cache
   - 平台: 多平台 (linux/amd64, linux/arm64)

3️⃣ 构建镜像
   Docker Buildx 多平台构建

4️⃣ 推送到Registry
   Docker Hub / GitHub Container Registry

5️⃣ 服务器自动部署（可选）
   Webhook 通知或手动部署

6️⃣ 验证和健康检查
   确保新版本正常运行
```

---

## GitHub 密钥配置

### 步骤 1: 创建 Docker Hub 密钥

**Docker Hub 账户**

1. 访问 https://hub.docker.com/settings/security
2. 点击 "New Access Token"
3. 设置名称: `GitHub Actions`
4. 权限: Read, Write

**记录凭证**
- Username: `your-username`
- Token: `dckr_pat_xxxx...`

### 步骤 2: 添加 GitHub Secrets

1. 访问你的 GitHub 仓库
2. Settings → Secrets and variables → Actions
3. 点击 "New repository secret"

**添加以下 Secrets:**

| 名称 | 值 | 说明 |
|------|-----|------|
| `DOCKERHUB_USERNAME` | `your-username` | Docker Hub 用户名 |
| `DOCKERHUB_TOKEN` | `dckr_pat_xxx...` | Docker Hub Token |
| `DEPLOY_WEBHOOK_URL` | `https://your-server.com/webhook` | 部署 Webhook 地址（可选） |

### 步骤 3: GitHub Container Registry（可选）

如果使用 GHCR（GitHub 托管的镜像仓库）：

```bash
# 生成 GitHub Personal Access Token
# Settings → Developer settings → Personal access tokens → Tokens (classic)
# 权限: repo, write:packages

# Secrets 会自动可用
# - GITHUB_ACTOR: GitHub 用户名
# - GITHUB_TOKEN: 自动提供
```

---

## 本地开发

### 开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/my-feature

# 2. 进行开发和测试
# ... 编码 ...

# 3. 测试 Dockerfile（可选）
# 本地构建镜像验证
docker build -f Dockerfile.prod -t axon-doc-nextjs:test .
docker build -f crawler-service/Dockerfile -t axon-doc-crawler:test .

# 4. 提交更改
git add .
git commit -m "feat: add new feature"

# 5. 推送到 GitHub
git push origin feature/my-feature

# 6. 创建 Pull Request
# 在 GitHub 上创建 PR，触发检查

# 7. 合并到 main
# PR 审核通过后合并
git checkout main
git merge feature/my-feature
git push origin main
```

### 什么触发 CI/CD？

GitHub Actions 在以下条件触发：

```yaml
on:
  push:
    branches:
      - main          # 推送到 main 分支
      - develop       # 推送到 develop 分支
    paths:
      - 'Dockerfile.prod'
      - 'crawler-service/Dockerfile'
      - 'app/**'
      - 'lib/**'
      - 'components/**'
      - 'public/**'
      - 'crawler-service/app/**'
      - 'package.json'
      - 'bun.lock'
      - 'pyproject.toml'
      - 'uv.lock'
```

**只修改以下文件不会触发构建:**
- 文档（.md 文件）
- 配置文件（除了 package.json 和锁文件）
- 注释和其他不影响运行的更改

---

## CI/CD 流程

### 工作流执行

1. **检出代码** (~10s)
   - 从 GitHub 克隆仓库

2. **登录 Docker Registry** (~5s)
   - 使用 Secrets 中的凭证登录

3. **设置 Docker Buildx** (~20s)
   - 为多平台构建做准备

4. **生成镜像元数据** (~5s)
   - 计算标签: `latest`, `branch-name`, `sha`

5. **构建 Next.js 镜像** (~3-5 分钟)
   - 依赖安装
   - 应用构建
   - 镜像导出

6. **构建 Crawler 镜像** (~2-3 分钟)
   - Python 依赖安装
   - 镜像导出

7. **推送镜像** (~1-2 分钟)
   - 上传到 Docker Registry

8. **通知部署** (~1s)
   - 发送 Webhook 或输出日志

**总耗时:** 7-12 分钟

### 查看构建日志

1. 访问 GitHub Actions: https://github.com/your-repo/actions
2. 点击最新的工作流运行
3. 点击 `build-nextjs` 或 `build-crawler` 查看详细日志

### 镜像标签方案

构建完成的镜像会有以下标签:

```
docker.io/your-username/axon-doc-nextjs:latest      # 最新版本
docker.io/your-username/axon-doc-nextjs:main        # main 分支
docker.io/your-username/axon-doc-nextjs:main-abc123 # 提交 SHA

docker.io/your-username/axon-doc-crawler:latest     # Crawler 最新版本
```

---

## 服务器部署

### 前置要求

```bash
# 服务器需要安装
- Docker 20.10+
- Docker Compose 2.0+
- curl (用于 health check)
```

### 部署步骤

#### 1️⃣ 在服务器上初始化

```bash
# 克隆仓库（仅需要 docker-compose.prod.yml 等文件）
git clone https://github.com/your-repo/axon-doc.git
cd axon-doc

# 创建环境文件
cp .env.production.example .env.production
nano .env.production  # 编辑配置

# 给部署脚本权限
chmod +x deploy.sh
```

#### 2️⃣ 首次部署

```bash
# 使用部署脚本
./deploy.sh deploy

# 或使用 docker-compose 直接部署
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

#### 3️⃣ 后续更新（自动部署）

```bash
# 当新镜像推送到 Registry 时，只需在服务器上运行：
./deploy.sh update-images

# 或手动更新
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### 部署脚本用法

```bash
# 标准部署（拉取镜像 → 备份 → 重启 → 检查）
./deploy.sh deploy

# 仅拉取最新镜像
./deploy.sh pull-only

# 更新镜像并重启
./deploy.sh update-images

# 回滚到上一个版本
./deploy.sh rollback

# 查看部署状态
./deploy.sh status

# 查看实时日志
./deploy.sh logs

# 完全清理
./deploy.sh clean
```

### 自动部署设置（可选）

**使用 Cron 定时检查更新**

```bash
# 编辑 crontab
crontab -e

# 每 6 小时检查一次更新
0 */6 * * * cd /path/to/axon-doc && ./deploy.sh pull-only && docker-compose -f docker-compose.prod.yml up -d

# 每天凌晨 2 点更新
0 2 * * * cd /path/to/axon-doc && ./deploy.sh update-images
```

**使用 Webhook 自动部署**

1. 在 GitHub 仓库设置 Webhook
2. 服务器上运行简单的 HTTP 服务器接收通知
3. 接收到通知后执行 `./deploy.sh update-images`

示例（使用 Python Flask）:

```python
from flask import Flask, request
import subprocess
import os

app = Flask(__name__)

@app.route('/webhook/deploy', methods=['POST'])
def deploy():
    # 验证 GitHub 签名
    secret = os.getenv('GITHUB_WEBHOOK_SECRET')
    signature = request.headers.get('X-Hub-Signature-256')
    
    # 执行部署
    subprocess.run(['./deploy.sh', 'update-images'], cwd='/path/to/axon-doc')
    return 'Deploying...', 202

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

---

## 故障排除

### 问题 1: GitHub Actions 构建失败

**症状**: 工作流显示红色 ❌

**查看日志:**
```bash
# 1. 访问 GitHub Actions
https://github.com/your-repo/actions

# 2. 点击失败的运行
# 3. 查看 "build-nextjs" 或 "build-crawler" 的详细日志
```

**常见原因:**
- 代码语法错误
- 依赖安装失败
- Dockerfile 错误

**解决方案:**
```bash
# 本地测试 Dockerfile
docker build -f Dockerfile.prod .
docker build -f crawler-service/Dockerfile ./crawler-service
```

### 问题 2: 镜像推送失败

**症状**: 
```
failed to push to docker hub: authentication failed
```

**解决方案:**
1. 验证 GitHub Secrets 配置
2. 检查 Docker Hub Token 是否有效
3. 重新生成 Token 并更新 Secret

### 问题 3: 服务器无法拉取镜像

**症状:**
```
Error response from daemon: pull access denied
```

**解决方案:**
```bash
# 1. 检查镜像名称和标签
docker pull docker.io/your-username/axon-doc-nextjs:latest

# 2. 登录 Docker Hub
docker login

# 3. 检查镜像公开设置
# Docker Hub → Repository Settings → Public
```

### 问题 4: 服务器部署脚本卡住

**症状:**
```
Waiting for service to start...
```

**解决方案:**
```bash
# 查看服务日志
docker-compose -f docker-compose.prod.yml logs nextjs

# 查看容器状态
docker-compose -f docker-compose.prod.yml ps

# 增加超时时间（编辑 deploy.sh）
sleep 20  # 增加等待时间
```

---

## 常见问题

### Q1: 我应该在 main 还是 develop 分支工作？

**A:**
- **main**: 生产分支，代码必须稳定
  - 自动构建镜像
  - 自动部署到生产
  - 需要代码审核

- **develop**: 开发分支
  - 自动构建镜像（用于测试）
  - 不自动部署
  - 用于功能开发

```bash
# 推荐流程
git checkout -b feature/my-feature develop
# ... 开发 ...
git push origin feature/my-feature
# ... 代码审核 ...
git merge develop
git merge main
```

### Q2: 如何测试镜像在生产前？

**A:**
```bash
# 1. 使用 develop 分支镜像测试
docker pull docker.io/your-username/axon-doc-nextjs:develop

# 2. 在测试服务器运行
REGISTRY=docker.io IMAGE_TAG=develop ./deploy.sh

# 3. 验证无问题后合并到 main
```

### Q3: 如何回滚到上一个版本？

**A:**
```bash
# 方式一：使用部署脚本
./deploy.sh rollback

# 方式二：手动指定镜像版本
IMAGE_TAG=main-previous-sha docker-compose -f docker-compose.prod.yml up -d

# 方式三：查看历史镜像
docker image ls | grep axon-doc
docker pull docker.io/your-username/axon-doc-nextjs:main-abc123
```

### Q4: 我应该使用 Docker Hub 还是 GHCR？

**A:**

| 对比 | Docker Hub | GHCR |
|------|-----------|------|
| 免费配额 | 部分限制 | 充足 |
| 速度 | 一般 | 快（尤其在 GitHub Actions） |
| 私有仓库 | 需要订阅 | 免费 |
| 推荐 | 公开镜像 | GitHub 项目 |

### Q5: 构建失败了，我应该重新触发吗？

**A:**
```bash
# 方式一：重新推送代码
git commit --allow-empty -m "Retry build"
git push

# 方式二：在 GitHub 上手动重新运行
Actions → 选择工作流 → Re-run jobs

# 方式三：查看详细日志找出原因，修复后推送
```

### Q6: 我可以跳过 CI/CD 构建吗？

**A:**
```bash
# 在提交信息中添加 [skip ci] 或 [ci skip]
git commit -m "docs: update README [skip ci]"
git push

# GitHub Actions 会跳过此提交的构建
```

---

## 安全最佳实践

### ✅ 应该做

- [ ] 定期更新 Docker 镜像
- [ ] 使用强密码和 Token
- [ ] 定期轮换 Secrets
- [ ] 只在 main 分支部署
- [ ] 开启 GitHub 分支保护
- [ ] 要求代码审核
- [ ] 备份数据库
- [ ] 监控部署日志

### ❌ 不应该做

- [ ] 在代码中硬编码密钥
- [ ] 使用默认密码
- [ ] 在所有分支上部署
- [ ] 跳过代码审核
- [ ] 使用已弃用的 Actions
- [ ] 忽视安全警告

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `.github/workflows/docker-build.yml` | GitHub Actions 工作流 |
| `docker-compose.prod.yml` | 服务器部署配置 |
| `deploy.sh` | 服务器部署脚本 |
| `Dockerfile.prod` | Next.js 镜像定义 |
| `crawler-service/Dockerfile` | Crawler 镜像定义 |

---

**最后更新**: 2026-01-20  
**版本**: 1.0.0
