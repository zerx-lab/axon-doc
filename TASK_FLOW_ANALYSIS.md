# AxonBase Crawl Task Management Flow - Comprehensive Analysis

## Executive Summary

The AxonBase knowledge base system implements a **client-side task queue with server-side background job execution**. Tasks are managed in the frontend React context, while actual crawl operations run as background tasks on the FastAPI crawler service. The system provides real-time status tracking, task cancellation, and comprehensive progress monitoring.

---

## 1. FRONTEND TASK MANAGEMENT LAYER

### 1.1 Task Model & Types

```typescript
type TaskType = "embed_document" | "embed_kb" | "crawl_webpage";
type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface Task {
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
  data: TaskData;
}
```

**Key Characteristics:**
- Tasks are **client-side state managed** via React Context
- Status transitions: `pending` → `running` → `completed|failed|cancelled`
- Tasks are **persisted to localStorage** for session recovery
- **Max 50 completed tasks** retained to prevent bloat

### 1.2 Task Context Provider Lifecycle

#### Initialization Phase
```
1. App Mounts → TaskProvider initializes
2. loadTasksFromStorage() → Restore from localStorage
3. For each "running" task:
   - Check server status (embeddings/crawl)
   - If completed/failed on server → update locally
   - If still processing → reset to pending
4. setTasks() → Hydrate React state
```

#### Task Queue Processing Loop
- Serial execution - Only one task runs at a time
- AbortController support - Clean cancellation with signal propagation
- Automatic state updates - On completion/failure
- Automatic cleanup - Removes AbortController refs

### 1.3 Task Execution Functions

`executeCrawlWebpage()` flow:
```
1. POST to /api/crawl → Returns job_id
2. Poll /api/crawl?job_id={jobId} every 2 seconds
3. On completed|failed|cancelled → Resolve promise
4. On AbortSignal → Throw DOMException("Aborted")
```

---

## 2. FRONTEND UI COMPONENTS

### 2.1 CrawlDialog Component

User interface for initiating crawl jobs with:
- Mode selection: Single URL vs Full Site
- Dynamic parameters based on mode
- Advanced extraction options (AI-powered)
- Framework presets: docusaurus, gitbook, vuepress, mkdocs, sphinx
- Source label for organizational tracking

### 2.2 TaskPanel Component

Real-time task monitoring and management:
- Shows pending/running/completed/failed/cancelled tasks
- Cancel button for pending/running tasks
- Remove button for completed/failed tasks
- Real-time progress bar
- Error message display

---

## 3. API ROUTES & BACKEND INTEGRATION

### 3.1 POST /api/crawl - Start Crawl Job

Determines crawler endpoint:
- `single_url` → `/crawl/sync` (blocking)
- `full_site` → `/crawl/async` (non-blocking)

Forwards to crawler service and returns `{job_id, status, ...}`

### 3.2 GET /api/crawl?job_id={jobId} - Check Job Status

Queries Supabase crawl_jobs table for:
- Job status
- Progress percentage
- Pages crawled count
- Error messages
- Crawl pages with individual status

### 3.3 PATCH /api/crawl - Pause/Resume Job

Supports actions: `pause`, `resume`
- Sends to crawler service endpoint
- Updates Supabase job status
- ⚠️ Not fully implemented (DB update only)

### 3.4 DELETE /api/crawl?job_id={jobId} - Cancel Job

1. Notifies crawler service to stop
2. Updates Supabase status to "cancelled"
3. Sets completed_at timestamp

---

## 4. CRAWLER SERVICE (Python FastAPI)

### 4.1 Architecture: Background Tasks

Uses FastAPI's `BackgroundTasks`:
```
POST /crawl/async:
  1. Create crawl_jobs DB record
  2. Queue background_tasks.add_task()
  3. Return immediately with job_id
  
  → execute_full_site_crawl() runs asynchronously
```

### 4.2 Background Task: execute_full_site_crawl()

Long-running process:
1. Update job status to "running"
2. For each discovered page:
   - Fetch page content
   - Extract using AI or CSS selectors
   - Validate content
   - Insert into documents table
   - Update progress
3. Mark completed/failed with timestamp

### 4.3 Status Check: GET /crawl/job/{job_id}

Returns current job metadata:
- Status, progress, pages_crawled
- Total pages, failed pages
- Error messages (if any)

### 4.4 Cancellation: POST /crawl/job/{job_id}/cancel

