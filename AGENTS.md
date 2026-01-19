# AxonDoc知识库

## 必须遵守的要求
- **多语言规范**：所有用户可见文本必须使用 `lib/i18n.tsx` 的翻译系统
- **数据库操作**：通过 Next.js API Routes 与 Supabase 进行交互
- **Supabase 操作规范**：执行任何 Supabase 相关操作前，必须先查阅 `.opencode/rules/` 目录下的对应规则文件
- **Python 运行环境**：所有 Python 相关操作必须使用 **uv** 而非系统 Python，包括运行脚本、安装依赖、执行测试等

---

## 项目概述

AxonDoc 是一个基于 Next.js 16 的应用程序，使用 React 19、Tailwind CSS v4、TypeScript 5 和 Supabase 后端。项目使用 Bun 作为包管理器。

---

## 构建、检查和测试命令

### 包管理器
所有包操作都使用 **Bun**：
```bash
bun install              # 安装依赖
bun add <package>        # 添加依赖
bun add -d <package>     # 添加开发依赖
```

### 开发
```bash
bun run dev              # 启动 Next.js 开发服务器 (http://localhost:3000)
bun run build            # 生产环境构建
bun run start            # 启动生产服务器
bun run lint             # 运行 ESLint
```

### 测试
目前尚未配置测试框架。添加测试时：
- 使用 Vitest 进行单元测试（推荐用于 Next.js）
- 运行单个测试：`bun test path/to/file.test.ts`
- 运行所有测试：`bun test`

---

## 项目结构

```
axon-doc/
├── app/                      # Next.js App Router 页面和布局
│   ├── api/                  # API Routes
│   │   ├── auth/             # 认证 API
│   │   └── admin/            # 管理员 API (users, roles)
│   ├── dashboard/            # Dashboard 页面
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 首页
│   └── globals.css           # 全局样式 (Tailwind)
├── components/               # React 组件
├── lib/                      # 工具库
│   ├── supabase/             # Supabase 客户端和工具
│   │   ├── client.ts         # 浏览器客户端
│   │   ├── server.ts         # 服务端客户端
│   │   ├── types.ts          # 数据库类型
│   │   ├── permissions.ts    # 权限定义
│   │   └── access.ts         # 访问控制工具
│   ├── auth-context.tsx      # 认证上下文
│   ├── i18n.tsx              # 国际化
│   └── theme.tsx             # 主题管理
├── supabase/                 # Supabase 配置
│   ├── migrations/           # 数据库迁移脚本
│   └── seed.sql              # 种子数据
├── public/                   # 静态资源
├── package.json
├── tsconfig.json
└── eslint.config.mjs
```

---

## 代码风格规范

### 导入
1. 对纯类型导入使用 `import type { }`：
   ```typescript
   import type { Metadata } from "next";
   ```
2. 导入顺序：React/Next.js 内置 > 外部包 > 内部模块 > 样式
3. 对内部导入使用 `@/*` 路径别名：
   ```typescript
   import { Button } from "@/components/ui/button";
   ```

### TypeScript
- **严格模式已启用** - 除非有充分理由，否则不要使用 `any`
- 为公共函数定义明确的返回类型
- 对不应被修改的 props 使用 `Readonly<>`
- 对象形状优先使用 interface，联合类型/原始类型使用 type

### 命名约定
| 类型 | 约定 | 示例 |
|------|------|------|
| 组件 | PascalCase | `UserProfile`, `RootLayout` |
| 文件（页面） | 小写 | `page.tsx`, `layout.tsx` |
| 文件（组件） | PascalCase | `Button.tsx`, `UserCard.tsx` |
| 函数 | camelCase | `getUserData`, `handleClick` |
| 常量 | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| CSS 变量 | kebab-case | `--font-geist-sans` |
| API Routes | kebab-case | `reset-password`, `toggle-active` |
| 数据库列 | snake_case | `created_at`, `role_id` |

