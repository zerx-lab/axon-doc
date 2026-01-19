<div align="center">

<img src="https://img.shields.io/badge/🧠-AxonDoc-667eea?style=for-the-badge&labelColor=764ba2" alt="AxonDoc" height="40"/>

<br/>
<br/>

# AxonDoc

### 🚀 AI 驱动的企业级智能知识库系统

<p align="center">
<strong>混合检索</strong> · <strong>智能对话</strong> · <strong>网页爬虫</strong> · <strong>上下文理解</strong> · <strong>权限管理</strong>
</p>

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

<br/>

<p align="center">
  <a href="#-核心功能">核心功能</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-api-端点">API</a>
</p>

</div>

<br/>

---

## 🎯 项目简介

**AxonDoc** 是一个功能完整的企业级知识库和 AI 对话系统，集成了先进的 RAG（检索增强生成）技术。它支持多知识库管理、智能网页爬虫、混合检索、多模型 AI 对话等核心功能，为企业提供强大的知识管理和智能问答能力。

### 为什么选择 AxonDoc？

- 🔥 **开箱即用** - 完整的前后端解决方案，Docker 一键部署
- 🧠 **智能检索** - 向量搜索 + BM25 + RRF 融合 + 重排序，精准召回
- 💬 **知识对话** - 基于知识库上下文的 AI 对话，支持多轮会话
- 🕷️ **智能爬虫** - AI 驱动的自适应网页内容提取
- 🔐 **企业级权限** - 细粒度 RBAC 权限系统

---

## ✨ 核心功能

<table>
<tr>
<td width="50%">

### 💬 AI 智能对话

- **知识库增强对话** - 基于检索结果的上下文感知
- **多模型支持** - Claude / GPT / 兼容 API
- **流式响应** - 实时打字机效果
- **会话管理** - 多会话存储与切换
- **多知识库查询** - 单次对话跨库检索

</td>
<td width="50%">

### 🔍 混合智能检索

- **向量搜索** - pgvector 语义相似度
- **BM25 关键词** - 精确词汇匹配
- **RRF 融合算法** - 智能结果合并
- **多重排序** - Cohere / Jina / Voyage / 阿里云
- **上下文增强** - AI 生成的语义摘要

</td>
</tr>
<tr>
<td width="50%">

### 🕷️ 智能网页爬虫

- **全站爬取** - 自动发现并抓取子页面
- **AI 自适应提取** - LLM 驱动的内容识别
- **框架预设** - Docusaurus / GitBook / VuePress 等
- **实时进度** - 任务队列与状态追踪
- **一键导入** - 爬取内容直接入库

</td>
<td width="50%">

### 📚 知识库管理

- **多知识库** - 按主题/项目独立管理
- **文档处理** - 自动分块与向量化
- **批量操作** - 导入 / 嵌入 / 删除
- **状态追踪** - 嵌入进度与覆盖率
- **灵活配置** - 每库独立的模型设置

</td>
</tr>
<tr>
<td width="50%">

### 🔐 权限管理系统

- **RBAC** - 基于角色的访问控制
- **细粒度权限** - 25+ 个独立权限项
- **数据隔离** - RLS 行级安全策略
- **角色管理** - 自定义角色与权限组合

</td>
<td width="50%">

### 🛠️ 系统配置

- **嵌入模型** - OpenAI / Voyage / 阿里云 / 自定义
- **对话模型** - 多服务商灵活切换
- **重排序配置** - 可视化参数调整
- **分块策略** - 自定义大小与重叠

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
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=python" width="48" height="48" alt="Python" />
<br>FastAPI
</td>
</tr>
</table>

### 核心技术

