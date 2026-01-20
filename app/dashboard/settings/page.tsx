"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth-context";
import { Button, Input } from "@/components/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_PROMPTS, type PromptConfig } from "@/lib/supabase/types";

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

type RerankerProvider = "cohere" | "jina" | "voyage" | "aliyun" | "openai-compatible" | "none";
type RerankerResponseFormat = "cohere" | "jina" | "voyage" | "aliyun" | "auto";

interface RerankerConfig {
  provider: RerankerProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
  responseFormat: RerankerResponseFormat;
}

interface RerankerQualityConfig {
  enabled: boolean;
  minResults: number;
  maxResults: number;
  scoreThreshold: number;
  dropoffThreshold: number;
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

const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  provider: "none",
  apiKey: "",
  model: "",
  baseUrl: "",
  enabled: false,
  responseFormat: "auto",
};

const DEFAULT_QUALITY_CONFIG: RerankerQualityConfig = {
  enabled: true,
  minResults: 1,
  maxResults: 10,
  scoreThreshold: 0.6,
  dropoffThreshold: 0.15,
};

const RERANKER_PROVIDER_PRESETS: Record<RerankerProvider, Partial<RerankerConfig>> = {
  cohere: {
    baseUrl: "https://api.cohere.ai/v1/rerank",
    model: "rerank-english-v3.0",
    responseFormat: "cohere",
  },
  jina: {
    baseUrl: "https://api.jina.ai/v1/rerank",
    model: "jina-reranker-v2-base-multilingual",
    responseFormat: "jina",
  },
  voyage: {
    baseUrl: "https://api.voyageai.com/v1/rerank",
    model: "rerank-2",
    responseFormat: "voyage",
  },
  aliyun: {
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    model: "gte-rerank-v2",
    responseFormat: "aliyun",
  },
  "openai-compatible": {
    baseUrl: "",
    model: "",
    responseFormat: "auto",
  },
  none: {
    baseUrl: "",
    model: "",
    responseFormat: "auto",
  },
};

// PromptConfig imported from @/lib/supabase/types

// Configuration export format
interface ExportedConfig {
  version: string;
  exportedAt: string;
  includesApiKeys: boolean;
  embedding?: EmbeddingConfig;
  chat?: ChatConfig;
  reranker?: RerankerConfig;
  quality?: RerankerQualityConfig;
  prompts?: PromptConfig;
}

// Validation functions for imported config
function validateEmbeddingConfig(config: unknown): config is Partial<EmbeddingConfig> {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  
  // Check critical fields have correct types if present
  if (c.provider !== undefined && !["openai", "azure", "local", "aliyun"].includes(c.provider as string)) return false;
  if (c.baseUrl !== undefined && typeof c.baseUrl !== "string") return false;
  if (c.apiKey !== undefined && typeof c.apiKey !== "string") return false;
  if (c.model !== undefined && typeof c.model !== "string") return false;
  if (c.dimensions !== undefined && typeof c.dimensions !== "number") return false;
  if (c.batchSize !== undefined && typeof c.batchSize !== "number") return false;
  if (c.chunkSize !== undefined && typeof c.chunkSize !== "number") return false;
  if (c.chunkOverlap !== undefined && typeof c.chunkOverlap !== "number") return false;
  if (c.contextEnabled !== undefined && typeof c.contextEnabled !== "boolean") return false;
  
  return true;
}

function validateChatConfig(config: unknown): config is Partial<ChatConfig> {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  
  if (c.provider !== undefined && !["openai", "anthropic", "openai-compatible"].includes(c.provider as string)) return false;
  if (c.baseUrl !== undefined && typeof c.baseUrl !== "string") return false;
  if (c.apiKey !== undefined && typeof c.apiKey !== "string") return false;
  if (c.model !== undefined && typeof c.model !== "string") return false;
  if (c.maxTokens !== undefined && typeof c.maxTokens !== "number") return false;
  if (c.temperature !== undefined && typeof c.temperature !== "number") return false;
  
  return true;
}

function validateRerankerConfig(config: unknown): config is Partial<RerankerConfig> {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  
  if (c.provider !== undefined && !["cohere", "jina", "voyage", "aliyun", "openai-compatible", "none"].includes(c.provider as string)) return false;
  if (c.apiKey !== undefined && typeof c.apiKey !== "string") return false;
  if (c.model !== undefined && typeof c.model !== "string") return false;
  if (c.baseUrl !== undefined && typeof c.baseUrl !== "string") return false;
  if (c.enabled !== undefined && typeof c.enabled !== "boolean") return false;
  if (c.responseFormat !== undefined && !["cohere", "jina", "voyage", "aliyun", "auto"].includes(c.responseFormat as string)) return false;
  
  return true;
}

function validateQualityConfig(config: unknown): config is Partial<RerankerQualityConfig> {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  
  if (c.enabled !== undefined && typeof c.enabled !== "boolean") return false;
  if (c.minResults !== undefined && typeof c.minResults !== "number") return false;
  if (c.maxResults !== undefined && typeof c.maxResults !== "number") return false;
  if (c.scoreThreshold !== undefined && typeof c.scoreThreshold !== "number") return false;
  if (c.dropoffThreshold !== undefined && typeof c.dropoffThreshold !== "number") return false;
  
  return true;
}

