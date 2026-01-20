# AxonDoc 向量化任务完整实现调研报告

**生成日期**: 2024年1月20日  
**项目**: AxonDoc (Next.js 16 + React 19 + Supabase)

---

## 一、执行摘要

本报告详细分析了 AxonDoc 项目中向量化（Embedding）任务的完整实现链路，包括任务触发、处理流程、状态管理、前端交互和配置管理等方面。

### 核心发现：
- **任务系统**: 基于 React Context + LocalStorage 的客户端任务队列
- **向量化流程**: 分为单文档嵌入、知识库批量嵌入和上下文增强三种模式
- **提供商支持**: OpenAI、Azure、本地(Ollama)、阿里云等4个提供商
- **架构特点**: 后台处理(Next.js `after()`) + 前端轮询的混合模式

---

## 二、项目结构概览

```
axon-doc/
├── lib/
│   ├── embeddings.ts              # 核心向量化逻辑
│   ├── task-context.tsx           # 任务管理上下文
│   ├── chunking/
│   │   ├── index.ts               # 导出接口
│   │   ├── recursive-splitter.ts  # 分块算法 (中文感知)
│   │   └── context-generator.ts   # 上下文生成
│   ├── reranker.ts                # 重排序功能
│   ├── permissions.ts             # 权限定义
│   └── supabase/
│       ├── types.ts               # 类型定义
│       ├── permissions.ts         # Supabase权限
│       └── access.ts              # 权限检查
├── app/api/
│   ├── embeddings/
│   │   ├── route.ts               # 主要API (GET/POST/DELETE)
│   │   ├── test/route.ts          # 测试单个embedding
│   │   └── recall-test/route.ts   # 检索效果测试
│   └── documents/
│       ├── route.ts               # 文档CRUD
│       └── test/stream/route.ts   # 文档RAG测试
├── components/
│   └── TaskPanel.tsx              # 任务面板UI
└── app/dashboard/
    ├── knowledge-bases/[id]/page.tsx  # 知识库主页
    └── settings/page.tsx               # 配置页面
```

---

## 三、向量化任务完整流程

### 3.1 数据流架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                     前端 (React Components)                         │
├─────────────────────────────────────────────────────────────────────┤
│  1. 用户点击"Embed"按钮                                             │
│  2. addTask() 创建任务 → LocalStorage                              │
│  3. TaskPanel显示任务进度                                          │
│  4. 2秒轮询一次 checkDocumentEmbeddingStatus()                    │
└────────────────┬────────────────────────────────────────────────────┘
                 │ POST /api/embeddings
                 │ { action: "embed_document", docId, operatorId }
                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│              API Routes (Next.js Server)                            │
├─────────────────────────────────────────────────────────────────────┤
│ POST /api/embeddings:                                               │
│  1. 验证权限 (EMBEDDING_MANAGE)                                     │
│  2. 查询文档 (content, title)                                       │
│  3. 设置状态 embedding_status = "processing"                      │
│  4. after() 异步执行 embedDocument() 后台任务                      │
│  5. 立即返回 { success: true, status: "processing" }              │
└────────────────┬────────────────────────────────────────────────────┘
                 │ 后台处理 (Next.js after())
                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│           后台处理 (embedDocument 函数)                             │
├─────────────────────────────────────────────────────────────────────┤
│ 1. 获取embedding配置                                                │
│ 2. 递归分块 (400 tokens, 60 overlap)                              │
│ 3. [可选] 上下文增强 (调用LLM生成context summary)                  │
│ 4. 生成embeddings (批量调用OpenAI/Azure/Aliyun)                  │
│ 5. Upsert chunks到数据库                                           │
│ 6. 更新status = "completed" or "failed"                          │
└────────────────┬────────────────────────────────────────────────────┘
                 │ 状态更新到数据库
                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│              前端轮询检测 (2秒间隔)                                  │
├─────────────────────────────────────────────────────────────────────┤
│ 1. GET /api/embeddings?docId=xxx&operatorId=yyy                   │
│ 2. 返回: { document: { embeddingStatus, chunkCount } }            │
│ 3. 当status="completed" → 任务完成 → 自动刷新文档列表              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 四、核心实现细节