⚠️ **CRITICAL GAP:** Only updates DB status - doesn't stop the running async task!

---

## 5. DATABASE SCHEMA

### 5.1 crawl_jobs Table

Stores job metadata:
- url, kb_id, user_id
- mode (single_url|full_site)
- max_depth, max_pages
- status (pending|running|paused|completed|failed|cancelled)
- progress (0-100)
- pages_crawled, total_pages, failed_pages
- error messages
- created_at, completed_at timestamps

### 5.2 crawl_pages Table

Tracks individual page status:
- job_id (FK to crawl_jobs)
- url, status (pending|crawling|completed|failed|skipped)
- document_id (FK to documents)
- content_hash, title, depth
- error_message, crawled_at

### 5.3 Related Tables

- **documents**: Stores crawled page content with source_type="crawl"
- **knowledge_bases**: Has document_count incremented per page

---

## 6. DATA FLOW DIAGRAM

```
USER FRONTEND
  ↓
CrawlDialog collects URL, mode, extraction settings
  ↓
handleSubmit() → addTask()
  ↓
Task added to context: { id, status: "pending", ... }
  ↓
Task persisted to localStorage
  ↓
TaskPanel displays task with status badge
  ↓
Task context detects pending task
  ↓
executeCrawlWebpage() starts polling

NEXT.JS API GATEWAY
  ↓
POST /api/crawl
  ↓
Forward to Python crawler service
  ↓
Return { job_id: "uuid" }

CRAWLER SERVICE (FastAPI)
  ↓
POST /crawl/async
  ↓
Create crawl_jobs record in DB
  ↓
Queue background task: execute_full_site_crawl()
  ↓
Return { job_id }

POLLING LOOP (Frontend)
  ↓
Every 2 seconds: GET /api/crawl?job_id
  ↓
Next.js queries Supabase
  ↓
Return status, progress, pages_crawled

BACKGROUND TASK (Crawler Service)
  ↓
Update job status: "running"
  ↓
Crawl pages sequentially
  ↓
For each page:
  - Extract content with AI or CSS
  - Insert into documents
  - Update progress counter
  ↓
Mark job: "completed" or "failed"

COMPLETION
  ↓
Frontend polling detects "completed"
  ↓
Task status → "completed"
  ↓
TaskPanel shows success badge
  ↓
User sees documents in KB
```

---

## 7. CRITICAL GAPS & LIMITATIONS

### 7.1 Task Cancellation Gap

**Current Issue:**
- Frontend triggers DELETE /api/crawl
- Backend updates DB status to "cancelled"
- ⚠️ Actual async background task STILL RUNNING in memory!

**Impact:** Resource waste, duplicate documents on retry

**Solution Needed:**
```python
# Global task registry
_active_tasks: dict[str, asyncio.Task] = {}

async def execute_full_site_crawl(...):
    task = asyncio.current_task()
    _active_tasks[job_id] = task
    try:
        # ... crawl logic
    finally:
        _active_tasks.pop(job_id, None)

@app.post("/crawl/job/{job_id}/cancel")
async def cancel_crawl_job(job_id: str):
    if task := _active_tasks.get(job_id):
        task.cancel()  # Actually interrupt the task
```

### 7.2 Pause/Resume Not Implemented

**Current State:**
- PATCH endpoint accepts pause/resume actions
- Only updates DB status (cosmetic)
- No actual pause mechanism
- Can't resume paused crawl

### 7.3 No Server-Sent Events (SSE) for Real-time Updates

**Current:** Polls every 2 seconds (inefficient)

**Better:** WebSocket or Server-Sent Events
```typescript
async function executeCrawlWebpage(task, signal) {
  const eventSource = new EventSource(`/api/crawl/stream?job_id=${jobId}`);
  
  eventSource.onmessage = (event) => {
    const status = JSON.parse(event.data);
    updateTaskProgress(status);
  };
}
```

### 7.4 Single vs Async Mode Confusion

- Two endpoints: `/crawl/sync` (blocking) and `/crawl/async` (non-blocking)
- Frontend doesn't distinguish mode selection properly
- Task context polls both endpoints inconsistently

---

## 8. STATE MACHINES

### 8.1 Frontend Task State Machine

```
PENDING
  ↓ (context detects)
RUNNING
  ├─ (completes) → COMPLETED
  ├─ (error) → FAILED
