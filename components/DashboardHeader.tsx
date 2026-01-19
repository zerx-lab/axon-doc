"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useTask, type Task, type TaskStatus } from "@/lib/task-context";

interface User {
  _id: string;
  username: string;
  displayName?: string;
  permissions: string[];
  isSuperAdmin: boolean;
}

interface DashboardHeaderProps {
  readonly user: User | null;
  readonly onLogout: () => void;
}

export function DashboardHeader({ user, onLogout }: DashboardHeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const {
    tasks,
    pendingCount,
    runningCount,
    removeTask,
    cancelTask,
    clearCompletedTasks,
  } = useTask();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  
  const activeTaskCount = pendingCount + runningCount;
  const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  const hasCompletedTasks = tasks.some(
    (task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled"
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (taskMenuRef.current && !taskMenuRef.current.contains(event.target as Node)) {
        setTaskMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      {/* Task Queue */}
      <div ref={taskMenuRef} className="relative">
        <button
          onClick={() => setTaskMenuOpen(!taskMenuOpen)}
          className="flex h-8 items-center gap-1.5 border border-border px-3 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-foreground hover:text-foreground"
        >
          <TaskIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("task.title")}</span>
          {activeTaskCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center bg-foreground px-1 font-mono text-[9px] text-background">
              {activeTaskCount}
            </span>
          )}
          {runningCount > 0 && <Spinner className="h-3 w-3" />}
        </button>
        {taskMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-80 border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {t("task.title")}
              </span>
              {hasCompletedTasks && (
                <button
                  onClick={clearCompletedTasks}
                  className="font-mono text-[10px] text-muted transition-colors hover:text-foreground"
                >
                  {t("task.clearCompleted")}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {sortedTasks.length === 0 ? (
                <div className="px-4 py-6 text-center font-mono text-xs text-muted">
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
        )}
      </div>

      {/* Language Switcher */}
      <div ref={langMenuRef} className="relative">
        <button
          onClick={() => setLangMenuOpen(!langMenuOpen)}
          className="flex h-8 items-center gap-1.5 border border-border px-3 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-foreground hover:text-foreground"
        >
          <GlobeIcon className="h-3.5 w-3.5" />
          <span>{locale === "zh" ? "CN" : "EN"}</span>
          <ChevronDownIcon className={`h-3 w-3 transition-transform ${langMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {langMenuOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[100px] border border-border bg-background shadow-lg">
            <button
              onClick={() => {
                setLocale("zh");
                setLangMenuOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${
                locale === "zh"
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-card hover:text-foreground"
              }`}
            >
              {locale === "zh" && <CheckIcon className="h-3 w-3" />}
              <span className={locale !== "zh" ? "ml-5" : ""}>中文</span>
            </button>
            <button
              onClick={() => {
                setLocale("en");
                setLangMenuOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${
                locale === "en"
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-card hover:text-foreground"
              }`}
            >
              {locale === "en" && <CheckIcon className="h-3 w-3" />}
              <span className={locale !== "en" ? "ml-5" : ""}>English</span>
            </button>
          </div>
        )}
      </div>

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="flex h-8 w-8 items-center justify-center border border-border text-muted transition-colors hover:border-foreground hover:text-foreground"
        title={theme === "light" ? t("settings.themeDark") : t("settings.themeLight")}
      >
        {theme === "light" ? <MoonIcon className="h-3.5 w-3.5" /> : <SunIcon className="h-3.5 w-3.5" />}
      </button>

      {/* User Menu */}
      <div ref={userMenuRef} className="relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex h-8 items-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-foreground hover:text-foreground"
        >
          <div className="flex h-5 w-5 items-center justify-center border border-current">
            <span className="text-[9px]">{user?.username.charAt(0).toUpperCase()}</span>
          </div>
          <span className="hidden sm:inline">{user?.displayName || user?.username}</span>
          <ChevronDownIcon className={`h-3 w-3 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[160px] border border-border bg-background shadow-lg">
            {/* User Info */}
            <div className="border-b border-border px-3 py-2">
              <p className="font-mono text-xs font-medium">
                {user?.displayName || user?.username}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {user?.isSuperAdmin ? t("role.super_admin") : t("role.user")}
              </p>
            </div>
            {/* Logout */}
            <button
              onClick={() => {
                setUserMenuOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 font-mono text-xs text-muted transition-colors hover:bg-card hover:text-foreground"
            >
              <LogoutIcon className="h-3.5 w-3.5" />
              <span>{t("auth.signOut")}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// Icons
function GlobeIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SunIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function LogoutIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
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
    <li className="px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            <span className="truncate font-mono text-[11px]">{task.title}</span>
          </div>
          {task.error && (
            <p className="mt-1 truncate font-mono text-[10px] text-red-500">{task.error}</p>
          )}
        </div>
        <div className="flex items-center">
          {canCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-muted transition-colors hover:text-foreground"
              title={t("task.cancel")}
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
          {canRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-muted transition-colors hover:text-foreground"
              title={t("common.delete")}
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {task.status === "running" && (
        <div className="mt-1.5 h-0.5 w-full overflow-hidden bg-card">
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
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] ${config.className}`}>
      {status === "running" && <Spinner className="h-2 w-2" />}
      {config.label}
    </span>
  );
}