### 4.1 任务上下文管理 (`lib/task-context.tsx`)

**任务类型定义**:
```typescript
export type TaskType = "embed_document" | "embed_kb" | "crawl_webpage";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  description?: string;
  progress: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  data: TaskData;  // 任务特定数据
}
```

**任务流程**:
```
pending → running → completed/failed
         ↑                    ↓
         └── 轮询 2秒检测完成 ──┘
```

**关键函数**:
- `addTask()`: 创建新任务，自动打开任务面板，保存到LocalStorage
- `executeTask()`: 根据任务类型分发执行
- `checkDocumentEmbeddingStatus()`: GET `/api/embeddings?operatorId&docId`
- `checkKnowledgeBaseEmbeddingStatus()`: GET `/api/embeddings?operatorId&kbId`

**LocalStorage策略**:
- 键: `"axon_tasks"`
- 最多保留50个已完成任务
- 页面刷新时恢复运行中的任务状态

### 4.2 向量化核心算法 (`lib/embeddings.ts`)

#### 关键函数

**1. generateEmbeddings()**
```typescript
async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig
): Promise<number[][]>

// 批处理逻辑:
// - OpenAI/Azure: 批大小 2048
// - 本地(Ollama): 批大小 100
// - 阿里云: 批大小 10
```

**2. embedDocument()**
```typescript
async function embedDocument(
  supabase: SupabaseClient,
  documentId: string,
  content: string,
  config?: EmbeddingConfig,
  documentTitle?: string
): Promise<{ success: boolean; chunkCount: number; error?: string }>

// 流程:
// 1. 分块文档
// 2. [可选] 为每个chunk生成上下文摘要
// 3. 生成embeddings
// 4. Upsert到document_chunks表
// 5. 删除多余的chunks
// 6. 更新document.embedding_status
```

**3. embedKnowledgeBase()**
```typescript
async function embedKnowledgeBase(
  supabase: SupabaseClient,
  kbId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; processed: number; failed: number }>

// 批量处理知识库中所有pending/outdated/failed文档
```

#### 配置参数

```typescript
interface EmbeddingConfig {
  provider: "openai" | "azure" | "local" | "aliyun";  // 提供商
  baseUrl: string;                                      // API基础URL
  apiKey: string;                                       // API密钥
  model: string;                                        // 模型名称
  dimensions: number;                                   // 向量维数
  batchSize: number;                                    // 批处理大小
  chunkSize: number;                                    // 分块大小(tokens)
  chunkOverlap: number;                                 // 分块重叠(tokens)
  contextEnabled: boolean;                              // 是否启用上下文增强
}

// 默认值
const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  dimensions: 0,
  batchSize: 0,  // 由提供商限制覆盖
  chunkSize: 400,
  chunkOverlap: 60,
  contextEnabled: false,
};

// 提供商预设 (Settings页面)
const PROVIDER_PRESETS: Record<string, Partial<EmbeddingConfig>> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
  azure: {
    baseUrl: "https://YOUR_RESOURCE.openai.azure.com",
    model: "text-embedding-ada-002",
    dimensions: 1536,
  },
  aliyun: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "text-embedding-v3",
    dimensions: 1024,
  },
  local: {
    baseUrl: "http://localhost:11434/v1",
    model: "nomic-embed-text",
    dimensions: 768,
  },
};
```

### 4.3 文本分块 (`lib/chunking/recursive-splitter.ts`)

**分块策略**: 递归字符分割，中文感知

```typescript
// 分割优先级顺序 (保留语义边界)
const DEFAULT_SEPARATORS = [
  "\n\n",           // 段落 (最高优先级)
  "\n",             // 行
  "。",             // 中文句号
  "！",             // 中文感叹号
  "？",             // 中文问号
  "；",             // 中文分号
  ". ",             // 英文句号
  "! ",             // 英文感叹号
  "? ",             // 英文问号
  "; ",             // 英文分号
  "，",             // 中文逗号
  ", ",             // 英文逗号
  " ",              // 空格 (词级)
  "",               // 字符级 (最后手段)
];

// Token估算 (中文感知)
export function estimateTokenCount(text: string): number {
  
