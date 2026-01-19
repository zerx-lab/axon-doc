"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n";
import { useTask } from "@/lib/task-context";

interface CrawlDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly kbId: string;
  readonly userId: string;
}

type CrawlMode = "single_url" | "full_site";
type ExtractionMode = "auto" | "preset" | "manual";

const FRAMEWORK_PRESETS = [
  "docusaurus",
  "gitbook",
  "vuepress",
  "mkdocs",
  "sphinx",
  "generic",
] as const;

export function CrawlDialog({ open, onClose, kbId, userId }: CrawlDialogProps) {
  const { t } = useI18n();
  const { addTask } = useTask();

  const defaultExtractionPrompt = t("crawl.extractionPromptDefault");

  const [mode, setMode] = useState<CrawlMode>("single_url");
  const [url, setUrl] = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxPages, setMaxPages] = useState(100);
  const [sourceLabel, setSourceLabel] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [useAi, setUseAi] = useState(true);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>("auto");
  const [extractionPrompt, setExtractionPrompt] = useState(defaultExtractionPrompt);
  const [preset, setPreset] = useState("generic");
  const [cssSelector, setCssSelector] = useState("");
  const [excludedSelector, setExcludedSelector] = useState("");
  const [forceReanalyze, setForceReanalyze] = useState(false);

  const validateUrl = (urlString: string): boolean => {
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    setError("");

    if (!url.trim()) {
      setError(t("crawl.urlRequired"));
      return;
    }

    if (!validateUrl(url)) {
      setError(t("crawl.invalidUrl"));
      return;
    }

    setIsSubmitting(true);

    try {
      addTask({
        type: "crawl_webpage",
        title: `${t("crawl.crawlWebpage")}: ${url}`,
        data: {
          url,
          kbId,
          userId,
          mode,
          maxDepth: mode === "full_site" ? maxDepth : 1,
          maxPages: mode === "full_site" ? maxPages : 1,
          sourceLabel: sourceLabel.trim() || undefined,
          operatorId: userId,
          useAi,
          extractionMode: useAi ? extractionMode : undefined,
          extractionPrompt: useAi && extractionPrompt.trim() ? extractionPrompt.trim() : undefined,
          preset: useAi && extractionMode === "preset" ? preset : undefined,
          cssSelector: useAi && extractionMode === "manual" ? cssSelector.trim() || undefined : undefined,
          excludedSelector: useAi && extractionMode === "manual" ? excludedSelector.trim() || undefined : undefined,
          forceReanalyze: useAi ? forceReanalyze : undefined,
        },
      });

      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("crawl.startFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setUrl("");
    setMaxDepth(3);
    setMaxPages(100);
    setSourceLabel("");
    setShowAdvanced(false);
    setMode("single_url");
    setUseAi(true);
    setExtractionMode("auto");
    setExtractionPrompt(defaultExtractionPrompt);
    setPreset("generic");
    setCssSelector("");
    setExcludedSelector("");
    setForceReanalyze(false);
    setError("");
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("crawl.title")}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting}>
            {t("crawl.startCrawl")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("crawl.mode")}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("single_url")}
              className={`flex-1 border px-3 py-2 font-mono text-xs transition-colors ${
                mode === "single_url"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:border-foreground/20"
              }`}
            >
              {t("crawl.singleUrl")}
            </button>
            <button
              type="button"
              onClick={() => setMode("full_site")}
              className={`flex-1 border px-3 py-2 font-mono text-xs transition-colors ${
                mode === "full_site"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:border-foreground/20"
              }`}
            >
              {t("crawl.fullSite")}
            </button>
          </div>
        </div>

        <Input
          label={t("crawl.url")}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("crawl.urlPlaceholder")}
          error={error}
          disabled={isSubmitting}
        />

        {mode === "full_site" && (
          <>
            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {t("crawl.maxDepth")}
                </span>
                <span className="font-mono text-xs text-foreground">{maxDepth}</span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {t("crawl.maxPages")}
                </span>
                <span className="font-mono text-xs text-foreground">{maxPages}</span>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>
          </>
        )}

        <div className="border-t border-border pt-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                {t("crawl.useAi")}
              </span>
              <p className="text-[10px] text-muted/70 mt-0.5">
                {t("crawl.useAiDesc")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUseAi(!useAi)}
              disabled={isSubmitting}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                useAi ? "bg-foreground" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform ${
                  useAi ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </div>

        {useAi && (
          <div className="space-y-4 border border-border/50 bg-foreground/[0.02] p-4">
            <div className="space-y-2">
              <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
                {t("crawl.extractionMode")}
              </label>
              <div className="flex gap-2">
                {(["auto", "preset", "manual"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExtractionMode(m)}
                    className={`flex-1 border px-2 py-1.5 font-mono text-[10px] transition-colors ${
                      extractionMode === m
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card hover:border-foreground/20"
                    }`}
                    disabled={isSubmitting}
                  >
                    {t(`crawl.extractionMode.${m}`)}
                  </button>
                ))}
              </div>
            </div>

            {extractionMode === "auto" && (
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
                  {t("crawl.extractionPrompt")}
                </label>
                <textarea
                  value={extractionPrompt}
                  onChange={(e) => setExtractionPrompt(e.target.value)}
                  placeholder={t("crawl.extractionPromptPlaceholder")}
                  disabled={isSubmitting}
                  rows={2}
                  className="w-full border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted/50 focus:border-foreground focus:outline-none resize-none"
                />
              </div>
            )}

            {extractionMode === "preset" && (
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
                  {t("crawl.preset")}
                </label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full border border-border bg-card px-3 py-2 font-mono text-xs text-foreground focus:border-foreground focus:outline-none"
                >
                  {FRAMEWORK_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {t(`crawl.preset.${p}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {extractionMode === "manual" && (
              <>
                <Input
                  label={t("crawl.cssSelector")}
                  value={cssSelector}
                  onChange={(e) => setCssSelector(e.target.value)}
                  placeholder={t("crawl.cssSelectorPlaceholder")}
                  disabled={isSubmitting}
                />
                <Input
                  label={t("crawl.excludedSelector")}
                  value={excludedSelector}
                  onChange={(e) => setExcludedSelector(e.target.value)}
                  placeholder={t("crawl.excludedSelectorPlaceholder")}
                  disabled={isSubmitting}
                />
              </>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forceReanalyze}
                onChange={(e) => setForceReanalyze(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 border border-border bg-card text-foreground focus:ring-0 focus:ring-offset-0"
              />
              <div>
                <span className="font-mono text-[10px] text-foreground">
                  {t("crawl.forceReanalyze")}
                </span>
                <p className="text-[10px] text-muted/70">
                  {t("crawl.forceReanalyzeDesc")}
                </p>
              </div>
            </label>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted hover:text-foreground"
            disabled={isSubmitting}
          >
            {t("crawl.advancedSettings")}
            <svg
              className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvanced && (
            <div className="mt-4">
              <Input
                label={t("crawl.sourceLabel")}
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder={t("crawl.sourceLabelPlaceholder")}
                disabled={isSubmitting}
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
