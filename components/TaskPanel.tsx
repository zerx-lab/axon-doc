"use client";

import { useTask, type Task, type TaskStatus, formatETA } from "@/lib/task-context";
import { useI18n } from "@/lib/i18n";
import { useState, useEffect, useRef } from "react";

export function TaskPanel() {
  const { t } = useI18n();
  const {
    tasks,
    pendingCount,
    runningCount,
    completedCount,
    failedCount,
    isTaskPanelOpen,
    setTaskPanelOpen,
    removeTask,
    cancelTask,
    retryTask,
    clearCompletedTasks,
  } = useTask();

  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeCount = pendingCount + runningCount;
  const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  const hasCompletedTasks = tasks.some(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled"
  );

  useEffect(() => {
    if (activeCount === 0 && isTaskPanelOpen && !hasCompletedTasks) {
      const timer = setTimeout(() => {
        setIsMinimized(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [activeCount, isTaskPanelOpen, hasCompletedTasks]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.startPosX + deltaX,
        y: dragRef.current.startPosY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (tasks.length === 0 && !isTaskPanelOpen) {
    return null;
  }

  const panelStyle = {
    transform: `translate(${-position.x}px, ${-position.y}px)`,
  };

  return (
    <div 
      ref={panelRef}
      className="fixed bottom-4 right-4 z-50"
      style={panelStyle}
    >
      {isTaskPanelOpen && !isMinimized ? (
        <div className="w-96 overflow-hidden rounded-xl border border-border/50 bg-background/95 shadow-2xl shadow-black/10 backdrop-blur-xl dark:shadow-black/30">
          {/* Header */}
          <div 
            className={`flex items-center justify-between border-b border-border/50 bg-card/50 px-4 py-3 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <TaskIcon className="h-4 w-4 text-foreground" />
                {runningCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                )}
              </div>
              <span className="font-mono text-xs font-medium uppercase tracking-wider">
                {t("task.title")}
              </span>
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/20 px-1.5 font-mono text-[10px] font-semibold text-blue-500">
                  {activeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasCompletedTasks && (
                <button
                  onClick={clearCompletedTasks}
                  className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-card hover:text-foreground"
                  title={t("task.clearCompleted")}
                >
                  <ClearIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(true)}
                className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-card hover:text-foreground"
                title={t("task.minimize")}
              >
                <MinimizeIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTaskPanelOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-card hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          {tasks.length > 0 && (
            <div className="flex items-center gap-4 border-b border-border/30 bg-card/30 px-4 py-2">
              <StatItem icon={<PendingIcon />} count={pendingCount} label={t("task.status.pending")} color="gray" />
              <StatItem icon={<RunningIcon />} count={runningCount} label={t("task.status.running")} color="blue" />
              <StatItem icon={<CompletedIcon />} count={completedCount} label={t("task.status.completed")} color="green" />
              <StatItem icon={<FailedIcon />} count={failedCount} label={t("task.status.failed")} color="red" />
            </div>
          )}

          {/* Task List */}
          <div className="max-h-96 overflow-y-auto">
            {sortedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12">
                <EmptyIcon className="h-10 w-10 text-muted-foreground/30" />
                <span className="font-mono text-xs text-muted-foreground">
                  {t("task.noTasks")}
                </span>
              </div>
            ) : (
              <ul className="divide-y divide-border/30">
                {sortedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onCancel={() => cancelTask(task.id)}
                    onRemove={() => removeTask(task.id)}
                    onRetry={() => retryTask(task.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setTaskPanelOpen(true);
            setIsMinimized(false);
          }}
          className="group flex items-center gap-2 rounded-xl border border-border/50 bg-background/95 px-4 py-2.5 shadow-lg shadow-black/5 backdrop-blur-xl transition-all hover:border-border hover:shadow-xl dark:shadow-black/20"
        >
          <div className="relative">
            <TaskIcon className="h-4 w-4 text-foreground transition-transform group-hover:scale-110" />
            {runningCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            )}
          </div>
          <span className="font-mono text-xs font-medium uppercase tracking-wider">
            {t("task.title")}
          </span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/20 px-1.5 font-mono text-[10px] font-semibold text-blue-500">
              {activeCount}
            </span>
          )}
          {runningCount > 0 && <Spinner className="h-3.5 w-3.5 text-blue-500" />}
        </button>
      )}
    </div>
  );
}

interface StatItemProps {
  readonly icon: React.ReactNode;
  readonly count: number;
  readonly label: string;
  readonly color: "gray" | "blue" | "green" | "red";
}

function StatItem({ icon, count, label, color }: StatItemProps) {
  const colorClasses = {
    gray: "text-muted-foreground",
    blue: "text-blue-500",
    green: "text-green-500",
    red: "text-red-500",
  };

  return (
    <div className={`flex items-center gap-1.5 ${colorClasses[color]}`} title={label}>
      <span className="h-3 w-3">{icon}</span>
      <span className="font-mono text-[10px] font-semibold">{count}</span>
    </div>
  );
}

interface TaskItemProps {
  readonly task: Task;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
  readonly onRetry: () => void;
}

function TaskItem({ task, onCancel, onRemove, onRetry }: TaskItemProps) {
  const { t } = useI18n();
  const canCancel = task.status === "pending" || task.status === "running";
  const canRemove = !canCancel;
  const canRetry = task.status === "failed";

  const progressData = task.progressData;
  const etaText = progressData && progressData.eta > 0 ? formatETA(progressData.eta) : null;
  const speedText = progressData && progressData.speed > 0 
    ? `${progressData.speed.toFixed(1)}/s` 
    : null;

  return (
    <li className="group px-4 py-3 transition-colors hover:bg-card/30">
      {/* Status indicator bar */}
      <div className={`absolute left-0 top-0 h-full w-1 transition-colors ${getStatusBarColor(task.status)}`} />
      
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            <span className="truncate font-mono text-xs font-medium" title={task.title}>
              {task.title}
            </span>
          </div>
          
          {task.description && (
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
              {task.description}
            </p>
          )}
          
          {task.error && (
            <p className="mt-1.5 truncate rounded bg-red-500/10 px-2 py-1 font-mono text-[10px] text-red-500">
              {task.error}
            </p>
          )}

          {/* Progress section */}
          {task.status === "running" && (
            <div className="mt-3 space-y-1.5">
              <ProgressBar progress={task.progress} />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-foreground">{task.progress}%</span>
                  {progressData && (
                    <span className="font-mono">
                      {progressData.current}/{progressData.total}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {speedText && (
                    <span className="flex items-center gap-1 font-mono">
                      <SpeedIcon className="h-2.5 w-2.5" />
                      {speedText}
                    </span>
                  )}
                  {etaText && (
                    <span className="flex items-center gap-1 font-mono">
                      <ClockIcon className="h-2.5 w-2.5" />
                      {etaText}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Completed info */}
          {task.status === "completed" && task.completedAt && task.startedAt && (
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <ClockIcon className="h-2.5 w-2.5" />
              <span className="font-mono">
                {t("task.duration")}: {formatDuration(task.completedAt - task.startedAt)}
              </span>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canRetry && (
            <button
              onClick={onRetry}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-500"
              title={t("task.retry")}
            >
              <RetryIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
              title={t("task.cancel")}
            >
              <StopIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {canRemove && (
            <button
              onClick={onRemove}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              title={t("common.delete")}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getStatusBarColor(status: TaskStatus): string {
  switch (status) {
    case "pending":
      return "bg-muted-foreground/30";
    case "running":
      return "bg-blue-500";
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "cancelled":
      return "bg-yellow-500";
    default:
      return "bg-muted-foreground/30";
  }
}

interface ProgressBarProps {
  readonly progress: number;
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-card">
      <div 
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
        style={{ width: `${Math.max(progress, 2)}%` }}
      />
      <div 
        className="absolute inset-y-0 left-0 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
        style={{ width: `${Math.max(progress, 2)}%` }}
      />
    </div>
  );
}

interface StatusBadgeProps {
  readonly status: TaskStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();

  const statusConfig: Record<TaskStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: t("task.status.pending"),
      className: "border-muted-foreground/30 bg-muted/20 text-muted-foreground",
      icon: <PendingIcon className="h-2.5 w-2.5" />,
    },
    running: {
      label: t("task.status.running"),
      className: "border-blue-500/30 bg-blue-500/10 text-blue-500",
      icon: <Spinner className="h-2.5 w-2.5" />,
    },
    completed: {
      label: t("task.status.completed"),
      className: "border-green-500/30 bg-green-500/10 text-green-500",
      icon: <CompletedIcon className="h-2.5 w-2.5" />,
    },
    failed: {
      label: t("task.status.failed"),
      className: "border-red-500/30 bg-red-500/10 text-red-500",
      icon: <FailedIcon className="h-2.5 w-2.5" />,
    },
    cancelled: {
      label: t("task.status.cancelled"),
      className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
      icon: <CancelledIcon className="h-2.5 w-2.5" />,
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// Icons
function TaskIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function MinimizeIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function XIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function PendingIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function RunningIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" className="opacity-30" />
      <path d="M12 2a10 10 0 0 1 10 10" className="animate-spin origin-center" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

function CompletedIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function FailedIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

function CancelledIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </svg>
  );
}

function StopIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function RetryIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}

function SpeedIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ClockIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function EmptyIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}