function validatePromptConfig(config: unknown): config is Partial<PromptConfig> {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  
  if (c.chatWithContext !== undefined && typeof c.chatWithContext !== "string") return false;
  if (c.chatNoContext !== undefined && typeof c.chatNoContext !== "string") return false;
  if (c.docQA !== undefined && typeof c.docQA !== "string") return false;
  
  return true;
}

function validateExportedConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (typeof config !== "object" || config === null) {
    return { valid: false, errors: ["Invalid config format"] };
  }
  
  const c = config as Record<string, unknown>;
  
  if (c.embedding !== undefined && !validateEmbeddingConfig(c.embedding)) {
    errors.push("Invalid embedding configuration");
  }
  if (c.chat !== undefined && !validateChatConfig(c.chat)) {
    errors.push("Invalid chat configuration");
  }
  if (c.reranker !== undefined && !validateRerankerConfig(c.reranker)) {
    errors.push("Invalid reranker configuration");
  }
  if (c.quality !== undefined && !validateQualityConfig(c.quality)) {
    errors.push("Invalid quality configuration");
  }
  if (c.prompts !== undefined && !validatePromptConfig(c.prompts)) {
    errors.push("Invalid prompt configuration");
  }
  
  return { valid: errors.length === 0, errors };
}

// DEFAULT_PROMPTS imported from @/lib/supabase/types

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

  const [rerankerConfig, setRerankerConfig] = useState<RerankerConfig>(DEFAULT_RERANKER_CONFIG);
  const [rerankerLoading, setRerankerLoading] = useState(true);
  const [rerankerSaving, setRerankerSaving] = useState(false);
  const [rerankerMessage, setRerankerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [rerankerTestQuery, setRerankerTestQuery] = useState("");
  const [rerankerTestDocs, setRerankerTestDocs] = useState<string[]>(["", ""]);
  const [rerankerTesting, setRerankerTesting] = useState(false);
  const [rerankerTestResult, setRerankerTestResult] = useState<{
    responseTime: number;
    results: Array<{
      originalIndex: number;
      newRank: number;
      score: number;
      document: string;
    }>;
    detectedFormat: string;
    formatConfidence: string;
    formatReason: string;
  } | null>(null);
   const [rerankerTestError, setRerankerTestError] = useState<{ message: string; details?: Record<string, unknown> } | null>(null);

   const [qualityConfig, setQualityConfig] = useState<RerankerQualityConfig>(DEFAULT_QUALITY_CONFIG);
   const [qualityLoading, setQualityLoading] = useState(true);
   const [qualitySaving, setQualitySaving] = useState(false);
   const [qualityMessage, setQualityMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

   const [promptConfig, setPromptConfig] = useState<PromptConfig>(DEFAULT_PROMPTS);
   const [promptLoading, setPromptLoading] = useState(true);
   const [promptSaving, setPromptSaving] = useState(false);
   const [promptMessage, setPromptMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

   // Import/Export states
   const [includeApiKeys, setIncludeApiKeys] = useState(false);
   const [exporting, setExporting] = useState(false);
   const [importing, setImporting] = useState(false);
   const [importPreview, setImportPreview] = useState<ExportedConfig | null>(null);
   const [importExportMessage, setImportExportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const permissions = user?.permissions || [];
  const canEditSettings = permissions.includes(PERMISSIONS.SYSTEM_SETTINGS) || permissions.includes("*");

   const fetchSettings = useCallback(async () => {
     if (!user?.id) {
       setLoading(false);
       setChatLoading(false);
       setRerankerLoading(false);
       setQualityLoading(false);
       setPromptLoading(false);
       return;
     }
    
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

      const rerankerParams = new URLSearchParams({
        operatorId: user.id,
        key: "reranker_config",
      });
      const rerankerResponse = await fetch(`/api/settings?${rerankerParams}`);
      const rerankerResult = await rerankerResponse.json();
      
       if (rerankerResult.setting?.value) {
         setRerankerConfig({ ...DEFAULT_RERANKER_CONFIG, ...rerankerResult.setting.value });
       }

       const qualityParams = new URLSearchParams({
         operatorId: user.id,
         key: "reranker_quality_config",
       });
       const qualityResponse = await fetch(`/api/settings?${qualityParams}`);
       const qualityResult = await qualityResponse.json();
       
       if (qualityResult.setting?.value) {
         setQualityConfig({ ...DEFAULT_QUALITY_CONFIG, ...qualityResult.setting.value });
       }

       const promptParams = new URLSearchParams({
         operatorId: user.id,
         key: "prompt_config",
       });
       const promptResponse = await fetch(`/api/settings?${promptParams}`);
       const promptResult = await promptResponse.json();
       
       if (promptResult.setting?.value) {
         setPromptConfig({ ...DEFAULT_PROMPTS, ...promptResult.setting.value });
       }
     } catch (error) {
       console.error("Failed to fetch settings:", error);
     } finally {
       setLoading(false);
       setChatLoading(false);
       setQualityLoading(false);
       setPromptLoading(false);
       setRerankerLoading(false);
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

  const handleRerankerProviderChange = (provider: RerankerProvider) => {
    const preset = RERANKER_PROVIDER_PRESETS[provider];
    setRerankerConfig(prev => ({
      ...prev,
      provider,
      ...preset,
      enabled: provider !== "none",
    }));
  };

  const handleRerankerSave = async () => {
    if (!user?.id) return;
    
    setRerankerSaving(true);
    setRerankerMessage(null);
    
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          key: "reranker_config",
          value: rerankerConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setRerankerMessage({ type: "success", text: t("settings.saveSuccess") });
        if (result.setting?.value) {
          setRerankerConfig({ ...DEFAULT_RERANKER_CONFIG, ...result.setting.value });
        }
      } else {
        setRerankerMessage({ type: "error", text: result.error || t("settings.saveFailed") });
      }
    } catch {
      setRerankerMessage({ type: "error", text: t("settings.saveFailed") });
    } finally {
      setRerankerSaving(false);
    }
  };

  const handleRerankerTest = async () => {
    const validDocs = rerankerTestDocs.filter(d => d.trim());
    if (!user?.id || !rerankerTestQuery.trim() || validDocs.length === 0) return;
    
    setRerankerTesting(true);
    setRerankerTestResult(null);
    setRerankerTestError(null);
    
    try {
      const response = await fetch("/api/reranker/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          query: rerankerTestQuery.trim(),
          documents: validDocs,
          config: {
            provider: rerankerConfig.provider,
            baseUrl: rerankerConfig.baseUrl,
            apiKey: rerankerConfig.apiKey,
            model: rerankerConfig.model,
            responseFormat: rerankerConfig.responseFormat,
          },
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setRerankerTestResult(result.result);
      } else {
        setRerankerTestError({ 
          message: result.error || t("settings.rerankerTestFailed"),
          details: result.details,
        });
      }
    } catch {
      setRerankerTestError({ message: t("settings.rerankerTestFailed") });
    } finally {
      setRerankerTesting(false);
    }
  };

  const handleAddRerankerTestDoc = () => {
    if (rerankerTestDocs.length < 10) {
      setRerankerTestDocs([...rerankerTestDocs, ""]);
    }
  };

  const handleRemoveRerankerTestDoc = (index: number) => {
    if (rerankerTestDocs.length > 1) {
      setRerankerTestDocs(rerankerTestDocs.filter((_, i) => i !== index));
    }
  };

  const handleRerankerTestDocChange = (index: number, value: string) => {
    const newDocs = [...rerankerTestDocs];
    newDocs[index] = value;
    setRerankerTestDocs(newDocs);
  };

   const applyDetectedFormat = () => {
     if (rerankerTestResult?.detectedFormat) {
       setRerankerConfig(prev => ({
         ...prev,
         responseFormat: rerankerTestResult.detectedFormat as RerankerResponseFormat,
       }));
     }
   };

   const handleQualitySave = async () => {
     if (!user?.id) return;
     
     setQualitySaving(true);
     setQualityMessage(null);
     
     try {
       const response = await fetch("/api/settings", {
         method: "PATCH",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           operatorId: user.id,
           key: "reranker_quality_config",
           value: qualityConfig,
         }),
       });
       
       const result = await response.json();
       
       if (result.success) {
         setQualityMessage({ type: "success", text: t("settings.saveSuccess") });
         if (result.setting?.value) {
           setQualityConfig({ ...DEFAULT_QUALITY_CONFIG, ...result.setting.value });
         }
       } else {
         setQualityMessage({ type: "error", text: result.error || t("settings.saveFailed") });
       }
     } catch {
       setQualityMessage({ type: "error", text: t("settings.saveFailed") });
     } finally {
       setQualitySaving(false);
     }
   };

   const handlePromptSave = async () => {
    if (!user?.id) return;
    
    setPromptSaving(true);
    setPromptMessage(null);
    
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          key: "prompt_config",
          value: promptConfig,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPromptMessage({ type: "success", text: t("settings.promptSaveSuccess") });
        if (result.setting?.value) {
          setPromptConfig({ ...DEFAULT_PROMPTS, ...result.setting.value });
        }
      } else {
        setPromptMessage({ type: "error", text: result.error || t("settings.promptSaveFailed") });
      }
    } catch {
      setPromptMessage({ type: "error", text: t("settings.promptSaveFailed") });
    } finally {
      setPromptSaving(false);
    }
  };

  const handlePromptReset = (key: keyof PromptConfig) => {
    setPromptConfig(prev => ({
      ...prev,
      [key]: DEFAULT_PROMPTS[key],
    }));
    setPromptMessage({ type: "success", text: t("settings.promptResetSuccess") });
  };

  // Export configuration handler
  const handleExportConfig = useCallback(async () => {
    if (!user?.id) return;
    
    setExporting(true);
    setImportExportMessage(null);

    try {
      // Fetch real configuration from server (including API keys if requested)
      const response = await fetch("/api/settings/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: user.id,
          includeApiKeys: includeApiKeys,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Export failed");
      }

      const exportData = result.config;

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `axondoc-config-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setImportExportMessage({ type: "success", text: t("settings.exportSuccess") });
    } catch {
      setImportExportMessage({ type: "error", text: t("settings.exportFailed") });
    } finally {
      setExporting(false);
    }
  }, [user?.id, includeApiKeys, t]);

  // Handle file selection for import
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as ExportedConfig;
        
        // Validate the config format
        if (!parsed.version || !parsed.exportedAt) {
          setImportExportMessage({ type: "error", text: t("settings.invalidConfigFile") });
          return;
        }
        
        // Validate config structure and field types
        const validation = validateExportedConfig(parsed);
        if (!validation.valid) {
          console.error("Config validation errors:", validation.errors);
          setImportExportMessage({ type: "error", text: t("settings.invalidConfigFile") });
          return;
        }
        
        setImportPreview(parsed);
        setImportExportMessage(null);
      } catch {
        setImportExportMessage({ type: "error", text: t("settings.invalidConfigFile") });
      }
    };
    reader.readAsText(file);
    
    // Reset the input so the same file can be selected again
    event.target.value = "";
  }, [t]);

  // Apply imported configuration
  const handleApplyImport = useCallback(async () => {
    if (!importPreview || !user?.id) return;
    
    setImporting(true);
    setImportExportMessage(null);

    try {
      const savePromises: Promise<Response>[] = [];

      // Apply embedding config
      if (importPreview.embedding) {
        const newEmbeddingConfig = {
          ...embeddingConfig,
          ...importPreview.embedding,
          // Don't overwrite API key if import doesn't include real keys
          apiKey: importPreview.includesApiKeys ? importPreview.embedding.apiKey : embeddingConfig.apiKey,
        };
        setEmbeddingConfig(newEmbeddingConfig);
        savePromises.push(
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operatorId: user.id,
              key: "embedding_config",
              value: newEmbeddingConfig,
            }),
          })
        );
      }

      // Apply chat config
      if (importPreview.chat) {
        const newChatConfig = {
          ...chatConfig,
          ...importPreview.chat,
          apiKey: importPreview.includesApiKeys ? importPreview.chat.apiKey : chatConfig.apiKey,
        };
        setChatConfig(newChatConfig);
        savePromises.push(
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operatorId: user.id,
              key: "chat_config",
              value: newChatConfig,
            }),
          })
        );
      }

      // Apply reranker config
      if (importPreview.reranker) {
        const newRerankerConfig = {
          ...rerankerConfig,
          ...importPreview.reranker,
          apiKey: importPreview.includesApiKeys ? importPreview.reranker.apiKey : rerankerConfig.apiKey,
        };
        setRerankerConfig(newRerankerConfig);
        savePromises.push(
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operatorId: user.id,
              key: "reranker_config",
              value: newRerankerConfig,
            }),
          })
        );
      }

      // Apply quality config
      if (importPreview.quality) {
        setQualityConfig({ ...qualityConfig, ...importPreview.quality });
        savePromises.push(
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operatorId: user.id,
              key: "reranker_quality_config",
              value: { ...qualityConfig, ...importPreview.quality },
            }),
          })
        );
      }

      // Apply prompt config
      if (importPreview.prompts) {
        setPromptConfig({ ...promptConfig, ...importPreview.prompts });
        savePromises.push(
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operatorId: user.id,
              key: "prompt_config",
              value: { ...promptConfig, ...importPreview.prompts },
            }),
          })
        );
      }

      const responses = await Promise.all(savePromises);
      
      // Check if any save request failed
      const failedResponses = responses.filter(r => !r.ok);
      if (failedResponses.length > 0) {
        // Try to get error details from failed responses
        const errorDetails = await Promise.all(
          failedResponses.map(async (r) => {
            try {
              const json = await r.json();
              return json.error || `HTTP ${r.status}`;
            } catch {
              return `HTTP ${r.status}`;
            }
          })
        );
        throw new Error(`Failed to save some settings: ${errorDetails.join(", ")}`);
      }
      
      setImportExportMessage({ type: "success", text: t("settings.importSuccess") });
      setImportPreview(null);
    } catch (error) {
      console.error("Import failed:", error);
      setImportExportMessage({ type: "error", text: t("settings.importFailed") });
    } finally {
      setImporting(false);
    }
  }, [importPreview, user?.id, embeddingConfig, chatConfig, rerankerConfig, qualityConfig, promptConfig, t]);

  // Cancel import
  const handleCancelImport = useCallback(() => {
    setImportPreview(null);
    setImportExportMessage(null);
  }, []);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="font-mono text-base md:text-lg font-medium uppercase tracking-wider">
          {t("settings.title")}
        </h1>
      </div>

      <div className="max-w-2xl space-y-6 md:space-y-8">
        <div className="border border-border p-4 md:p-6">
          <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
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

        <div className="border border-border p-4 md:p-6">
          <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
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
          <div className="border border-border p-4 md:p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("settings.embeddingModel")}
            </h2>
            
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
                      {t("settings.baseUrl")}
                    </label>
                    <Input
                      value={embeddingConfig.baseUrl}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
                      {t("settings.modelName")}
                    </label>
                    <Input
                      value={embeddingConfig.model}
                      onChange={(e) => setEmbeddingConfig(prev => ({ ...prev, model: e.target.value }))}
                      placeholder="text-embedding-3-small"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
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
                  <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                          <span className="text-muted-foreground">{t("settings.vectorDimensions")}:</span>
                          <span>{testResult.dimensions}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("settings.responseTime")}:</span>
                          <span>{testResult.responseTime}ms</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("settings.vectorPreview")}:</span>
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
                    <label className="mb-1 block font-mono text-xs text-muted-foreground">
                      {t("settings.recallTest")}
                    </label>
                    <p className="font-mono text-[10px] text-muted-foreground/70">
                      {t("settings.recallTestDesc")}
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                        <label className="font-mono text-xs text-muted-foreground">
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
                            <div className="flex h-10 w-6 shrink-0 items-center justify-center font-mono text-[10px] text-muted-foreground">
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
                              className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-red-500"
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
                          <span className="font-mono text-[10px] text-muted-foreground">
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
          <div className="border border-border p-4 md:p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("settings.chatModelConfig")}
            </h2>
            
            {chatLoading ? (
              <div className="py-8 text-center text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
                      {t("settings.chatBaseUrl")}
                    </label>
                    <Input
                      value={chatConfig.baseUrl}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
                      {t("settings.chatModelName")}
                    </label>
                    <Input
                      value={chatConfig.model}
                      onChange={(e) => setChatConfig(prev => ({ ...prev, model: e.target.value }))}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                    <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                  <label className="mb-2 block font-mono text-xs text-muted-foreground">
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
                          <span className="text-muted-foreground">{t("settings.chatResponseTime")}:</span>
                          <span>{chatTestResult.responseTime}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("settings.chatTokenUsage")}:</span>
                          <span>
                            {t("settings.inputTokens")}: {chatTestResult.usage.inputTokens ?? "-"} / {t("settings.outputTokens")}: {chatTestResult.usage.outputTokens ?? "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("settings.chatResponse")}:</span>
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

        {canEditSettings && (
          <div className="border border-border p-4 md:p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("settings.rerankerConfig")}
            </h2>
            
            {rerankerLoading ? (
              <div className="py-8 text-center text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-mono text-xs text-foreground">
                      {t("settings.rerankerEnabled")}
                    </label>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t("settings.rerankerEnabledDesc")}
                    </p>
                  </div>
                  <button
                    onClick={() => setRerankerConfig(prev => ({ 
                      ...prev, 
                      enabled: !prev.enabled,
                      provider: !prev.enabled && prev.provider === "none" ? "cohere" : prev.provider
                    }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      rerankerConfig.enabled ? "bg-green-500" : "bg-muted/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        rerankerConfig.enabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {rerankerConfig.enabled && (
                  <>
                    <div>
                      <label className="mb-2 block font-mono text-xs text-muted-foreground">
                        {t("settings.rerankerProvider")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(["cohere", "jina", "voyage", "aliyun", "openai-compatible"] as const).map((p) => (
                          <OptionButton
                            key={p}
                            selected={rerankerConfig.provider === p}
                            onClick={() => handleRerankerProviderChange(p)}
                            label={t(`settings.rerankerProvider_${p}`)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.rerankerBaseUrl")}
                        </label>
                        <Input
                          value={rerankerConfig.baseUrl}
                          onChange={(e) => setRerankerConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                          placeholder="https://api.cohere.ai/v1/rerank"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.rerankerApiKey")}
                        </label>
                        <Input
                          type="password"
                          value={rerankerConfig.apiKey}
                          onChange={(e) => setRerankerConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder={t("settings.apiKeyPlaceholder")}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.rerankerModel")}
                        </label>
                        <Input
                          value={rerankerConfig.model}
                          onChange={(e) => setRerankerConfig(prev => ({ ...prev, model: e.target.value }))}
                          placeholder="rerank-english-v3.0"
                        />
                      </div>
                      {rerankerConfig.provider === "openai-compatible" && (
                        <div>
                          <label className="mb-2 block font-mono text-xs text-muted-foreground">
                            {t("settings.rerankerResponseFormat")}
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {(["auto", "cohere", "jina", "voyage", "aliyun"] as const).map((f) => (
                              <OptionButton
                                key={f}
                                selected={rerankerConfig.responseFormat === f}
                                onClick={() => setRerankerConfig(prev => ({ ...prev, responseFormat: f }))}
                                label={t(`settings.rerankerResponseFormat_${f}`)}
                              />
                            ))}
                          </div>
                          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                            {t("settings.rerankerResponseFormatDesc")}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border pt-6">
                      <div className="mb-4">
                        <label className="mb-1 block font-mono text-xs text-muted-foreground">
                          {t("settings.testReranker")}
                        </label>
                        <p className="font-mono text-[10px] text-muted-foreground/70">
                          {t("settings.rerankerTestDesc")}
                        </p>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="mb-2 block font-mono text-xs text-muted-foreground">
                            {t("settings.rerankerTestQuery")}
                          </label>
                          <Input
                            value={rerankerTestQuery}
                            onChange={(e) => setRerankerTestQuery(e.target.value)}
                            placeholder={t("settings.rerankerTestQueryPlaceholder")}
                          />
                        </div>
                        
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="font-mono text-xs text-muted-foreground">
                              {t("settings.rerankerTestDocument")}
                            </label>
                            <Button
                              onClick={handleAddRerankerTestDoc}
                              variant="ghost"
                              disabled={rerankerTestDocs.length >= 10}
                              className="h-6 px-2 text-[10px]"
                            >
                              + {t("settings.addCandidate")}
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {rerankerTestDocs.map((doc, index) => (
                              <div key={index} className="flex gap-2">
                                <div className="flex h-10 w-6 shrink-0 items-center justify-center font-mono text-[10px] text-muted-foreground">
                                  {index + 1}
                                </div>
                                <Input
                                  value={doc}
                                  onChange={(e) => handleRerankerTestDocChange(index, e.target.value)}
                                  placeholder={t("settings.rerankerTestDocPlaceholder")}
                                  className="flex-1"
                                />
                                <Button
                                  onClick={() => handleRemoveRerankerTestDoc(index)}
                                  variant="ghost"
                                  disabled={rerankerTestDocs.length <= 1}
                                  className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-red-500"
                                >
                                  ×
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex justify-end">
                          <Button 
                            onClick={handleRerankerTest} 
                            disabled={rerankerTesting || !rerankerTestQuery.trim() || rerankerTestDocs.filter(d => d.trim()).length === 0}
                            variant="secondary"
                          >
                            {rerankerTesting ? t("settings.rerankerTesting") : t("settings.testReranker")}
                          </Button>
                        </div>
                        
                        {rerankerTestError && (
                          <div className="space-y-2 rounded border border-red-500/30 bg-red-500/5 p-3">
                            <div className="font-mono text-xs text-red-500">
                              {rerankerTestError.message}
                            </div>
                            {rerankerTestError.details && (
                              <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                                {"url" in rerankerTestError.details && (
                                  <div>URL: {rerankerTestError.details.url as string}</div>
                                )}
                                {"model" in rerankerTestError.details && (
                                  <div>Model: {rerankerTestError.details.model as string}</div>
                                )}
                                {"provider" in rerankerTestError.details && (
                                  <div>Provider: {rerankerTestError.details.provider as string}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {rerankerTestResult && (
                          <div className="space-y-3 rounded border border-green-500/30 bg-green-500/5 p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-green-500">
                                {t("settings.rerankerTestSuccess")}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {rerankerTestResult.responseTime}ms
                              </span>
                            </div>
                            
                            {rerankerConfig.provider === "openai-compatible" && (
                              <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="font-mono text-[10px] text-blue-500">
                                    {t("settings.detectedFormat")}: {rerankerTestResult.detectedFormat}
                                    <span className="ml-2 text-muted-foreground">({rerankerTestResult.formatConfidence})</span>
                                  </span>
                                  {rerankerTestResult.detectedFormat !== rerankerConfig.responseFormat && (
                                    <Button
                                      onClick={applyDetectedFormat}
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px] text-blue-500"
                                    >
                                      {t("settings.applyFormat")}
                                    </Button>
                                  )}
                                </div>
                                <p className="font-mono text-[10px] text-muted-foreground">
                                  {rerankerTestResult.formatReason}
                                </p>
                              </div>
                            )}
                            
                            <div className="space-y-2">
                              <span className="font-mono text-[10px] text-muted-foreground">{t("settings.rerankerResults")}:</span>
                              {rerankerTestResult.results.map((item, index) => (
                                <div key={index} className="flex items-start gap-3 rounded border border-border bg-background p-3">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/20 font-mono text-[10px] font-medium">
                                    {item.newRank}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="break-words font-mono text-xs">
                                      {item.document.length > 100 ? item.document.slice(0, 100) + "..." : item.document}
                                    </div>
                                  </div>
                                  <div className="shrink-0 rounded bg-green-500/20 px-2 py-0.5 font-mono text-[10px] text-green-500">
                                    {(item.score * 100).toFixed(1)}%
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {rerankerMessage && (
                  <div className={`font-mono text-xs ${rerankerMessage.type === "success" ? "text-green-500" : "text-red-500"}`}>
                    {rerankerMessage.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleRerankerSave} disabled={rerankerSaving}>
                    {rerankerSaving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reranker Quality Control Configuration */}
        {canEditSettings && rerankerConfig.enabled && (
          <div className="border border-border p-4 md:p-6">
            <h2 className="mb-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("settings.qualityControl") || "Reranker Quality Control"}
            </h2>
            <p className="mb-6 font-mono text-[10px] text-muted-foreground">
              {t("settings.qualityControlDesc") || "Dynamically control result quality based on reranking scores"}
            </p>

            {qualityLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-mono text-xs text-foreground">
                      {t("settings.enableQualityControl") || "Enable Quality Control"}
                    </label>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t("settings.enableQualityControlDesc") || "Use quality thresholds to dynamically return results"}
                    </p>
                  </div>
                  <button
                    onClick={() => setQualityConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      qualityConfig.enabled ? "bg-green-500" : "bg-muted/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        qualityConfig.enabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {qualityConfig.enabled && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.minResults") || "Min Results"}
                        </label>
                        <Input
                          type="number"
                          min="1"
                          max={qualityConfig.maxResults}
                          value={qualityConfig.minResults}
                          onChange={(e) => setQualityConfig(prev => ({ ...prev, minResults: Math.max(1, parseInt(e.target.value) || 1) }))}
                          placeholder="1"
                        />
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {t("settings.minResultsDesc") || "Minimum results to return (guarantees answer)"}
                        </p>
                      </div>
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.maxResults") || "Max Results"}
                        </label>
                        <Input
                          type="number"
                          min={qualityConfig.minResults}
                          max="100"
                          value={qualityConfig.maxResults}
                          onChange={(e) => setQualityConfig(prev => ({ ...prev, maxResults: Math.min(100, Math.max(prev.minResults, parseInt(e.target.value) || 10)) }))}
                          placeholder="10"
                        />
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {t("settings.maxResultsDesc") || "Maximum results to return (prevents too many inputs)"}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.scoreThreshold") || "Score Threshold"}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={qualityConfig.scoreThreshold}
                          onChange={(e) => setQualityConfig(prev => ({ ...prev, scoreThreshold: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.6)) }))}
                          placeholder="0.6"
                        />
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {t("settings.scoreThresholdDesc") || "Minimum relevance score (0.0-1.0)"}
                        </p>
                      </div>
                      <div>
                        <label className="mb-2 block font-mono text-xs text-muted-foreground">
                          {t("settings.dropoffThreshold") || "Score Dropoff"}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={qualityConfig.dropoffThreshold}
                          onChange={(e) => setQualityConfig(prev => ({ ...prev, dropoffThreshold: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.15)) }))}
                          placeholder="0.15"
                        />
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {t("settings.dropoffThresholdDesc") || "Score decrease to stop returning (cliff detection)"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded border border-blue-500/30 bg-blue-500/5 p-4">
                      <div className="font-mono text-xs font-medium text-blue-500 mb-2">
                        {t("settings.qualityControlPreview")}
                      </div>
                      <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                        <div>
                          • {t("settings.minResults")}: {qualityConfig.minResults}
                        </div>
                        <div>
                          • {t("settings.maxResults")}: {qualityConfig.maxResults}
                        </div>
                        <div>
                          • {t("settings.scoreThreshold")}: {qualityConfig.scoreThreshold.toFixed(2)}
                        </div>
                        <div>
                          • {t("settings.dropoffThreshold")}: {qualityConfig.dropoffThreshold.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {qualityMessage && (
                  <div className={`font-mono text-xs ${qualityMessage.type === "success" ? "text-green-500" : "text-red-500"}`}>
                    {qualityMessage.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleQualitySave} disabled={qualitySaving}>
                    {qualitySaving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prompt Configuration Section */}
        {canEditSettings && (
          <div className="border border-border p-4 md:p-6">
            <h2 className="mb-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("settings.promptConfig")}
            </h2>
            <p className="mb-6 font-mono text-[10px] text-muted-foreground">
              {t("settings.promptConfigDesc")}
            </p>

            {promptLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Chat With Context Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-xs font-medium">
                      {t("settings.chatWithContextPrompt")}
                    </label>
                    <button
                      onClick={() => handlePromptReset("chatWithContext")}
                      className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {t("settings.resetToDefault")}
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("settings.chatWithContextPromptDesc")}
                  </p>
                  <textarea
                    value={promptConfig.chatWithContext}
                    onChange={(e) => setPromptConfig(prev => ({ ...prev, chatWithContext: e.target.value }))}
                    rows={8}
                    className="w-full resize-y border border-border bg-background px-3 py-2 font-mono text-xs focus:border-foreground focus:outline-none"
                    placeholder="Enter chat prompt for when context is available..."
                  />
                </div>

                {/* Chat No Context Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-xs font-medium">
                      {t("settings.chatNoContextPrompt")}
                    </label>
                    <button
                      onClick={() => handlePromptReset("chatNoContext")}
                      className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {t("settings.resetToDefault")}
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("settings.chatNoContextPromptDesc")}
                  </p>
                  <textarea
                    value={promptConfig.chatNoContext}
                    onChange={(e) => setPromptConfig(prev => ({ ...prev, chatNoContext: e.target.value }))}
                    rows={6}
                    className="w-full resize-y border border-border bg-background px-3 py-2 font-mono text-xs focus:border-foreground focus:outline-none"
                    placeholder="Enter chat prompt for when no context is found..."
                  />
                </div>

                {/* Document Q&A Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-xs font-medium">
                      {t("settings.docQAPrompt")}
                    </label>
                    <button
                      onClick={() => handlePromptReset("docQA")}
                      className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {t("settings.resetToDefault")}
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("settings.docQAPromptDesc")}
                  </p>
                  <textarea
                    value={promptConfig.docQA}
                    onChange={(e) => setPromptConfig(prev => ({ ...prev, docQA: e.target.value }))}
                    rows={10}
                    className="w-full resize-y border border-border bg-background px-3 py-2 font-mono text-xs focus:border-foreground focus:outline-none"
                    placeholder="Enter document Q&A prompt..."
                  />
                </div>

                {promptMessage && (
                  <div className={`font-mono text-xs ${promptMessage.type === "success" ? "text-green-500" : "text-red-500"}`}>
                    {promptMessage.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handlePromptSave} disabled={promptSaving}>
                    {promptSaving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import/Export Configuration Section */}
        {canEditSettings && (
          <div className="border border-border p-4 md:p-6">
            <h2 className="mb-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("settings.importExport")}
            </h2>
            <p className="mb-6 font-mono text-[10px] text-muted-foreground">
              {t("settings.importExportDesc")}
            </p>

            <div className="space-y-6">
              {/* Export Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-mono text-xs text-foreground">
                      {t("settings.includeApiKeys")}
                    </label>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t("settings.includeApiKeysDesc")}
                    </p>
                  </div>
                  <button
                    onClick={() => setIncludeApiKeys(!includeApiKeys)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      includeApiKeys ? "bg-amber-500" : "bg-muted/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        includeApiKeys ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {includeApiKeys && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                      {t("settings.apiKeysWarning")}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleExportConfig}
                  disabled={exporting || loading || chatLoading || rerankerLoading || qualityLoading || promptLoading}
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  <ExportIcon />
                  <span className="ml-2">{exporting ? t("settings.exporting") : t("settings.exportConfig")}</span>
                </Button>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Import Section */}
              <div className="space-y-4">
                {!importPreview ? (
                  <label className="group flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-muted-foreground/30 p-8 transition-colors hover:border-foreground/50">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <ImportIcon />
                    <span className="mt-3 font-mono text-xs text-muted-foreground group-hover:text-foreground">
                      {t("settings.dragDropConfig")}
                    </span>
                    <span className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                      {t("settings.supportedFormat")}
                    </span>
                  </label>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded border border-blue-500/30 bg-blue-500/5 p-4">
                      <div className="mb-3 font-mono text-xs font-medium text-blue-500">
                        {t("settings.importPreview")}
                      </div>
                      <div className="space-y-2 font-mono text-[10px]">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{t("settings.configContains")}:</span>
                        </div>
                        <div className="ml-4 space-y-1">
                          {importPreview.embedding && (
                            <div className="flex items-center gap-2">
                              <CheckIcon />
                              <span>{t("settings.embeddingConfigLabel")}</span>
                            </div>
                          )}
                          {importPreview.chat && (
                            <div className="flex items-center gap-2">
                              <CheckIcon />
                              <span>{t("settings.chatConfigLabel")}</span>
                            </div>
                          )}
                          {importPreview.reranker && (
                            <div className="flex items-center gap-2">
                              <CheckIcon />
                              <span>{t("settings.rerankerConfigLabel")}</span>
                            </div>
                          )}
                          {importPreview.quality && (
                            <div className="flex items-center gap-2">
                              <CheckIcon />
                              <span>{t("settings.qualityConfigLabel")}</span>
                            </div>
                          )}
                          {importPreview.prompts && (
                            <div className="flex items-center gap-2">
                              <CheckIcon />
                              <span>{t("settings.promptConfigLabel")}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 pt-2 border-t border-border">
                          {importPreview.includesApiKeys ? (
                            <span className="text-amber-500">{t("settings.includeApiKeys")}: ✓</span>
                          ) : (
                            <span className="text-muted-foreground">{t("settings.noApiKeysIncluded")}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                        {t("settings.confirmImportDesc")}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleApplyImport}
                        disabled={importing}
                      >
                        {importing ? t("settings.importing") : t("settings.confirmImport")}
                      </Button>
                      <Button
                        onClick={handleCancelImport}
                        variant="secondary"
                        disabled={importing}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {importExportMessage && (
                <div className={`font-mono text-xs ${importExportMessage.type === "success" ? "text-green-500" : "text-red-500"}`}>
                  {importExportMessage.text}
                </div>
              )}
            </div>
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
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
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

function ExportIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg
      className="h-6 w-6 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-3 w-3 text-green-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
