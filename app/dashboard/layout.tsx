"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { DashboardHeader } from "@/components/DashboardHeader";
import { useAuth, type User } from "@/lib/auth-context";
import { TaskProvider } from "@/lib/task-context";
import { TaskPanel } from "@/components/TaskPanel";

interface DashboardLayoutProps {
  readonly children: ReactNode;
}

const navigationItems = [
  { key: "nav.overview", href: "/dashboard", icon: GridIcon },
  { key: "nav.users", href: "/dashboard/users", icon: UsersIcon },
  { key: "nav.roles", href: "/dashboard/roles", icon: ShieldIcon },
  { key: "nav.knowledgeBases", href: "/dashboard/knowledge-bases", icon: BookIcon },
  { key: "nav.settings", href: "/dashboard/settings", icon: SettingsIcon },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-pulse border border-foreground" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("common.loading")}
          </span>
        </div>
      </div>
    );
  }

  // Transform user for DashboardHeader compatibility
  const headerUser = user ? {
    _id: user.id,
    username: user.username,
    displayName: user.display_name || undefined,
    permissions: user.permissions,
    isSuperAdmin: user.isSuperAdmin,
  } : null;

  return (
    <TaskProvider>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-background transition-all duration-300 ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          {/* Logo */}
          <div className="group/header relative flex h-16 items-center border-b border-border px-4">
            {sidebarCollapsed ? (
              <>
                {/* Collapsed: Logo centered, chevron on hover */}
                <Link
                  href="/dashboard"
                  className="flex h-8 w-8 items-center justify-center border border-border"
                >
                  <span className="font-mono text-xs font-medium">Ax</span>
                </Link>
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity group-hover/header:opacity-100"
                >
                  <ChevronIcon collapsed={true} />
                </button>
              </>
            ) : (
              <>
                {/* Expanded: Logo + text + chevron */}
                <Link href="/dashboard" className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center border border-border">
                    <span className="font-mono text-xs font-medium">Ax</span>
                  </div>
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em]">
                    AxonBase
                  </span>
                </Link>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="ml-auto flex h-6 w-6 items-center justify-center text-muted transition-colors hover:text-foreground"
                >
                  <ChevronIcon collapsed={false} />
                </button>
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4">
            <ul className="space-y-1">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={`group flex h-10 items-center gap-3 px-3 font-mono text-xs transition-colors ${
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted hover:bg-card hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="uppercase tracking-wider">{t(item.key)}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

        </aside>

        {/* Main content */}
        <main
          className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ${
            sidebarCollapsed ? "ml-16" : "ml-64"
          }`}
        >
          <DashboardHeader user={headerUser} onLogout={handleLogout} />
          <div className="flex-1">{children}</div>
        </main>

        <TaskPanel />
      </div>
    </TaskProvider>
  );
}

// Icons
function GridIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function UsersIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="17" cy="7" r="3" />
      <path d="M21 21v-2a3 3 0 0 0-2-2.83" />
    </svg>
  );
}

function SettingsIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function ShieldIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function BookIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}