| 类别 | 技术 |
|------|------|
| **前端框架** | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| **UI 框架** | Tailwind CSS v4 + Radix UI + Zustand |
| **AI 集成** | Vercel AI SDK + Anthropic SDK + OpenAI SDK |
| **数据库** | Supabase (PostgreSQL + pgvector + Auth) |
| **爬虫服务** | Python FastAPI + Crawl4ai + LiteLLM |
| **状态管理** | Zustand + React Context |

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Python 3.12+ (爬虫服务)
- Bun (推荐) 或 npm/yarn
- Docker & Docker Compose

### 1️⃣ 克隆项目

```bash
git clone https://github.com/your-org/axon-doc.git
cd axon-doc
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

### 6️⃣ 启动爬虫服务（可选）

```bash
cd crawler-service
uv run main.py
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

<details>
<summary><b>🕷️ 爬虫服务命令</b></summary>

| 命令 | 说明 |
|------|------|
| `cd crawler-service && uv run main.py` | 启动爬虫服务 |
| `cd crawler-service && uv sync` | 安装 Python 依赖 |

</details>

---

## 📁 项目结构

```
axon-doc/
├── 📂 app/                           # Next.js App Router
│   ├── 📂 api/                       # API 路由 (70+ 端点)
│   │   ├── 📂 auth/                  # 认证 (登录/登出/验证)
│   │   ├── 📂 admin/                 # 管理 (用户/角色)
│   │   ├── 📂 kb/                    # 知识库 CRUD
│   │   ├── 📂 documents/             # 文档管理
│   │   ├── 📂 embeddings/            # 向量嵌入
│   │   ├── 📂 search/                # 混合搜索
│   │   ├── 📂 chat/                  # 聊天会话管理
│   │   ├── 📂 assistant-chat/        # AI 助手对话 (流式)
│   │   ├── 📂 crawl/                 # 网页爬虫
│   │   ├── 📂 reranker/              # 重排序测试
│   │   └── 📂 settings/              # 系统配置
│   ├── 📂 dashboard/                 # 仪表盘页面
│   │   ├── 📄 page.tsx               # 首页
│   │   ├── 📂 knowledge-bases/       # 知识库管理
│   │   ├── 📂 chat/                  # AI 聊天界面
│   │   ├── 📂 users/                 # 用户管理
│   │   ├── 📂 roles/                 # 角色管理
│   │   ├── 📂 settings/              # 系统设置
│   │   └── 📂 tasks/                 # 任务监控
│   └── 📂 login/                     # 登录页面
├── 📂 components/                    # React 组件
│   ├── 📂 assistant-ui/              # AI 助手 UI 组件
│   ├── 📂 chat/                      # 聊天 UI 组件
│   └── 📂 ui/                        # 基础 UI 组件 (Radix)
├── 📂 lib/                           # 工具库
│   ├── 📂 supabase/                  # Supabase 客户端
│   │   ├── 📄 types.ts               # 数据库类型定义
│   │   ├── 📄 permissions.ts         # 权限定义
│   │   └── 📄 access.ts              # 访问控制
│   ├── 📂 chunking/                  # 文本分块
│   ├── 📄 embeddings.ts              # 向量嵌入与混合搜索
│   ├── 📄 reranker.ts                # 重排序引擎
│   └── 📄 task-context.tsx           # 任务管理上下文
├── 📂 crawler-service/               # Python 爬虫服务
│   ├── 📂 app/
│   │   ├── 📄 main.py                # FastAPI 应用入口
│   │   ├── 📄 adaptive_crawler.py    # 自适应 AI 爬虫
│   │   ├── 📄 analyzer.py            # 内容分析器
│   │   └── 📄 job_manager.py         # 任务管理器
│   └── 📄 pyproject.toml             # Python 依赖配置
├── 📂 supabase/                      # 数据库配置
│   ├── 📂 migrations/                # SQL 迁移文件
│   └── 📄 seed.sql                   # 种子数据
└── 📂 supabase-docker/               # Docker 配置
```

---

## 🔌 API 端点

### 认证相关
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| POST | `/api/auth/validate` | 验证会话 |

