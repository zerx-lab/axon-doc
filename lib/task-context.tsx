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

export type TaskType = "embed_document" | "embed_kb";
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
  data: {
    docId?: string;
    kbId?: string;
    operatorId: string;
    [key: string]: unknown;
  };
}

interface TaskContextType {
  tasks: Task[];
  pendingCount: number;
  runningCount: number;
  addTask: (task: Omit<Task, "id" | "createdAt" | "status" | "progress">) => string;
  removeTask: (taskId: string) => void;
  clearCompletedTasks: () => void;
  clearAllTasks: () => void;
  cancelTask: (taskId: string) => void;
  getTask: (taskId: string) => Task | undefined;
  isTaskPanelOpen: boolean;
  setTaskPanelOpen: (open: boolean) => void;
}

const TaskContext = createContext<TaskContextType | null>(null);

const STORAGE_KEY = "axon_tasks";
const MAX_COMPLETED_TASKS = 50;
const POLL_INTERVAL = 2000;

type EmbeddingStatus = "pending" | "processing" | "completed" | "failed" | "outdated";

async function checkDocumentEmbeddingStatus(
  docId: string,
  operatorId: string
): Promise<EmbeddingStatus | null> {
  try {
    const params = new URLSearchParams({ operatorId, docId });
    const response = await fetch(`/api/embeddings?${params}`);
    if (!response.ok) return null;
    const result = await response.json();
    return result.document?.embeddingStatus || null;
  } catch {
    return null;
  }
}

async function checkKnowledgeBaseEmbeddingStatus(
  kbId: string,
  operatorId: string
): Promise<{ hasProcessing: boolean; allCompleted: boolean }> {
  try {
    const params = new URLSearchParams({ operatorId, kbId });
    const response = await fetch(`/api/embeddings?${params}`);
    if (!response.ok) return { hasProcessing: false, allCompleted: false };
    const result = await response.json();
    const stats = result.stats;
    if (!stats) return { hasProcessing: false, allCompleted: false };
    const hasProcessing = stats.pending_documents > 0;
    const allCompleted = stats.embedded_documents === stats.total_documents && stats.total_documents > 0;
    return { hasProcessing, allCompleted };
  } catch {
    return { hasProcessing: false, allCompleted: false };
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
            const status = await checkDocumentEmbeddingStatus(
              task.data.docId,
              task.data.operatorId
            );
            
            if (status === "completed") {
              restoredTasks.push({
                ...task,
                status: "completed",
                progress: 100,
                completedAt: Date.now(),
              });
            } else if (status === "failed") {
              restoredTasks.push({
                ...task,
                status: "failed",
                error: "Embedding failed on server",
                completedAt: Date.now(),
              });
            } else if (status === "processing") {
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
            } else if (status.hasProcessing) {
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

    setTasks((prev) =>
      prev.map((t) =>
        t.id === nextTask.id
          ? { ...t, status: "running" as TaskStatus, startedAt: Date.now() }
          : t
      )
    );

    executeTask(nextTask, abortController.signal)
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
      setTasks((prev) => prev.filter((t) => !toRemoveIds.has(t.id)));
    }
  }, [tasks]);

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

  const getTask = useCallback(
    (taskId: string): Task | undefined => {
      return tasks.find((t) => t.id === taskId);
    },
    [tasks]
  );

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const runningCount = tasks.filter((t) => t.status === "running").length;

  return (
    <TaskContext.Provider
      value={{
        tasks,
        pendingCount,
        runningCount,
        addTask,
        removeTask,
        clearCompletedTasks,
        clearAllTasks,
        cancelTask,
        getTask,
        isTaskPanelOpen,
        setTaskPanelOpen,
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

async function executeTask(
  task: Task,
  signal: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  switch (task.type) {
    case "embed_document":
      return executeEmbedDocument(task, signal);
    case "embed_kb":
      return executeEmbedKnowledgeBase(task, signal);
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
    const currentStatus = await checkDocumentEmbeddingStatus(docId, operatorId);
    
    if (currentStatus !== "processing") {
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

    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const status = await checkDocumentEmbeddingStatus(docId, operatorId);
      
      if (status === "completed") {
        return { success: true };
      }
      
      if (status === "failed") {
        return { success: false, error: "Embedding failed on server" };
      }
      
      if (status === "pending" || status === "outdated") {
        return { success: false, error: "Embedding was interrupted" };
      }
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

    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const status = await checkKnowledgeBaseEmbeddingStatus(kbId, operatorId);
      
      if (status.allCompleted) {
        return { success: true };
      }
      
      if (!status.hasProcessing && !status.allCompleted) {
        return { success: true };
      }
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
