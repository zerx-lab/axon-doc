# GitHub Container Registry (GHCR) 配置指南

## 📋 概述

本项目使用 **GitHub Container Registry (GHCR)** 存储 Docker 镜像，无需配置额外的 Docker Hub 账户。

### 优势

✅ **无需额外配置** - 使用 GitHub 账户即可  
✅ **自动 Token** - GitHub Actions 自动生成 token  
✅ **私有仓库免费** - GitHub 账户的私有仓库无需付费  
✅ **速度快** - 与 GitHub Actions 集成，拉取速度快  
✅ **安全** - 与 GitHub 权限集成  

---

## 🚀 快速开始

### 1️⃣ 确保 GitHub Actions Secrets 配置正确

GitHub Actions 会自动使用 `GITHUB_TOKEN`，**无需额外配置**。

访问仓库 Settings 检查：
```
Settings → Secrets and variables → Actions
```

应该能看到一个 **自动提供** 的 `GITHUB_TOKEN`（不用你手动添加）。

### 2️⃣ 配置 .env.production

```bash
cd deployment

# 复制模板
cp .env.production.example .env.production

# 编辑关键配置
nano .env.production
```

**必须配置的项目:**

```bash
# GitHub 用户和仓库（用于 GHCR 镜像地址）
GITHUB_USER=your-github-username
GITHUB_REPO=axon-doc

# 其他必需配置...
POSTGRES_PASSWORD=your-password
JWT_SECRET=your-jwt-key-32-chars
```

### 3️⃣ 测试配置

```bash
# 查看镜像地址（应该显示 ghcr.io/...）
cat .env.production | grep GITHUB

# 输出应该是：
# GITHUB_USER=your-username
# GITHUB_REPO=axon-doc
# 
# 镜像地址将是：
# ghcr.io/your-username/axon-doc-nextjs:latest
# ghcr.io/your-username/axon-doc-crawler:latest
```

---

## 🔐 服务器拉取镜像认证

### 方式一：使用 GitHub Token（推荐）

```bash
# 1. 生成 Personal Access Token
# GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
# 权限: repo, read:packages

# 2. 保存到环境变量
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
export GITHUB_USER=your-github-username

# 3. 登录 GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USER --password-stdin

# 4. 拉取镜像
docker pull ghcr.io/$GITHUB_USER/axon-doc-nextjs:latest

# 输出应该显示:
# Status: Downloaded newer image for ghcr.io/your-username/axon-doc-nextjs:latest
```

### 方式二：使用 deploy.sh（自动处理）

deploy.sh 脚本会自动处理认证：

```bash
# 确保设置了环境变量
export GITHUB_TOKEN=ghp_xxx...
export GITHUB_USER=your-username

# 运行部署脚本，它会自动登录 GHCR
cd deployment
./scripts/deploy.sh update-images
```

### 方式三：在 .env 中配置

```bash
# .env.production
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USER=your-username
GITHUB_REPO=axon-doc
```

---

## 📍 镜像地址说明

### 镜像命名规则

```
ghcr.io/{github_user}/{github_repo}-{service}:{tag}

示例:
ghcr.io/john-doe/axon-doc-nextjs:latest
ghcr.io/john-doe/axon-doc-nextjs:main
ghcr.io/john-doe/axon-doc-nextjs:main-abc1234

ghcr.io/john-doe/axon-doc-crawler:latest
ghcr.io/john-doe/axon-doc-crawler:main
ghcr.io/john-doe/axon-doc-crawler:main-abc1234
```

### 标签含义

| 标签 | 说明 | 何时更新 |
|------|------|---------|
| `latest` | 最新版本 | 每次 main 分支推送 |
| `main` | main 分支当前版本 | 每次 main 分支推送 |
| `main-abc1234` | 特定提交版本 | 每次 main 分支推送 |
| `develop` | develop 分支版本 | 每次 develop 分支推送 |

---

## 📊 查看 GHCR 镜像

### 在 GitHub 上查看

```
https://github.com/your-username/axon-doc/pkgs/container/axon-doc-nextjs
https://github.com/your-username/axon-doc/pkgs/container/axon-doc-crawler
```

### 使用 Docker 命令查看

```bash
# 需要登录 GHCR
docker login ghcr.io

# 列出所有标签
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://ghcr.io/v2/your-username/axon-doc-nextjs/tags/list | jq .tags
```

---

## 🔧 故障排除

### 问题 1: "authentication failed"

```
Error: authentication failed
```

**原因**: Token 过期或权限不足

**解决:**
```bash
# 1. 生成新的 Personal Access Token
# GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

# 2. 确保权限包括:
# ✅ repo
# ✅ read:packages
# ✅ write:packages (如果需要推送)

# 3. 重新登录
echo $NEW_GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USER --password-stdin
```

### 问题 2: "manifest not found"

```
Error: manifest not found
```

**原因**: 镜像还未构建或标签错误