### React 组件
- 使用带 TypeScript 类型的函数组件
- 页面组件使用 `default` 导出
- Props 接口命名：`{ComponentName}Props`
```typescript
interface UserCardProps {
  readonly user: User;
  readonly onSelect?: (id: string) => void;
}

export function UserCard({ user, onSelect }: UserCardProps) {
  // ...
}
```

### CSS / Tailwind
- 使用 Tailwind CSS v4 工具类
- 遵循响应式设计模式：移动优先，使用 `sm:`、`md:`、`lg:` 断点
- 使用 `dark:` 前缀实现深色模式
- 在 `globals.css` 中使用 `@theme inline` 定义 CSS 自定义属性

### 错误处理
- 使用显式错误检查，不要用 try-catch 控制流程
- 抛出带有上下文的描述性错误
- 在 API Routes 中返回适当的 HTTP 状态码
```typescript
if (!user) {
  return NextResponse.json(
    { error: "User not found" },
    { status: 404 }
  );
}
```

### 多语言 (i18n)
- 所有用户可见文本必须使用 `lib/i18n.tsx` 的翻译系统
- 使用 `useI18n()` 获取 `t` 函数：`const { t } = useI18n();`
- 翻译键格式：`模块.键名`，如 `auth.signIn`、`nav.settings`
- 新增文本时需同时添加中文和英文翻译
```typescript
// lib/i18n.tsx 中添加翻译
"module.key": { zh: "中文", en: "English" },

// 组件中使用
const { t } = useI18n();
<span>{t("module.key")}</span>
```

---

## Supabase 后端规范

### 数据库表结构
- `roles` - 角色表 (id, name, description, permissions, is_system, is_super_admin)
- `users` - 用户表 (id, username, password_hash, role_id, display_name, is_active)
- `sessions` - 会话表 (id, user_id, token, expires_at)
- `knowledge_bases` - 知识库表 (id, user_id, name, description, document_count, settings)
- `documents` - 文档表 (id, kb_id, user_id, title, content, file_type, status, metadata)

### API Routes 结构
```
app/api/
├── auth/
│   ├── login/route.ts      # POST - 用户登录
│   ├── logout/route.ts     # POST - 用户登出
│   ├── validate/route.ts   # POST - 验证会话
│   └── seed/route.ts       # POST - 初始化数据
├── admin/
│   ├── users/
│   │   ├── route.ts        # GET/POST/PATCH/DELETE - 用户 CRUD
│   │   ├── [id]/route.ts   # GET - 获取单个用户
│   │   ├── toggle-active/route.ts  # POST - 切换用户状态
│   │   └── reset-password/route.ts # POST - 重置密码
│   └── roles/
│       ├── route.ts        # GET/POST/PATCH/DELETE - 角色 CRUD
│       ├── [id]/route.ts   # GET - 获取单个角色
│       └── permissions/route.ts    # GET - 获取所有权限
```

### Supabase 客户端使用
```typescript
// 浏览器客户端 (Client Component)
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();

// 服务端客户端 (Server Component / API Route)
import { createAdminClient } from "@/lib/supabase/server";
const supabase = createAdminClient();
```

### 权限系统
- 权限定义在 `lib/supabase/permissions.ts`
- 使用 `hasPermission()` 检查用户权限
- 超级管理员拥有所有权限 ("*")
```typescript
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";

const canCreate = await hasPermission(supabase, userId, Permissions.USERS_CREATE);
```

---

## 环境变量

存储在 `.env.local`（已加入 gitignore）：
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

---

## ESLint 配置

使用 ESLint 9+ 扁平配置：
- `eslint-config-next/core-web-vitals`
- `eslint-config-next/typescript`

忽略路径：`.next/`、`out/`、`build/`、`next-env.d.ts`

提交前运行检查：`bun run lint`

---

## Git 提交规范

