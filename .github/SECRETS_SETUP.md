# GitHub Secrets 配置指南

## 📋 所需 Secrets

### ✅ 好消息！无需手动配置 Secrets

本项目使用 **GitHub Container Registry (GHCR)**，自动使用 GitHub 提供的 `GITHUB_TOKEN`。

**无需手动配置任何 Secrets！** ✨

### 🔄 工作原理

1. **GitHub Actions 自动提供** `GITHUB_TOKEN`
2. **自动登录** GHCR（GitHub Container Registry）
3. **自动推送** 构建的镜像
4. **服务器拉取** 时使用 Personal Access Token

### 📝 服务器部署时所需配置

服务器端需要配置以下环境变量（用于拉取镜像）：

#### 方式 A: 使用 Personal Access Token（推荐）

1. **生成 GitHub Personal Access Token**
   - 访问: https://github.com/settings/tokens
   - 点击: "Generate new token (classic)"
   - 名称: `Deployment Token`
   - 权限选择:
     - ✅ `repo` (完整访问)
     - ✅ `read:packages` (读取包)
     - ✅ `write:packages` (写入包)
   - 复制生成的 Token

2. **在服务器上配置**
   ```bash
   # 编辑 deployment/.env.production
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   GITHUB_USER=your-github-username
   GITHUB_REPO=axon-doc
   ```

#### 方式 B: 通过环境变量

```bash
# 执行部署前设置
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
export GITHUB_USER=your-github-username

cd deployment
./scripts/deploy.sh update-images
```

### 3. 部署 Webhook（可选）

用于在镜像构建完成后自动部署到服务器

```
Name: DEPLOY_WEBHOOK_URL
Value: https://your-server.com/webhook/deploy
```
   Name: DOCKERHUB_USERNAME
   Value: your-docker-hub-username
   ```
   
   **Secret #2: DOCKERHUB_TOKEN**
   ```
   Name: DOCKERHUB_TOKEN
   Value: dckr_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2. GitHub Container Registry（可选）

用于推送到 GitHub 自己的镜像仓库

#### 步骤

1. **创建 Personal Access Token**
   - Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token
   - 名称: `GitHub Actions`
   - 权限选择:
     - ✅ `repo` (full control)
     - ✅ `write:packages` (write packages)
     - ✅ `read:packages` (read packages)
   - 复制 Token

2. **添加到 GitHub Secrets**
   ```
   Name: GH_PAT
   Value: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 3. 部署 Webhook（可选）

用于在镜像构建完成后自动部署到服务器

```
Name: DEPLOY_WEBHOOK_URL
Value: https://your-server.com/webhook/deploy
```

---

## 📝 详细配置步骤

### GitHub 端（GitHub Actions）

**好消息：无需任何配置！** 

GitHub Actions 自动提供 `GITHUB_TOKEN`，无需手动添加。

### 服务器端（拉取镜像）

#### 1. 生成 Personal Access Token

访问 GitHub Settings:
```
https://github.com/settings/tokens
```

**步骤:**
1. 点击 "Tokens (classic)"
2. 点击 "Generate new token (classic)"
3. 设置名称为 "Deployment Token"
4. 设置过期时间（推荐 90 天）
5. 选择权限:
   - ✅ `repo` (完整访问)
   - ✅ `read:packages` (读取包)
6. 点击 "Generate token"
7. 复制生成的 Token（形式: `ghp_XXXXXXXX...`）

**⚠️ 重要**: Token 只显示一次，复制并立即保存！

#### 2. 配置在服务器上

在服务器编辑 `deployment/.env.production`:

```bash
# GitHub Container Registry 认证
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USER=your-github-username
GITHUB_REPO=axon-doc
```

#### 3. 验证配置

```bash
# 测试登录
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
echo $GITHUB_TOKEN | docker login ghcr.io -u your-github-username --password-stdin

# 输出应该显示: Login Succeeded