**解决:**
```bash
# 1. 检查 GitHub Actions 是否成功构建
# GitHub → Actions → 查看最新的工作流

# 2. 检查镜像名称是否正确
docker pull ghcr.io/your-username/axon-doc-nextjs:latest

# 3. 如果镜像名称有误，检查 .env.production:
cat deployment/.env.production | grep GITHUB

# 4. 等待 GitHub Actions 完成构建（通常 7-12 分钟）
```

### 问题 3: "image not found locally"

```
docker: Error response from daemon: image not found
```

**原因**: 本地没有拉取镜像

**解决:**
```bash
# 拉取镜像
docker pull ghcr.io/your-username/axon-doc-nextjs:latest

# 或使用 deploy.sh
cd deployment
./scripts/deploy.sh pull-only
```

### 问题 4: 权限被拒绝

```
Error: insufficient_scope
```

**原因**: Token 权限不足

**解决:**
1. 删除旧的 Personal Access Token
2. 创建新的，确保包含:
   - `repo` (完整访问)
   - `read:packages` (读取包)
   - `write:packages` (写入包)

---

## 🔄 工作流完整示例

### GitHub Actions 端

```yaml
# .github/workflows/docker-build.yml (已配置)

1. 代码推送到 main
   ↓
2. GitHub Actions 自动触发
   ├─ 登录 GHCR (使用自动 GITHUB_TOKEN)
   ├─ 构建 Next.js 镜像
   ├─ 构建 Crawler 镜像
   └─ 推送到 GHCR
   ↓
3. 镜像已准备好拉取
```

### 服务器端

```bash
# deployment/.env.production
GITHUB_TOKEN=ghp_xxx...
GITHUB_USER=your-username
GITHUB_REPO=axon-doc

# 运行部署
cd deployment
./scripts/deploy.sh update-images

# 脚本自动:
# 1. 登录 GHCR
# 2. 拉取最新镜像
# 3. 停止旧容器
# 4. 启动新容器
# 5. 运行健康检查
```

---

## 📝 Personal Access Token 创建指南

### 步骤 1: 访问 GitHub Settings

```
https://github.com/settings/tokens
```

或手动导航：
```
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
```

### 步骤 2: 生成新 Token

1. 点击 "Generate new token (classic)"
2. 输入名称: `GHCR Docker Pull` 或 `Deployment Token`
3. 设置过期时间: 90 天 或 无期限
4. 选择权限:

```
✅ repo                    - 完整的 repo 访问
✅ read:packages           - 读取包 (拉取镜像)
✅ write:packages          - 写入包 (推送镜像)
```

### 步骤 3: 复制 Token

生成后立即复制 Token（只显示一次）：

```
ghp_1234567890abcdefghijklmnopqrstuvwxyz
```

### 步骤 4: 保存到服务器

```bash
# 选项 A: 保存到文件（谨慎处理！）
echo "export GITHUB_TOKEN=ghp_xxx..." >> ~/.bashrc

# 选项 B: 保存到 .env.production
echo "GITHUB_TOKEN=ghp_xxx..." >> deployment/.env.production

# 选项 C: 使用系统密钥管理器
# Linux: pass, gopass 等
# macOS: Keychain
# Windows: 凭据管理器
```

### ⚠️ 安全提示

- 🚨 **千万不要提交到 Git**
- 🔐 限制 Token 权限（只给需要的）
- 🔄 定期更新 Token
- 🗑️ 弃用旧的 Token
- 📝 记录 Token 创建日期

---

## 🎓 深入理解 GHCR

### GHCR 与 Docker Hub 的对比

| 功能 | GHCR | Docker Hub |
|------|------|-----------|
| 免费私有仓库 | ✅ 无限 | ❌ 1 个 |
| 免费存储 | ✅ 5GB | ❌ 部分限制 |
| 与 GitHub 集成 | ✅ 自动 | ❌ 手动配置 |
| API 速率限制 | ✅ 充足 | ❌ 受限（免费） |
| 推荐 | ✅ GitHub 项目 | ✅ 公开镜像 |

### 镜像可见性设置

在 GitHub 上管理镜像权限：

1. 访问 `https://github.com/your-username?tab=packages`
2. 选择镜像包
3. 点击 Package settings
4. 设置可见性为 "Private" 或 "Public"

### 自动清理旧镜像

```bash
# 在 GitHub 上设置自动删除旧版本
# Packages → Package settings → Retention policy

# 示例: 保留最后 5 个版本
```

---

## 📚 相关资源

- [GitHub Container Registry 官方文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Actions 环境变量](https://docs.github.com/en/actions/learn-github-actions/environment-variables)
- [Personal Access Tokens 官方文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

---

## ✅ 检查清单

部署前确认：

- [ ] GitHub Actions 工作流正在运行
- [ ] 镜像已成功推送到 GHCR
- [ ] Personal Access Token 已生成
- [ ] Token 权限包括 `read:packages`
- [ ] `.env.production` 中的 GITHUB_USER 和 GITHUB_REPO 正确
- [ ] 服务器可以连接到互联网（拉取镜像）
- [ ] 已测试 `docker pull ghcr.io/...`

---

**版本**: 1.0.0  
**最后更新**: 2026-01-20
