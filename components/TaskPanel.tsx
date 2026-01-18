"use client";

import { useTask, type Task, type TaskStatus } from "@/lib/task-context";
import { useI18n } from "@/lib/i18n";

export function TaskPanel() {
  const { t } = useI18n();
  const {
    tasks,
    pendingCount,
    runningCount,
    isTaskPanelOpen,
    setTaskPanelOpen,
    removeTask,
    cancelTask,
    clearCompletedTasks,
  } = useTask();

  const activeCount = pendingCount + runningCount;
  const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  const hasCompletedTasks = tasks.some(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled"
  );

  if (tasks.length === 0 && !isTaskPanelOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isTaskPanelOpen ? (
        <div className="w-80 border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <TaskIcon className="h-4 w-4" />
              <span className="font-mono text-xs uppercase tracking-wider">
                {t("task.title")}
              </span>
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center bg-foreground px-1.5 font-mono text-[10px] text-background">
                  {activeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasCompletedTasks && (
                <button
                  onClick={clearCompletedTasks}
                  className="p-1.5 text-muted transition-colors hover:text-foreground"
                  title={t("task.clearCompleted")}
                >
                  <ClearIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setTaskPanelOpen(false)}
                className="p-1.5 text-muted transition-colors hover:text-foreground"
              >
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {sortedTasks.length === 0 ? (
              <div className="px-4 py-8 text-center font-mono text-xs text-muted">
                {t("task.noTasks")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {sortedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onCancel={() => cancelTask(task.id)}
                    onRemove={() => removeTask(task.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setTaskPanelOpen(true)}
          className="flex items-center gap-2 border border-border bg-background px-4 py-2 shadow-lg transition-colors hover:bg-card"
        >
          <TaskIcon className="h-4 w-4" />
          <span className="font-mono text-xs uppercase tracking-wider">
            {t("task.title")}
          </span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center bg-foreground px-1.5 font-mono text-[10px] text-background">
              {activeCount}
            </span>
          )}
          {runningCount > 0 && <Spinner className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

interface TaskItemProps {
  readonly task: Task;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
}

function TaskItem({ task, onCancel, onRemove }: TaskItemProps) {
  const { t } = useI18n();
  const canCancel = task.status === "pending" || task.status === "running";
  const canRemove = !canCancel;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            <span className="truncate font-mono text-xs">{task.title}</span>
          </div>
          {task.description && (
            <p className="mt-1 truncate font-mono text-[10px] text-muted">
              {task.description}
            </p>
          )}
          {task.error && (
            <p className="mt-1 truncate font-mono text-[10px] text-red-500">
              {task.error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-muted transition-colors hover:text-foreground"
              title={t("task.cancel")}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {canRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-muted transition-colors hover:text-foreground"
              title={t("common.delete")}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {task.status === "running" && (
        <div className="mt-2 h-1 w-full overflow-hidden bg-card">
          <div className="h-full w-full animate-pulse bg-foreground" />
        </div>
      )}
    </li>
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
      className: "bg-muted/30 text-muted",
    },
    running: {
      label: t("task.status.running"),
      className: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    },
    completed: {
      label: t("task.status.completed"),
      className: "bg-green-500/20 text-green-600 dark:text-green-400",
    },
    failed: {
      label: t("task.status.failed"),
      className: "bg-red-500/20 text-red-600 dark:text-red-400",
    },
    cancelled: {
      label: t("task.status.cancelled"),
      className: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] ${config.className}`}>
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

function ChevronDownIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 9l6 6 6-6" />
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

function ClearIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
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
