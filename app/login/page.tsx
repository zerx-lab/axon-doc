"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error || t("auth.loginFailed"));
      }
    } catch {
      setError(t("auth.connectionFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Geometric background elements */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top left corner accent */}
        <div className="absolute left-0 top-0 h-px w-32 bg-border" />
        <div className="absolute left-0 top-0 h-32 w-px bg-border" />

        {/* Bottom right corner accent */}
        <div className="absolute bottom-0 right-0 h-px w-32 bg-border" />
        <div className="absolute bottom-0 right-0 h-32 w-px bg-border" />

        {/* Center cross pattern */}
        <div className="absolute left-1/2 top-1/4 h-px w-16 -translate-x-1/2 bg-border/50" />
        <div className="absolute bottom-1/4 left-1/2 h-px w-16 -translate-x-1/2 bg-border/50" />

        {/* Subtle grid dots */}
        <div className="absolute left-1/4 top-1/3 h-1 w-1 rounded-full bg-border" />
        <div className="absolute right-1/4 top-1/3 h-1 w-1 rounded-full bg-border" />
        <div className="absolute bottom-1/3 left-1/4 h-1 w-1 rounded-full bg-border" />
        <div className="absolute bottom-1/3 right-1/4 h-1 w-1 rounded-full bg-border" />
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo/Brand */}
        <div className="mb-16 text-center opacity-0 animate-fade-in">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center border border-border">
            <span className="font-mono text-lg font-medium tracking-tighter">
              Ax
            </span>
          </div>
          <h1 className="font-mono text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            AxonDoc
          </h1>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 opacity-0 animate-fade-in delay-100">
            <div className="group">
              <label
                htmlFor="username"
                className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors group-focus-within:text-foreground"
              >
                {t("auth.username")}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 w-full border border-border bg-transparent px-4 font-mono text-sm text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-muted focus:border-foreground focus:outline-none"
                placeholder={t("auth.enterUsername")}
                required
                autoComplete="username"
              />
            </div>

            <div className="group">
              <label
                htmlFor="password"
                className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors group-focus-within:text-foreground"
              >
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full border border-border bg-transparent px-4 font-mono text-sm text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-muted focus:border-foreground focus:outline-none"
                placeholder={t("auth.enterPassword")}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <div className="opacity-0 animate-fade-in delay-200">
            <button
              type="submit"
              disabled={isLoading}
              className="group relative h-12 w-full border border-foreground bg-foreground font-mono text-xs font-medium uppercase tracking-widest text-background transition-all hover:bg-transparent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={isLoading ? "opacity-0" : ""}>
                {t("auth.signIn")}
              </span>
              {isLoading && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="h-4 w-4 animate-pulse border border-current" />
                </span>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-16 text-center opacity-0 animate-fade-in delay-300">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
            {t("auth.securePortal")}
          </p>
        </div>
      </div>

      {/* Corner decorations */}
      <div className="pointer-events-none absolute bottom-8 left-8 font-mono text-[10px] tracking-widest text-border">
        v1.0
      </div>
      <div className="pointer-events-none absolute bottom-8 right-8 font-mono text-[10px] tracking-widest text-border">
        2026
      </div>
    </div>
  );
}
