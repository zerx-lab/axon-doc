<div align="center">

# 🧠 AxonBase

**AI 驱动的智能知识库系统**

混合检索 · 上下文理解 · 权限管理

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## ✨ 特性

<table>
<tr>
<td width="50%">

### 🔍 智能检索
- **混合搜索** - 向量相似度 + BM25 关键词
- **RRF 融合** - Reciprocal Rank Fusion 排序
- **重排序** - Cohere / Jina / Voyage 支持

</td>
<td width="50%">

### 📚 知识管理
- **知识库** - 创建和组织多个知识库
- **文档处理** - 自动分块和向量化
- **上下文检索** - Anthropic 风格的上下文增强

</td>
</tr>
<tr>
<td width="50%">

### 🔐 权限系统
- **RBAC** - 基于角色的访问控制
- **细粒度权限** - 灵活的权限配置
- **超级管理员** - 完整的系统控制

</td>
<td width="50%">

### 🤖 AI 能力
- **多模型支持** - Claude / GPT / 兼容 API
- **流式响应** - 实时对话体验
- **后台任务** - 异步处理和进度追踪

</td>
</tr>
</table>

---

## 🛠️ 技术栈

<table>
<tr>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=nextjs" width="48" height="48" alt="Next.js" />
<br>Next.js 16
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=react" width="48" height="48" alt="React" />
<br>React 19
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=supabase" width="48" height="48" alt="Supabase" />
<br>Supabase
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=postgres" width="48" height="48" alt="PostgreSQL" />
<br>pgvector
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=ts" width="48" height="48" alt="TypeScript" />
<br>TypeScript
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=tailwind" width="48" height="48" alt="Tailwind" />
<br>Tailwind v4
</td>
</tr>
</table>

**AI SDK**: Vercel AI SDK · Anthropic SDK · OpenAI SDK

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Bun (推荐) 或 npm/yarn
- Docker & Docker Compose

### 1️⃣ 安装依赖

```bash
git clone https://github.com/your-org/axon-base.git
cd axon-base
bun install
```

### 2️⃣ 启动 Supabase

```bash
cd supabase-docker
docker compose up -d
```

### 3️⃣ 配置环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> 💡 密钥可在 `supabase-docker/.env` 中找到，或运行 `node generate_keys.js` 生成

### 4️⃣ 初始化数据库

```bash
bun run db:push
```

### 5️⃣ 启动开发服务器

```bash
bun run dev
```

🎉 访问 http://localhost:3000

---

## 🔑 默认账户

| 用户名 | 密码 | 角色 |
|:------:|:----:|:----:|
| `clown` | `012359clown` | 超级管理员 |

> ⚠️ **生产环境请务必修改默认密码！**

---

## 📋 常用命令

<details>
<summary><b>🖥️ 开发命令</b></summary>

| 命令 | 说明 |
|------|------|
| `bun run dev` | 启动开发服务器 |
| `bun run build` | 生产环境构建 |
| `bun run start` | 启动生产服务器 |
| `bun run lint` | 运行 ESLint 检查 |

</details>

<details>
<summary><b>🐳 Docker 命令</b></summary>

| 命令 | 说明 |
|------|------|
| `bun run docker:up` | 启动 Supabase 容器 |
| `bun run docker:down` | 停止 Supabase 容器 |
| `bun run docker:logs` | 查看容器日志 |

</details>

<details>
<summary><b>🗄️ 数据库命令</b></summary>

| 命令 | 说明 |
|------|------|
| `bun run db:push` | 应用数据库迁移 |
| `bun run db:reset` | 重置数据库并重新迁移 |
| `bun run db:seed` | 仅运行种子数据 |
| `bun run db:psql` | 打开 PostgreSQL 终端 |
| `bun run db:diff` | 生成迁移差异 |

</details>

---

## 📁 项目结构

