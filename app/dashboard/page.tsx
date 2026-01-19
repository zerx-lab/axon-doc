"use client";

import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();

  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? t("greeting.morning")
      : currentHour < 18
        ? t("greeting.afternoon")
        : t("greeting.evening");

  const stats = [
    { label: t("stats.totalUsers"), value: "1", change: "+0%" },
    { label: t("stats.activeSessions"), value: "1", change: "+100%" },
    { label: t("stats.systemStatus"), value: t("stats.online"), change: null },
    { label: t("stats.uptime"), value: "100%", change: null },
  ];

  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-12 opacity-0 animate-fade-in">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {greeting}
        </p>
        <h1 className="mt-2 font-mono text-2xl font-medium tracking-tight">
          {user?.display_name || user?.username || t("common.user")}
        </h1>
      </header>

      {/* Stats Grid */}
      <section className="mb-12">
        <div className="mb-6 flex items-center justify-between opacity-0 animate-fade-in delay-100">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {t("dashboard.overview")}
          </h2>
          <div className="h-px flex-1 bg-border mx-4" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {new Date().toLocaleDateString(dateLocale, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="group border border-border bg-card p-6 transition-colors hover:border-foreground/20 opacity-0 animate-fade-in"
              style={{ animationDelay: `${150 + index * 50}ms` }}
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </p>
              <div className="mt-4 flex items-end justify-between">
                <span className="font-mono text-3xl font-light tracking-tight">
                  {stat.value}
                </span>
                {stat.change && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {stat.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-12">
        <div className="mb-6 flex items-center opacity-0 animate-fade-in delay-300">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {t("dashboard.quickActions")}
          </h2>
          <div className="h-px flex-1 bg-border mx-4" />
        </div>

        <div className="grid gap-4 md:grid-cols-3 opacity-0 animate-fade-in delay-400">
          <ActionCard
            title={t("action.manageUsers")}
            description={t("action.manageUsersDesc")}
            href="/dashboard/users"
          />
          <ActionCard
            title={t("action.systemSettings")}
            description={t("action.systemSettingsDesc")}
            href="/dashboard/settings"
          />
          <ActionCard
            title={t("action.viewLogs")}
            description={t("action.viewLogsDesc")}
            href="/dashboard/logs"
          />
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <div className="mb-6 flex items-center opacity-0 animate-fade-in delay-400">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {t("dashboard.recentActivity")}
          </h2>
          <div className="h-px flex-1 bg-border mx-4" />
        </div>

        <div className="border border-border bg-card opacity-0 animate-fade-in delay-400">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <div>
                <p className="font-mono text-xs">{t("dashboard.sessionStarted")}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {user?.last_login_at
                    ? new Date(user.last_login_at).toLocaleString(dateLocale)
                    : t("dashboard.justNow")}
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <div>
                <p className="font-mono text-xs">{t("dashboard.systemInitialized")}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t("dashboard.welcomeToAxonDoc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer decoration */}
      <div className="mt-16 flex items-center justify-center opacity-0 animate-fade-in delay-400">
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
            AxonDoc v1.0
          </span>
          <div className="h-px w-8 bg-border" />
        </div>
      </div>
    </div>
  );
}

interface ActionCardProps {
  readonly title: string;
  readonly description: string;
  readonly href: string;
}

function ActionCard({ title, description, href }: ActionCardProps) {
  return (
    <a
      href={href}
      className="group block border border-border bg-card p-6 transition-all hover:border-foreground/20"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-mono text-sm font-medium">{title}</h3>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{description}</p>
        </div>
        <svg
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
}