# 拉取镜像测试
docker pull ghcr.io/your-github-username/axon-doc-nextjs:latest
```

---

## 🔐 安全最佳实践

### ✅ 应该做

1. **定期轮换 Token**
   ```bash
   # 每 90 天重新生成一次 Token
   - 在 GitHub 生成新 Token
   - 更新服务器上的 .env.production
   - 删除旧 Token
   ```

2. **限制权限**
   - 只给予必需的权限
   - 推荐: `repo` + `read:packages`
   - 不要给予 `admin:*` 权限

3. **监控使用**
   - 定期检查 GitHub 活动日志
   - 查看 Personal Access Tokens 列表
   - 检查镜像推送历史

4. **安全存储**
   - 使用系统密钥管理器（Keychain/密钥环）
   - 或者保存在受保护的配置文件中
   - 不要 hardcode 到脚本中

### ❌ 不应该做

1. ❌ 在代码中 hardcode Token
2. ❌ 在公开仓库中保存 Token
3. ❌ 在日志或输出中显示 Token
4. ❌ 与他人共享 Token
5. ❌ 使用过期的 Token
6. ❌ 给予过多权限

---

## 🔄 工作流测试

### 验证 GitHub Actions 配置正确

1. **推送测试代码到 main**
   ```bash
   # 做一个无关的更改触发构建
   echo "# Test" >> README.md
   git add README.md
   git commit -m "test: trigger build"
   git push origin main
   ```

2. **查看 Actions 日志**
   - 访问 GitHub Actions: https://github.com/your-repo/actions
   - 点击最新的工作流运行
   - 查看 "build-nextjs" 或 "build-crawler"
   - 找到 "Login to GitHub Container Registry" 步骤
   - 如果显示 ✅ 说明认证成功

3. **验证镜像推送**
   ```bash
   # 查看镜像包
   https://github.com/your-username/axon-doc/pkgs/container/axon-doc-nextjs
   
   # 在本地拉取验证
   docker pull ghcr.io/your-username/axon-doc-nextjs:latest
   ```

---

## 🚨 常见错误

### 错误 1: "permission denied"

```
Error: Error response from daemon: 
  denied: requested access to the resource is denied
```

**原因**: Personal Access Token 权限不足

**解决:**
1. 检查 Token 是否有 `read:packages` 权限
2. 重新生成新 Token 并确保权限正确
3. 更新 `.env.production` 中的 GITHUB_TOKEN

### 错误 2: "authentication failed"

```
Error: authentication failed
```

**原因**: Token 错误或已过期

**解决:**
1. 验证 GITHUB_TOKEN 是否完整（无多余空格）
2. 验证 GITHUB_USER 是否正确
3. 生成新的 Personal Access Token

### 错误 3: "manifest not found"

```
Error: manifest not found
```

**原因**: 镜像还未构建或标签错误

**解决:**
- 等待 GitHub Actions 完成构建（7-12 分钟）
- 查看 Actions 日志确认构建成功
- 检查镜像名称拼写

---

## 📊 为什么使用 GHCR？

| 功能 | Docker Hub | GHCR |
|------|-----------|------|
| **限流** | 每 6 小时 100 次拉取（免费） | ✅ 充足 |
| **免费私有仓库** | ❌ 1 个限制 | ✅ 无限 |
| **速度** | 一般 | ✅ 快 |
| **与 GitHub 集成** | ❌ 手动 | ✅ 自动 |
| **推荐** | 公开镜像 | ✅ GitHub 项目 |

---

## 🔗 相关链接

- [GitHub Personal Access Tokens 管理](https://github.com/settings/tokens)
- [GitHub Container Registry 文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Actions 安全指南](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [GHCR 完整配置指南](./deployment/docs/GHCR_SETUP.md)

---

## ✅ 配置检查清单

### GitHub 端（无需配置）
- [ ] GitHub Actions 工作流已启用
- [ ] GITHUB_TOKEN 自动可用（无需手动添加）

### 服务器端（需要配置）
- [ ] Personal Access Token 已生成
- [ ] Token 包含 `repo` 权限
- [ ] Token 包含 `read:packages` 权限
- [ ] Token 已保存到 `deployment/.env.production`
- [ ] GITHUB_USER 和 GITHUB_REPO 已配置
- [ ] 已验证服务器能够登录 GHCR
- [ ] 已验证服务器能够拉取镜像

---

## 🚀 快速部署

完成以上配置后：

1. **推送代码**
   ```bash
   git push origin main
   ```

2. **GitHub Actions 自动：**
   - 构建 Docker 镜像（7-12 分钟）
   - 推送到 GHCR

3. **服务器拉取和部署：**
   ```bash
   cd deployment
   ./scripts/deploy.sh update-images
   ```

4. **新版本上线！** ✅

**下一步**: 
- 查看 [GHCR_SETUP.md](./deployment/docs/GHCR_SETUP.md) 了解 GHCR 详细配置
- 查看 [CI_CD_SETUP.md](./deployment/docs/CI_CD_SETUP.md) 了解完整的 CI/CD 流程