```
axon-base/
├── 📂 app/                       # Next.js App Router
│   ├── 📂 api/                   # API 路由
│   │   ├── 📂 auth/              # 认证 (登录/登出/验证)
│   │   ├── 📂 admin/             # 管理 (用户/角色)
│   │   ├── 📂 kb/                # 知识库 CRUD
│   │   ├── 📂 documents/         # 文档管理
│   │   ├── 📂 embeddings/        # 向量嵌入
│   │   └── 📂 search/            # 混合搜索
│   ├── 📂 dashboard/             # 仪表盘页面
│   └── 📂 login/                 # 登录页面
├── 📂 components/                # React 组件
│   └── 📂 ui/                    # UI 基础组件
├── 📂 lib/                       # 工具库
│   ├── 📂 supabase/              # Supabase 客户端
│   ├── 📂 chunking/              # 文本分块
│   ├── 📄 embeddings.ts          # 向量生成
│   └── 📄 reranker.ts            # 重排序器
├── 📂 supabase/                  # 数据库配置
│   ├── 📂 migrations/            # SQL 迁移文件
│   └── 📄 seed.sql               # 种子数据
└── 📂 supabase-docker/           # Docker 配置
```

---

## 🔐 权限系统

### 系统角色

| 角色 | 说明 | 权限范围 |
|:----:|------|:--------:|
| 🔴 Super Administrator | 超级管理员 | `*` 全部权限 |
| 🟠 Administrator | 管理员 | 用户/角色/知识库/文档/嵌入 |
| 🟡 User Manager | 用户管理员 | 用户管理 |
| 🟢 Viewer | 只读用户 | 查看权限 |

### 权限列表

<details>
<summary>展开查看完整权限</summary>

| 权限 | 说明 |
|------|------|
| `users:list` | 查看用户列表 |
| `users:create` | 创建用户 |
| `users:update` | 更新用户 |
| `users:delete` | 删除用户 |
| `users:toggle_active` | 启用/禁用用户 |
| `users:reset_password` | 重置密码 |
| `roles:list` | 查看角色 |
| `roles:create` | 创建角色 |
| `roles:update` | 更新角色 |
| `roles:delete` | 删除角色 |
| `kb:list` | 查看知识库 |
| `kb:create` | 创建知识库 |
| `kb:update` | 更新知识库 |
| `kb:delete` | 删除知识库 |
| `docs:list` | 查看文档 |
| `docs:create` | 上传文档 |
| `docs:update` | 更新文档 |
| `docs:delete` | 删除文档 |
| `embedding:view` | 查看嵌入 |
| `embedding:manage` | 管理嵌入 |
| `embedding:search` | 搜索权限 |
| `system:settings` | 系统设置 |
| `system:logs` | 系统日志 |

</details>

---

## 🤖 AI 配置

在设置页面配置 AI 服务商：

### 嵌入模型
- OpenAI `text-embedding-3-small` / `text-embedding-3-large`
- Voyage AI `voyage-3` / `voyage-3-lite`
- 本地兼容 API

### 对话模型
- Anthropic Claude `claude-sonnet-4-20250514`
- OpenAI GPT `gpt-4o` / `gpt-4o-mini`
- 兼容 OpenAI API 的服务

### 重排序模型
- Cohere `rerank-english-v3.0`
- Jina `jina-reranker-v2-base-multilingual`
- Voyage `rerank-2`

---

## 🔄 检索流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户查询   │ ──▶ │  混合检索    │ ──▶ │   重排序    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                    ┌──────┴──────┐             │
                    ▼             ▼             ▼
              ┌─────────┐   ┌─────────┐   ┌─────────┐
              │ Vector  │   │  BM25   │   │ Rerank  │
              │ Search  │   │ Search  │   │ Model   │
              └─────────┘   └─────────┘   └─────────┘
                    │             │             │
                    └──────┬──────┘             │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  RRF 融合   │ ──▶ │  最终结果   │
                    └─────────────┘     └─────────────┘
```

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**[⬆ 回到顶部](#-axonbase)**

Made with ❤️ by AxonBase Team

</div>
