"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type TaskType = "embed_document" | "embed_kb" | "crawl_webpage";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskData {
  docId?: string;
  kbId?: string;
  operatorId: string;
  url?: string;
  mode?: "single_url" | "full_site";
  maxDepth?: number;
  maxPages?: number;
  sourceLabel?: string;
  userId?: string;
  jobId?: string;
  useAi?: boolean;
  extractionMode?: "auto" | "preset" | "manual";
  extractionPrompt?: string;
  preset?: string;
  cssSelector?: string;
  excludedSelector?: string;
  forceReanalyze?: boolean;
  [key: string]: unknown;
}

export interface TaskProgress {
  current: number;
  total: number;
  speed: number;
  eta: number;
  startTime: number;
  lastUpdateTime: number;
  retryCount: number;
  maxRetries: number;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  description?: string;
  progress: number;
  progressData?: TaskProgress;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  data: TaskData;
}

interface TaskContextType {
  tasks: Task[];
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  addTask: (task: Omit<Task, "id" | "createdAt" | "status" | "progress">) => string;
  removeTask: (taskId: string) => void;
  clearCompletedTasks: () => void;
  clearAllTasks: () => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  getTask: (taskId: string) => Task | undefined;
  isTaskPanelOpen: boolean;
  setTaskPanelOpen: (open: boolean) => void;
  updateTaskProgress: (taskId: string, progress: Partial<TaskProgress>) => void;
}

const TaskContext = createContext<TaskContextType | null>(null);

const STORAGE_KEY = "axon_tasks";
const MAX_COMPLETED_TASKS = 50;

// Exponential backoff configuration
const POLL_CONFIG = {
  initialInterval: 1000,
  maxInterval: 15000,
  backoffFactor: 1.5,
  jitterFactor: 0.1,
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  retryBackoffFactor: 2,
};

type EmbeddingStatus = "pending" | "processing" | "completed" | "failed" | "outdated";

interface EmbeddingStatusResponse {
  status: EmbeddingStatus;
  chunkCount?: number;
  processedChunks?: number;
}

async function checkDocumentEmbeddingStatus(
  docId: string,
  operatorId: string
): Promise<EmbeddingStatusResponse | null> {
  try {
    const params = new URLSearchParams({ operatorId, docId });
    const response = await fetch(`/api/embeddings?${params}`);
    if (!response.ok) return null;
    const result = await response.json();
    return {
      status: result.document?.embeddingStatus || "pending",
      chunkCount: result.document?.chunkCount || 0,
    };
  } catch {
    return null;
  }
}

interface KBEmbeddingStatusResponse {
  hasPendingOrProcessing: boolean;
  allCompleted: boolean;
  total: number;
  embedded: number;
  pending: number;
  failed: number;
}

async function checkKnowledgeBaseEmbeddingStatus(
  kbId: string,
  operatorId: string
): Promise<KBEmbeddingStatusResponse> {
  try {
    const params = new URLSearchParams({ operatorId, kbId });
    const response = await fetch(`/api/embeddings?${params}`);
    if (!response.ok) {
      return { hasPendingOrProcessing: false, allCompleted: false, total: 0, embedded: 0, pending: 0, failed: 0 };
    }
    const result = await response.json();
    const stats = result.stats;
    if (!stats) {
      return { hasPendingOrProcessing: false, allCompleted: false, total: 0, embedded: 0, pending: 0, failed: 0 };
    }
    const hasPendingOrProcessing = stats.pending_documents > 0;
    const allCompleted = stats.embedded_documents === stats.total_documents && stats.total_documents > 0;
    return {
      hasPendingOrProcessing,
      allCompleted,
      total: stats.total_documents || 0,
      embedded: stats.embedded_documents || 0,
      pending: stats.pending_documents || 0,
      failed: stats.failed_documents || 0,
    };
  } catch {
    return { hasPendingOrProcessing: false, allCompleted: false, total: 0, embedded: 0, pending: 0, failed: 0 };
  }
}

function serializeTasks(tasks: Task[]): string {
  return JSON.stringify(tasks);
}

function deserializeTasks(data: string): Task[] {
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((task): task is Task => 
      task && typeof task.id === "string" && typeof task.type === "string"
    );
  } catch {
    return [];
  }
}

function loadTasksFromStorage(): Task[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  return deserializeTasks(stored);
}

function saveTasksToStorage(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, serializeTasks(tasks));
}

function calculateETA(progress: TaskProgress): number {
  if (progress.speed <= 0 || progress.current >= progress.total) return 0;
  const remaining = progress.total - progress.current;
  return Math.ceil(remaining / progress.speed);
}

