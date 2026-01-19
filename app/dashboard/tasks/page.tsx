"use client";

import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useTask, type Task, type TaskStatus } from "@/lib/task-context";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TasksPage() {
  const { t } = useI18n();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const {
    tasks,
    pendingCount,
    runningCount,
    removeTask,
    cancelTask,
    clearCompletedTasks,
    clearAllTasks,
  } = useTask();

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/login");
    }
  }, [authLoading, authUser, router]);

  const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  const completedCount = tasks.filter(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled"
  ).length;

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case "embed_document":
        return t("task.embedDocument");
      case "embed_kb":
        return t("task.embedKnowledgeBase");
      case "crawl_webpage":
        return t("crawl.crawlWebpage");
      default:
        return type;
    }
  };

  const formatDuration = (startedAt?: number, completedAt?: number) => {
    if (!startedAt) return "-";
    const end = completedAt || Date.now();
    const duration = Math.round((end - startedAt) / 1000);
    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-medium">{t("task.title")}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            {pendingCount} {t("task.status.pending").toLowerCase()} · {runningCount} {t("task.status.running").toLowerCase()} · {completedCount} {t("task.status.completed").toLowerCase()}
          </p>
        </div>
        <div className="flex gap-2">
          {completedCount > 0 && (
            <Button variant="secondary" onClick={clearCompletedTasks}>
              <ClearIcon className="mr-2 h-3 w-3" />
              {t("task.clearCompleted")}
            </Button>
          )}
          {tasks.length > 0 && (
            <Button variant="danger" onClick={clearAllTasks}>
              <TrashIcon className="mr-2 h-3 w-3" />
              {t("task.clearAll")}
            </Button>
          )}
        </div>
      </div>

      <div className="border border-border">
        <div className="grid grid-cols-[2fr_1fr_120px_140px_140px_120px] gap-4 border-b border-border bg-card px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("task.taskName")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("task.taskType")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("common.status")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("task.createdTime")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("task.duration")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("common.actions")}
          </div>
        </div>

        {sortedTasks.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <TaskIcon className="mx-auto h-12 w-12 text-muted/30" />
              <span className="mt-4 block font-mono text-xs text-muted">{t("task.noTasks")}</span>
            </div>
          </div>
        ) : (
          sortedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              getTaskTypeLabel={getTaskTypeLabel}
              formatDuration={formatDuration}
              formatTime={formatTime}
              onCancel={() => cancelTask(task.id)}
              onRemove={() => removeTask(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TaskRowProps {
  readonly task: Task;
  readonly getTaskTypeLabel: (type: string) => string;
  readonly formatDuration: (startedAt?: number, completedAt?: number) => string;
  readonly formatTime: (timestamp: number) => string;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
}

function TaskRow({ task, getTaskTypeLabel, formatDuration, formatTime, onCancel, onRemove }: TaskRowProps) {
  const { t } = useI18n();
  const canCancel = task.status === "pending" || task.status === "running";

  return (
    <div className="grid grid-cols-[2fr_1fr_120px_140px_140px_120px] gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-card/50">
      <div className="min-w-0">
        <div className="truncate font-mono text-sm" title={task.title}>
          {task.title}
        </div>
        {task.error && (
          <div className="mt-1 truncate font-mono text-[10px] text-red-500" title={task.error}>
            {task.error}
          </div>
        )}
      </div>
      <div className="font-mono text-xs text-muted">
        {getTaskTypeLabel(task.type)}
      </div>
      <div>
        <StatusBadge status={task.status} />
        {task.status === "running" && (
          <div className="mt-2 h-1 w-full overflow-hidden bg-card">
            <div className="h-full w-full animate-pulse bg-foreground" />
          </div>
        )}
      </div>
      <div className="font-mono text-xs text-muted">
        {formatTime(task.createdAt)}
      </div>
      <div className="font-mono text-xs text-muted">
        {formatDuration(task.startedAt, task.completedAt)}
      </div>
      <div className="flex items-center gap-1">
        {canCancel ? (
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center text-muted hover:text-red-500"
            title={t("task.cancel")}
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center text-muted hover:text-foreground"
            title={t("common.delete")}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  readonly status: TaskStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();

  const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
    pending: {
      label: t("task.status.pending"),
      className: "border-border bg-muted/20 text-muted",
    },
    running: {
      label: t("task.status.running"),
      className: "border-blue-500/50 bg-blue-500/10 text-blue-500",
    },
    completed: {
      label: t("task.status.completed"),
      className: "border-green-500/50 bg-green-500/10 text-green-500",
    },
    failed: {
      label: t("task.status.failed"),
      className: "border-red-500/50 bg-red-500/10 text-red-500",
    },
    cancelled: {
      label: t("task.status.cancelled"),
      className: "border-yellow-500/50 bg-yellow-500/10 text-yellow-500",
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] uppercase ${config.className}`}>
      {status === "running" && <Spinner className="h-2.5 w-2.5" />}
      {config.label}
    </span>
  );
}

function TaskIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ClearIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function TrashIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function XIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function Spinner({ className }: { readonly className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