- 编写简洁的提交信息，关注"为什么"而非"做了什么"
- 使用约定式提交前缀：`feat:`、`fix:`、`refactor:`、`docs:`、`chore:`
- 永远不要提交 `.env.local` 或包含密钥的文件

---

## Supabase 规则查阅指南

执行 Supabase 相关操作前，**必须**先读取 `.opencode/rules/` 目录下的对应规则文件：

| 操作类型 | 规则文件 | 说明 |
|---------|---------|------|
| 创建数据库迁移 | `createMigration.md` | 迁移文件命名格式、SQL 规范、RLS 启用要求 |
| 创建数据库函数 | `createFunction.md` | SECURITY INVOKER、search_path 设置、函数模板 |
| 编写 RLS 策略 | `CreateRLSpolicies.md` | SELECT/INSERT/UPDATE/DELETE 策略规则、性能优化 |
| SQL 代码风格 | `PostgresSQLStyleGuide.md` | 命名约定 (snake_case)、查询格式化、CTE 使用 |
| 声明式 Schema 管理 | `DeclarativeDatabaseSchema.md` | 使用 `supabase/schemas/` 管理、`supabase db diff` 生成迁移 |
| Realtime 功能 | `SupabaseRealtime AIAssistantGuide.md` | broadcast/presence 使用、私有通道、命名约定 |
| Edge Functions | `SupabaseEdgeFunctions.md` | Deno 运行时、依赖管理 (npm:/jsr:)、示例模板 |

### 规则查阅工作流

```
1. 识别任务类型 → 确定需要查阅的规则文件
2. 读取规则文件 → 理解具体要求和最佳实践
3. 执行操作 → 严格遵循规则文件中的指南
4. 验证结果 → 确保符合规则要求
```

### 关键规则摘要

#### 数据库迁移 (`createMigration.md`)
- 文件命名：`YYYYMMDDHHmmss_short_description.sql`
- **必须**启用 RLS，即使表是公开访问的
- RLS 策略按操作类型和角色分开创建

#### 数据库函数 (`createFunction.md`)
- 默认使用 `SECURITY INVOKER`
- 始终设置 `set search_path = ''`
- 使用完全限定名 (`schema.table`)

#### RLS 策略 (`CreateRLSpolicies.md`)
- SELECT 只用 USING，INSERT 只用 WITH CHECK
- UPDATE 用 USING + WITH CHECK，DELETE 只用 USING
- 使用 `(select auth.uid())` 而非直接调用
- 为策略中使用的列添加索引

#### SQL 风格 (`PostgresSQLStyleGuide.md`)
- 使用 snake_case
- 表名用复数，列名用单数
- 添加表注释

---

## 数据库迁移工作流

### Docker 管理

```bash
bun run docker:up         # 启动 Supabase Docker 环境
bun run docker:down       # 停止环境
bun run docker:logs       # 查看日志
```

### 数据库操作

```bash
bun run db:psql           # 进入 PostgreSQL 命令行
bun run db:push           # 推送迁移到数据库
bun run db:reset          # 重置数据库（清空 + 迁移 + seed）
bun run db:diff           # 对比数据库差异
bun run db:seed           # 仅执行种子数据
```

### 迁移文件结构

```
supabase/
├── config.toml           # Supabase CLI 配置
├── migrations/           # 迁移文件
│   ├── 001_initial_schema.sql
│   └── 002_knowledge_bases.sql
└── seed.sql              # 种子数据
```

### 创建新迁移

1. 在 `supabase/migrations/` 创建新 SQL 文件：`003_feature_name.sql`
2. 执行：`bun run db:push`
3. 更新 `lib/supabase/types.ts` 添加对应类型

---

## 部署步骤

1. 在 Supabase 创建新项目
2. 运行 `supabase link --project-ref <project-id>` 连接项目
3. 运行 `supabase db push` 应用迁移
4. 运行 `supabase/seed.sql` 创建初始管理员
5. 配置环境变量
6. 部署应用
