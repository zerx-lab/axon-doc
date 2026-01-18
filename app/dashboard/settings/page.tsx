"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth-context";
import { Button, Input } from "@/components/ui";
import { PERMISSIONS } from "@/lib/permissions";

interface EmbeddingConfig {
  provider: "openai" | "azure" | "local" | "aliyun";
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  batchSize: number;
  chunkSize: number;
  chunkOverlap: number;
  contextEnabled: boolean;
}

type ChatProvider = "openai" | "anthropic" | "openai-compatible";

interface ChatConfig {
  provider: ChatProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "text-embedding-3-small",
  dimensions: 1536,
  batchSize: 100,
  chunkSize: 400,
  chunkOverlap: 60,
  contextEnabled: false,
};

const PROVIDER_PRESETS: Record<string, Partial<EmbeddingConfig>> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
  azure: {
    baseUrl: "https://YOUR_RESOURCE.openai.azure.com",
    model: "text-embedding-ada-002",
    dimensions: 1536,
  },
  aliyun: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "text-embedding-v3",
    dimensions: 1024,
  },
  local: {
    baseUrl: "http://localhost:11434/v1",
    model: "nomic-embed-text",
    dimensions: 768,
  },
};

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  maxTokens: 2048,
  temperature: 0.7,
};

const CHAT_PROVIDER_PRESETS: Record<ChatProvider, Partial<ChatConfig>> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
  },
  "openai-compatible": {
    baseUrl: "",
    model: "",
  },
};

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [testText, setTestText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    dimensions: number;
    responseTime: number;
    vectorPreview: number[];
    model: string;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSaving, setChatSaving] = useState(false);
  const [chatMessage, setChatMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testChatMessage, setTestChatMessage] = useState("");
  const [chatTesting, setChatTesting] = useState(false);
  const [chatTestResult, setChatTestResult] = useState<{
    text: string;
    responseTime: number;
    model: string;
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  } | null>(null);
  const [chatTestError, setChatTestError] = useState<string | null>(null);

  const [recallQuery, setRecallQuery] = useState("");
  const [candidates, setCandidates] = useState<string[]>(["", ""]);
  const [recallTesting, setRecallTesting] = useState(false);
  const [recallResult, setRecallResult] = useState<{
    query: string;
    responseTime: number;
    dimensions: number;
    results: Array<{
      index: number;
      text: string;
      similarity: number;
    }>;
  } | null>(null);
  const [recallError, setRecallError] = useState<string | null>(null);

  const permissions = user?.permissions || [];
  const canEditSettings = permissions.includes(PERMISSIONS.SYSTEM_SETTINGS) || permissions.includes("*");

  const fetchSettings = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const embeddingParams = new URLSearchParams({
        operatorId: user.id,
        key: "embedding_config",
      });
      const embeddingResponse = await fetch(`/api/settings?${embeddingParams}`);
      const embeddingResult = await embeddingResponse.json();
      
      if (embeddingResult.setting?.value) {
        setEmbeddingConfig({ ...DEFAULT_CONFIG, ...embeddingResult.setting.value });
      }

      const chatParams = new URLSearchParams({
        operatorId: user.id,
        key: "chat_config",
      });
      const chatResponse = await fetch(`/api/settings?${chatParams}`);
      const chatResult = await chatResponse.json();
      
      if (chatResult.setting?.value) {
        setChatConfig({ ...DEFAULT_CHAT_CONFIG, ...chatResult.setting.value });
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
      setChatLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleProviderChange = (provider: EmbeddingConfig["provider"]) => {
    const preset = PROVIDER_PRESETS[provider];
    setEmbeddingConfig(prev => ({
      ...prev,
      provider,
      ...preset,
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          key: "embedding_config",
          value: embeddingConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: "success", text: t("settings.saveSuccess") });
        if (result.setting?.value) {
          setEmbeddingConfig({ ...DEFAULT_CONFIG, ...result.setting.value });
        }
      } else {
        setMessage({ type: "error", text: result.error || t("settings.saveFailed") });
      }
    } catch {
      setMessage({ type: "error", text: t("settings.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!user?.id || !testText.trim()) return;
    
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    
    try {
      const response = await fetch("/api/embeddings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          text: testText.trim(),
          config: embeddingConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setTestResult(result.result);
      } else {
        setTestError(result.error || t("settings.testFailed"));
      }
    } catch {
      setTestError(t("settings.testFailed"));
    } finally {
      setTesting(false);
    }
  };

  const handleChatProviderChange = (provider: ChatProvider) => {
    const preset = CHAT_PROVIDER_PRESETS[provider];
    setChatConfig(prev => ({
      ...prev,
      provider,
      ...preset,
    }));
  };

  const handleChatSave = async () => {
    if (!user?.id) return;
    
    setChatSaving(true);
    setChatMessage(null);
    
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          key: "chat_config",
          value: chatConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setChatMessage({ type: "success", text: t("settings.saveSuccess") });
        if (result.setting?.value) {
          setChatConfig({ ...DEFAULT_CHAT_CONFIG, ...result.setting.value });
        }
      } else {
        setChatMessage({ type: "error", text: result.error || t("settings.saveFailed") });
      }
    } catch {
      setChatMessage({ type: "error", text: t("settings.saveFailed") });
    } finally {
      setChatSaving(false);
    }
  };

  const handleChatTest = async () => {
    if (!user?.id || !testChatMessage.trim()) return;
    
    setChatTesting(true);
    setChatTestResult(null);
    setChatTestError(null);
    
    try {
      const response = await fetch("/api/chat/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          message: testChatMessage.trim(),
          config: chatConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setChatTestResult(result.result);
      } else {
        setChatTestError(result.error || t("settings.chatTestFailed"));
      }
    } catch {
      setChatTestError(t("settings.chatTestFailed"));
    } finally {
      setChatTesting(false);
    }
  };

  const handleRecallTest = async () => {
    const validCandidates = candidates.filter(c => c.trim());
    if (!user?.id || !recallQuery.trim() || validCandidates.length === 0) return;
    
    setRecallTesting(true);
    setRecallResult(null);
    setRecallError(null);
    
    try {
      const response = await fetch("/api/embeddings/recall-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          query: recallQuery.trim(),
          candidates: validCandidates,
          config: embeddingConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setRecallResult(result.result);
      } else {
        setRecallError(result.error || t("settings.recallTestFailed"));
      }
    } catch {
      setRecallError(t("settings.recallTestFailed"));
    } finally {
      setRecallTesting(false);
    }
  };

  const handleAddCandidate = () => {
    if (candidates.length < 20) {
      setCandidates([...candidates, ""]);
    }
  };

  const handleRemoveCandidate = (index: number) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter((_, i) => i !== index));
    }
  };

  const handleCandidateChange = (index: number, value: string) => {
    const newCandidates = [...candidates];
    newCandidates[index] = value;
    setCandidates(newCandidates);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-mono text-lg font-medium uppercase tracking-wider">
          {t("settings.title")}
        </h1>
      </div>

      <div className="max-w-2xl space-y-8">
        <div className="border border-border p-6">
          <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted">
            {t("settings.language")}
          </h2>
          <div className="flex gap-3">
            <OptionButton
              selected={locale === "zh"}
              onClick={() => setLocale("zh")}
              label="中文"
            />
            <OptionButton
              selected={locale === "en"}
              onClick={() => setLocale("en")}
              label="English"
            />
          </div>
        </div>

        <div className="border border-border p-6">
          <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted">
            {t("settings.theme")}
          </h2>
          <div className="flex gap-3">
            <OptionButton
              selected={theme === "light"}
              onClick={() => setTheme("light")}
              label={t("settings.themeLight")}
              icon={<SunIcon />}
            />
            <OptionButton
              selected={theme === "dark"}
              onClick={() => setTheme("dark")}
              label={t("settings.themeDark")}
              icon={<MoonIcon />}
            />
          </div>
        </div>

        {canEditSettings && (
          <div className="border border-border p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted">
              {t("settings.embeddingModel")}
            </h2>
            
            {loading ? (
              <div className="py-8 text-center text-muted">{t("common.loading")}</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block font-mono text-xs text-muted">
                    {t("settings.provider")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(["openai", "azure", "aliyun", "local"] as const).map((p) => (
                      <OptionButton
                        key={p}
                        selected={embeddingConfig.provider === p}
                        onClick={() => handleProviderChange(p)}
                        label={t(`settings.provider_${p}`)}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.baseUrl")}
                    </label>
                    <Input
                      value={embeddingConfig.baseUrl}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.apiKey")}
                    </label>
                    <Input
                      type="password"
                      value={embeddingConfig.apiKey}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder={t("settings.apiKeyPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.modelName")}
                    </label>
                    <Input
                      value={embeddingConfig.model}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, model: e.target.value }))}
                      placeholder="text-embedding-3-small"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.dimensions")}
                    </label>
                    <Input
                      type="number"
                      value={embeddingConfig.dimensions}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, dimensions: parseInt(e.target.value) || 1536 }))}
                      min={64}
                      max={4096}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.batchSize")}
                    </label>
                    <Input
                      type="number"
                      value={embeddingConfig.batchSize}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) || 100 }))}
                      min={1}
                      max={2048}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chunkSize")}
                    </label>
                    <Input
                      type="number"
                      value={embeddingConfig.chunkSize}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, chunkSize: parseInt(e.target.value) || 400 }))}
                      min={64}
                      max={8192}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chunkOverlap")}
                    </label>
                    <Input
                      type="number"
                      value={embeddingConfig.chunkOverlap}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, chunkOverlap: parseInt(e.target.value) || 60 }))}
                      min={0}
                      max={1024}
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block font-mono text-xs text-foreground">
                        {t("settings.contextualRetrieval")}
                      </label>
                      <p className="mt-1 font-mono text-[10px] text-muted">
                        {t("settings.contextualRetrievalDesc")}
                      </p>
                    </div>
                    <button
                      onClick={() => setEmbeddingConfig(prev => ({ ...prev, contextEnabled: !prev.contextEnabled }))}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        embeddingConfig.contextEnabled ? "bg-green-500" : "bg-muted/30"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          embeddingConfig.contextEnabled ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  {embeddingConfig.contextEnabled && (
                    <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                        {t("settings.contextualRetrievalNote")}
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-6">
                  <label className="mb-2 block font-mono text-xs text-muted">
                    {t("settings.testText")}
                  </label>
                  <div className="flex gap-3">
                    <Input
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      placeholder={t("settings.testTextPlaceholder")}
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleTest} 
                      disabled={testing || !testText.trim()}
                      variant="secondary"
                    >
                      {testing ? t("settings.testing") : t("settings.testEmbedding")}
                    </Button>
                  </div>
                  
                  {testError && (
                    <div className="mt-3 font-mono text-xs text-red-500">
                      {testError}
                    </div>
                  )}
                  
                  {testResult && (
                    <div className="mt-4 space-y-3 rounded border border-green-500/30 bg-green-500/5 p-4">
                      <div className="font-mono text-xs text-green-500">
                        {t("settings.testSuccess")}
                      </div>
                      <div className="grid gap-2 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted">{t("settings.vectorDimensions")}:</span>
                          <span>{testResult.dimensions}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">{t("settings.responseTime")}:</span>
                          <span>{testResult.responseTime}ms</span>
                        </div>
                        <div>
                          <span className="text-muted">{t("settings.vectorPreview")}:</span>
                          <div className="mt-1 break-all rounded bg-background p-2 text-[10px]">
                            [{testResult.vectorPreview.map(v => v.toFixed(6)).join(", ")}...]
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-6">
                  <div className="mb-4">
                    <label className="mb-1 block font-mono text-xs text-muted">
                      {t("settings.recallTest")}
                    </label>
                    <p className="font-mono text-[10px] text-muted/70">
                      {t("settings.recallTestDesc")}
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block font-mono text-xs text-muted">
                        {t("settings.recallQuery")}
                      </label>
                      <Input
                        value={recallQuery}
                        onChange={(e) => setRecallQuery(e.target.value)}
                        placeholder={t("settings.recallQueryPlaceholder")}
                      />
                    </div>
                    
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="font-mono text-xs text-muted">
                          {t("settings.candidateTexts")}
                        </label>
                        <Button
                          onClick={handleAddCandidate}
                          variant="ghost"
                          disabled={candidates.length >= 20}
                          className="h-6 px-2 text-[10px]"
                        >
                          + {t("settings.addCandidate")}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {candidates.map((candidate, index) => (
                          <div key={index} className="flex gap-2">
                            <div className="flex h-10 w-6 shrink-0 items-center justify-center font-mono text-[10px] text-muted">
                              {index + 1}
                            </div>
                            <Input
                              value={candidate}
                              onChange={(e) => handleCandidateChange(index, e.target.value)}
                              placeholder={t("settings.candidatePlaceholder")}
                              className="flex-1"
                            />
                            <Button
                              onClick={() => handleRemoveCandidate(index)}
                              variant="ghost"
                              disabled={candidates.length <= 1}
                              className="h-10 w-10 shrink-0 p-0 text-muted hover:text-red-500"
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex justify-end">
                      <Button 
                        onClick={handleRecallTest} 
                        disabled={recallTesting || !recallQuery.trim() || candidates.filter(c => c.trim()).length === 0}
                        variant="secondary"
                      >
                        {recallTesting ? t("settings.recallTesting") : t("settings.testRecall")}
                      </Button>
                    </div>
                    
                    {recallError && (
                      <div className="font-mono text-xs text-red-500">
                        {recallError}
                      </div>
                    )}
                    
                    {recallResult && (
                      <div className="space-y-3 rounded border border-green-500/30 bg-green-500/5 p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-green-500">
                            {t("settings.recallTestSuccess")}
                          </span>
                          <span className="font-mono text-[10px] text-muted">
                            {recallResult.responseTime}ms · {recallResult.dimensions} dims
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {recallResult.results.map((item, index) => (
                            <div key={index} className="flex items-start gap-3 rounded border border-border bg-background p-3">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/20 font-mono text-[10px] font-medium">
                                {index + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="break-words font-mono text-xs">
                                  {item.text}
                                </div>
                              </div>
                              <div className="shrink-0 rounded bg-green-500/20 px-2 py-0.5 font-mono text-[10px] text-green-500">
                                {item.similarity.toFixed(1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {message && (
                  <div className={`font-mono text-xs ${message.type === "success" ? "text-green-500" : "text-red-500"}`}>
                    {message.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {canEditSettings && (
          <div className="border border-border p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted">
              {t("settings.chatModelConfig")}
            </h2>
            
            {chatLoading ? (
              <div className="py-8 text-center text-muted">{t("common.loading")}</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block font-mono text-xs text-muted">
                    {t("settings.chatProvider")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(["openai", "anthropic", "openai-compatible"] as const).map((p) => (
                      <OptionButton
                        key={p}
                        selected={chatConfig.provider === p}
                        onClick={() => handleChatProviderChange(p)}
                        label={t(`settings.chatProvider_${p}`)}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chatBaseUrl")}
                    </label>
                    <Input
                      value={chatConfig.baseUrl}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chatApiKey")}
                    </label>
                    <Input
                      type="password"
                      value={chatConfig.apiKey}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder={t("settings.apiKeyPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chatModelName")}
                    </label>
                    <Input
                      value={chatConfig.model}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, model: e.target.value }))}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chatMaxTokens")}
                    </label>
                    <Input
                      type="number"
                      value={chatConfig.maxTokens}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 2048 }))}
                      min={1}
                      max={128000}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted">
                      {t("settings.chatTemperature")}
                    </label>
                    <Input
                      type="number"
                      value={chatConfig.temperature}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) || 0.7 }))}
                      min={0}
                      max={2}
                      step={0.1}
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <label className="mb-2 block font-mono text-xs text-muted">
                    {t("settings.testMessage")}
                  </label>
                  <div className="flex gap-3">
                    <Input
                      value={testChatMessage}
                      onChange={(e) => setTestChatMessage(e.target.value)}
                      placeholder={t("settings.testMessagePlaceholder")}
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleChatTest} 
                      disabled={chatTesting || !testChatMessage.trim()}
                      variant="secondary"
                    >
                      {chatTesting ? t("settings.testChatting") : t("settings.testChat")}
                    </Button>
                  </div>
                  
                  {chatTestError && (
                    <div className="mt-3 font-mono text-xs text-red-500">
                      {chatTestError}
                    </div>
                  )}
                  
                  {chatTestResult && (
                    <div className="mt-4 space-y-3 rounded border border-green-500/30 bg-green-500/5 p-4">
                      <div className="font-mono text-xs text-green-500">
                        {t("settings.chatTestSuccess")}
                      </div>
                      <div className="space-y-2 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted">{t("settings.chatResponseTime")}:</span>
                          <span>{chatTestResult.responseTime}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">{t("settings.chatTokenUsage")}:</span>
                          <span>
                            {t("settings.inputTokens")}: {chatTestResult.usage.inputTokens ?? "-"} / {t("settings.outputTokens")}: {chatTestResult.usage.outputTokens ?? "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted">{t("settings.chatResponse")}:</span>
                          <div className="mt-1 whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
                            {chatTestResult.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {chatMessage && (
                  <div className={`font-mono text-xs ${chatMessage.type === "success" ? "text-green-500" : "text-red-500"}`}>
                    {chatMessage.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleChatSave} disabled={chatSaving}>
                    {chatSaving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface OptionButtonProps {
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly label: string;
  readonly icon?: React.ReactNode;
}

function OptionButton({ selected, onClick, label, icon }: OptionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 items-center gap-2 border px-4 font-mono text-xs uppercase tracking-wider transition-colors ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted hover:border-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