function calculateSpeed(progress: TaskProgress): number {
  const elapsed = (progress.lastUpdateTime - progress.startTime) / 1000;
  if (elapsed <= 0) return 0;
  return progress.current / elapsed;
}

function getNextPollInterval(currentInterval: number): number {
  const nextInterval = Math.min(
    currentInterval * POLL_CONFIG.backoffFactor,
    POLL_CONFIG.maxInterval
  );
  const jitter = nextInterval * POLL_CONFIG.jitterFactor * (Math.random() - 0.5);
  return Math.round(nextInterval + jitter);
}

function getRetryDelay(retryCount: number): number {
  return RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.retryBackoffFactor, retryCount);
}

function formatETA(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.ceil((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

interface TaskProviderProps {
  readonly children: ReactNode;
}

export function TaskProvider({ children }: TaskProviderProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTaskPanelOpen, setTaskPanelOpen] = useState(false);
  const processingRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    const initializeTasks = async () => {
      const storedTasks = loadTasksFromStorage();
      const restoredTasks: Task[] = [];

      for (const task of storedTasks) {
        if (task.status === "running") {
          if (task.type === "embed_document" && task.data.docId) {
            const result = await checkDocumentEmbeddingStatus(
              task.data.docId,
              task.data.operatorId
            );
            
            if (result?.status === "completed") {
              restoredTasks.push({
                ...task,
                status: "completed",
                progress: 100,
                completedAt: Date.now(),
              });
            } else if (result?.status === "failed") {
              restoredTasks.push({
                ...task,
                status: "failed",
                error: "Embedding failed on server",
                completedAt: Date.now(),
              });
            } else if (result?.status === "processing") {
              restoredTasks.push({ ...task, status: "pending" as TaskStatus });
            } else {
              restoredTasks.push({
                ...task,
                status: "pending" as TaskStatus,
                startedAt: undefined,
              });
            }
          } else if (task.type === "embed_kb" && task.data.kbId) {
            const status = await checkKnowledgeBaseEmbeddingStatus(
              task.data.kbId,
              task.data.operatorId
            );
            
            if (status.allCompleted) {
              restoredTasks.push({
                ...task,
                status: "completed",
                progress: 100,
                completedAt: Date.now(),
              });
            } else if (status.hasPendingOrProcessing) {
              restoredTasks.push({ ...task, status: "pending" as TaskStatus });
            } else {
              restoredTasks.push({
                ...task,
                status: "pending" as TaskStatus,
                startedAt: undefined,
              });
            }
          } else {
            restoredTasks.push({
              ...task,
              status: "pending" as TaskStatus,
              startedAt: undefined,
            });
          }
        } else {
          restoredTasks.push(task);
        }
      }

      setTasks(restoredTasks);
      setIsInitialized(true);
    };

    initializeTasks();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      saveTasksToStorage(tasks);
    }
  }, [tasks, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const pendingTasks = tasks.filter(
      (t) => t.status === "pending" && !processingRef.current.has(t.id)
    );

    const nextTask = pendingTasks[0];
    if (!nextTask) return;

    processingRef.current.add(nextTask.id);
    const abortController = new AbortController();
    abortControllersRef.current.set(nextTask.id, abortController);

    const now = Date.now();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === nextTask.id
          ? {
              ...t,
              status: "running" as TaskStatus,
              startedAt: now,
              progressData: {
                current: 0,
                total: 100,
                speed: 0,
                eta: 0,
                startTime: now,
                lastUpdateTime: now,
                retryCount: 0,
                maxRetries: RETRY_CONFIG.maxRetries,
              },
            }
          : t
      )
    );

    executeTaskWithRetry(nextTask, abortController.signal, 0)
      .then((result) => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? {
                  ...t,
                  status: result.success ? "completed" : "failed",
                  progress: result.success ? 100 : t.progress,
                  error: result.error,
                  completedAt: Date.now(),
                }
              : t
          )
        );
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }
        setTasks((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? {
                  ...t,
                  status: "failed" as TaskStatus,
                  error: error instanceof Error ? error.message : "Unknown error",
                  completedAt: Date.now(),
                }
              : t
          )
        );
      })
      .finally(() => {
        processingRef.current.delete(nextTask.id);
        abortControllersRef.current.delete(nextTask.id);
      });
  }, [tasks, isInitialized]);

  useEffect(() => {
    const completedTasks = tasks.filter(
      (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled"
    );
    if (completedTasks.length > MAX_COMPLETED_TASKS) {
      const sortedCompleted = [...completedTasks].sort(
        (a, b) => (b.completedAt || 0) - (a.completedAt || 0)
      );
      const toRemove = sortedCompleted.slice(MAX_COMPLETED_TASKS);
      const toRemoveIds = new Set(toRemove.map((t) => t.id));
      // Use requestAnimationFrame to avoid synchronous setState in effect
      requestAnimationFrame(() => {
        setTasks((prev) => prev.filter((t) => !toRemoveIds.has(t.id)));
      });
    }
  }, [tasks]);

  const updateTaskProgress = useCallback((taskId: string, progressUpdate: Partial<TaskProgress>) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const currentProgress = t.progressData || {
          current: 0,
          total: 100,
          speed: 0,
          eta: 0,
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
          retryCount: 0,
          maxRetries: RETRY_CONFIG.maxRetries,
        };
        const updatedProgress = { ...currentProgress, ...progressUpdate, lastUpdateTime: Date.now() };
        updatedProgress.speed = calculateSpeed(updatedProgress);
        updatedProgress.eta = calculateETA(updatedProgress);
        const percentProgress = updatedProgress.total > 0
          ? Math.round((updatedProgress.current / updatedProgress.total) * 100)
          : 0;
        return {
          ...t,
          progress: percentProgress,
          progressData: updatedProgress,
        };
      })
    );
  }, []);

  const addTask = useCallback(
    (taskData: Omit<Task, "id" | "createdAt" | "status" | "progress">): string => {
      const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newTask: Task = {
        ...taskData,
        id,
        status: "pending",
        progress: 0,
        createdAt: Date.now(),
      };
      setTasks((prev) => [...prev, newTask]);
      setTaskPanelOpen(true);
      return id;
    },
    []
  );

  const removeTask = useCallback((taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const clearCompletedTasks = useCallback(() => {
    setTasks((prev) =>
      prev.filter(
        (t) => t.status !== "completed" && t.status !== "failed" && t.status !== "cancelled"
      )
    );
  }, []);

  const clearAllTasks = useCallback(() => {
    abortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    setTasks([]);
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId && (t.status === "pending" || t.status === "running")
          ? { ...t, status: "cancelled" as TaskStatus, completedAt: Date.now() }
          : t
      )
    );
    processingRef.current.delete(taskId);
  }, []);

  const retryTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId && t.status === "failed"
          ? {
              ...t,
              status: "pending" as TaskStatus,
              error: undefined,
              progress: 0,
              progressData: undefined,
              completedAt: undefined,
            }
          : t
      )
    );
  }, []);

  const getTask = useCallback(
    (taskId: string): Task | undefined => {
      return tasks.find((t) => t.id === taskId);
    },
    [tasks]
  );

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;

  return (
    <TaskContext.Provider
      value={{
        tasks,
        pendingCount,
        runningCount,
        completedCount,
        failedCount,
        addTask,
        removeTask,
        clearCompletedTasks,
        clearAllTasks,
        cancelTask,
        retryTask,
        getTask,
        isTaskPanelOpen,
        setTaskPanelOpen,
        updateTaskProgress,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTask() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTask must be used within TaskProvider");
  }
  return context;
}

export { formatETA };

async function executeTaskWithRetry(
  task: Task,
  signal: AbortSignal,
  retryCount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await executeTask(task, signal);
    if (!result.success && retryCount < RETRY_CONFIG.maxRetries) {
      const shouldRetry = isRetryableError(result.error);
      if (shouldRetry) {
        const delay = getRetryDelay(retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return executeTaskWithRetry(task, signal, retryCount + 1);
      }
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    if (retryCount < RETRY_CONFIG.maxRetries) {
      const delay = getRetryDelay(retryCount);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return executeTaskWithRetry(task, signal, retryCount + 1);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function isRetryableError(error?: string): boolean {
  if (!error) return true;
  const nonRetryablePatterns = [
    "permission denied",
    "not found",
    "invalid",
    "unauthorized",
    "forbidden",
  ];
  const lowerError = error.toLowerCase();
  return !nonRetryablePatterns.some((pattern) => lowerError.includes(pattern));
}

async function executeTask(
  task: Task,
  signal: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  switch (task.type) {
    case "embed_document":
      return executeEmbedDocument(task, signal);
    case "embed_kb":
      return executeEmbedKnowledgeBase(task, signal);
    case "crawl_webpage":
      return executeCrawlWebpage(task, signal);
    default:
      return { success: false, error: "Unknown task type" };
  }
}

async function executeEmbedDocument(
  task: Task,
  signal: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const { docId, operatorId } = task.data;
  if (!docId) {
    return { success: false, error: "Document ID is required" };
  }

  try {
    const currentResult = await checkDocumentEmbeddingStatus(docId, operatorId);
    
    if (currentResult?.status !== "processing") {
      const response = await fetch("/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId,
          action: "embed_document",
          docId,
        }),
        signal,
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        return { success: false, error: result.error || "Embedding failed" };
      }
    }

    let pollInterval = POLL_CONFIG.initialInterval;
    
    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const statusResult = await checkDocumentEmbeddingStatus(docId, operatorId);
      
      if (statusResult?.status === "completed") {
        return { success: true };
      }
      
      if (statusResult?.status === "failed") {
        return { success: false, error: "Embedding failed on server" };
      }
      
      if (statusResult?.status === "pending" || statusResult?.status === "outdated") {
        return { success: false, error: "Embedding was interrupted" };
      }

      pollInterval = getNextPollInterval(pollInterval);
    }

    throw new DOMException("Aborted", "AbortError");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function executeEmbedKnowledgeBase(
  task: Task,
  signal: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const { kbId, operatorId } = task.data;
  if (!kbId) {
    return { success: false, error: "Knowledge base ID is required" };
  }

  try {
    const response = await fetch("/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operatorId,
        action: "embed_kb",
        kbId,
      }),
      signal,
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || "Batch embedding failed" };
    }

    let pollInterval = POLL_CONFIG.initialInterval;

    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const status = await checkKnowledgeBaseEmbeddingStatus(kbId, operatorId);

      if (status.allCompleted) {
        return { success: true };
      }

      if (!status.hasPendingOrProcessing && !status.allCompleted) {
        return { success: true };
      }

      pollInterval = getNextPollInterval(pollInterval);
    }

    throw new DOMException("Aborted", "AbortError");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

type CrawlJobStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

interface CrawlJobStatusResponse {
  status: CrawlJobStatus;
  error?: string;
  pagesCrawled?: number;
  totalPages?: number;
  progress?: number;
}

async function checkCrawlJobStatus(jobId: string): Promise<CrawlJobStatusResponse | null> {
  try {
    const response = await fetch(`/api/crawl?job_id=${jobId}`);
    if (!response.ok) return null;
    const result = await response.json();
    return {
      status: result.job?.status || "pending",
      error: result.job?.error,
      pagesCrawled: result.job?.pages_crawled,
      totalPages: result.job?.total_pages,
      progress: result.job?.progress,
    };
  } catch {
    return null;
  }
}

async function executeCrawlWebpage(
  task: Task,
  signal: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const {
    url,
    kbId,
    mode,
    maxDepth,
    maxPages,
    sourceLabel,
    userId,
    useAi,
    extractionMode,
    extractionPrompt,
    preset,
    cssSelector,
    excludedSelector,
    forceReanalyze,
  } = task.data;

  if (!url || !kbId) {
    return { success: false, error: "URL and Knowledge Base ID are required" };
  }

  try {
    const response = await fetch("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        kb_id: kbId,
        user_id: userId,
        mode: mode || "single_url",
        max_depth: maxDepth || 3,
        max_pages: maxPages || 100,
        source_label: sourceLabel,
        use_ai: useAi ?? true,
        extraction_mode: extractionMode || "auto",
        extraction_prompt: extractionPrompt,
        preset,
        css_selector: cssSelector,
        excluded_selector: excludedSelector,
        force_reanalyze: forceReanalyze || false,
      }),
      signal,
    });

    const result = await response.json();
    if (!response.ok) {
      return { success: false, error: result.error || "Failed to start crawl" };
    }

    const jobId = result.job_id || result.id;
    if (!jobId) {
      return { success: true };
    }

    let pollInterval = POLL_CONFIG.initialInterval;

    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const status = await checkCrawlJobStatus(jobId);
      
      if (!status) {
        pollInterval = getNextPollInterval(pollInterval);
        continue;
      }

      if (status.status === "completed") {
        return { success: true };
      }
      
      if (status.status === "failed") {
        return { success: false, error: status.error || "Crawl failed on server" };
      }

      if (status.status === "cancelled") {
        return { success: false, error: "Crawl was cancelled" };
      }

      pollInterval = getNextPollInterval(pollInterval);
    }

    throw new DOMException("Aborted", "AbortError");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