### 知识库与文档
| 方法 | 端点 | 说明 |
|------|------|------|
| GET/POST | `/api/kb` | 知识库列表/创建 |
| PATCH/DELETE | `/api/kb?id={id}` | 更新/删除知识库 |
| GET/POST | `/api/documents` | 文档列表/创建 |
| POST | `/api/embeddings` | 创建向量嵌入 |
| POST | `/api/search` | 混合检索 |

### AI 聊天
| 方法 | 端点 | 说明 |
|------|------|------|
| GET/POST | `/api/chat/sessions` | 会话列表/创建 |
| POST | `/api/assistant-chat` | AI 对话 (流式) |

### 网页爬虫
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/crawl` | 启动爬虫任务 |
| GET | `/api/crawl?job_id={id}` | 查询任务状态 |
| PATCH | `/api/crawl` | 暂停/恢复任务 |
| DELETE | `/api/crawl?job_id={id}` | 取消任务 |

---

## 🔐 权限系统

### 系统角色

| 角色 | 说明 | 权限范围 |
|:----:|------|:--------:|
| 🔴 Super Administrator | 超级管理员 | `*` 全部权限 |
| 🟠 Administrator | 管理员 | 用户/角色/知识库/文档/嵌入 |
| 🟡 User Manager | 用户管理员 | 用户管理 |
| 🟢 Viewer | 只读用户 | 查看权限 |

<details>
<summary><b>📋 完整权限列表</b></summary>

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
| `chat:access` | 访问聊天 |
| `chat:create` | 创建会话 |
| `system:settings` | 系统设置 |
| `system:logs` | 系统日志 |

</details>

---

## 🤖 AI 配置

### 嵌入模型

| 服务商 | 支持模型 |
|--------|----------|
| OpenAI | `text-embedding-3-small` / `text-embedding-3-large` |
| Voyage AI | `voyage-3` / `voyage-3-lite` |
| 阿里云 | DashScope 原生 / 兼容模式 |
| 自定义 | 任意 OpenAI 兼容 API |

### 对话模型

| 服务商 | 支持模型 |
|--------|----------|
| Anthropic | `claude-sonnet-4-20250514` / Claude 系列 |
| OpenAI | `gpt-4o` / `gpt-4o-mini` / GPT 系列 |
| 自定义 | 任意 OpenAI 兼容 API |

### 重排序模型

| 服务商 | 支持模型 |
|--------|----------|
| Cohere | `rerank-english-v3.0` |
| Jina | `jina-reranker-v2-base-multilingual` |
| Voyage | `rerank-2` |
| 阿里云 | `gte-rerank-v2` |

---

## 🔄 检索流程

```
┌─────────────┐     ┌─────────────────────────────┐     ┌─────────────┐
│   用户查询   │ ──▶ │        混合检索引擎          │ ──▶ │   重排序    │
└─────────────┘     └─────────────────────────────┘     └─────────────┘
                                  │                            │
                    ┌─────────────┼─────────────┐              │
                    ▼             ▼             ▼              ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐   ┌──────────┐
              │  Vector  │ │   BM25   │ │   RRF    │   │  Rerank  │
              │  Search  │ │  Search  │ │  Fusion  │   │  Model   │
              │(pgvector)│ │(全文索引) │ │ (融合)   │   │  (可选)  │
              └──────────┘ └──────────┘ └──────────┘   └──────────┘
                    │             │           │              │
                    └──────┬──────┘           │              │
                           ▼                  ▼              ▼
                    ┌──────────────┐   ┌──────────┐   ┌──────────┐
                    │  候选结果集   │ ─▶│ RRF 融合 │ ─▶│ 最终结果 │
                    └──────────────┘   └──────────┘   └──────────┘
```

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**[⬆ 回到顶部](#axondoc)**

<br/>

<sub>Built with ❤️ using Next.js, Supabase & AI</sub>

</div>
