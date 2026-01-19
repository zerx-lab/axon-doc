import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfig, SearchType, RerankerConfig, PromptConfig } from "@/lib/supabase/types";
import { DEFAULT_PROMPTS } from "@/lib/supabase/types";
import {
  generateSingleEmbedding,
  getEmbeddingConfig,
  hybridSearchDocumentChunks,
} from "@/lib/embeddings";
import { hybridSearchWithReranking } from "@/lib/reranker";
import {
  t,
  parseLocale,
  formatChunkContext,
  type Locale,
} from "@/lib/i18n-server";

interface TestDocumentRequest {
  operatorId: string;
  docId: string;
  query: string;
  limit?: number;
  threshold?: number;
  locale?: string;
}

interface ChunkResult {
  chunkId: string;
  chunkIndex: number;
  content: string;
  context: string | null;
  similarity: number;
  searchType: SearchType;
  combinedScore: number;
  bm25Rank: number | null;
  vectorRank: number | null;
}

interface DebugInfo {
  contextEnabled: boolean;
  hybridSearchUsed: boolean;
  rerankEnabled: boolean;
  rerankDegraded: boolean;
  totalChunks: number;
  candidatesBeforeRerank: number;
  searchType: string;
  rerankerProvider: string | null;
  embeddingModel: string;
  resultTypes: Record<string, number>;
}

function createChatProvider(config: ChatConfig) {
  const { provider, baseUrl, apiKey, model } = config;

  switch (provider) {
    case "openai": {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      return openai(model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      return anthropic(model);
    }
    case "openai-compatible": {
      const compatible = createOpenAICompatible({
        name: "openai-compatible",
        apiKey,
        baseURL: baseUrl,
      });
      return compatible(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function POST(request: NextRequest) {
  let locale: Locale = "zh";
  
  try {
    const supabase = createAdminClient();
    const body: TestDocumentRequest = await request.json();
    const { operatorId, docId, query, limit = 5, threshold = 0.5, locale: localeParam } = body;
    locale = parseLocale(localeParam);

    if (!operatorId || !docId || !query) {
      return new Response(
        JSON.stringify({ error: t("api.docTest.missingFields", locale) }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const canSearch = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_SEARCH);
    if (!canSearch) {
      return new Response(
        JSON.stringify({ error: t("api.docTest.permissionDenied", locale) }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, title, kb_id, embedding_status")
      .eq("id", docId)
      .single();

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ error: t("api.docTest.documentNotFound", locale) }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (doc.embedding_status !== "completed") {
      return new Response(
        JSON.stringify({ error: t("api.docTest.embeddingNotCompleted", locale) }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const embeddingConfig = await getEmbeddingConfig(supabase);
    const queryEmbedding = await generateSingleEmbedding(query, embeddingConfig);

    // 获取重排序配置
    const { data: rerankerConfigData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "reranker_config")
      .single();
    
    const rerankerConfig = rerankerConfigData?.value as RerankerConfig | null;

    // 如果启用重排序，获取更多候选结果
    const candidateCount = rerankerConfig?.enabled ? Math.min(limit * 5, 100) : limit;

    const hybridResults = await hybridSearchDocumentChunks(
      supabase,
      query,
      queryEmbedding,
      docId,
      {
        matchCount: candidateCount,
        matchThreshold: threshold * 0.5, // 降低阈值以获取更多候选
        vectorWeight: 0.5,
      }
    );

    // 应用重排序（如果配置启用）
    const rerankResult = await hybridSearchWithReranking(
      hybridResults.map(r => ({
        chunk_id: r.chunk_id,
        document_id: r.document_id,
        document_title: doc.title,
        document_source_url: null,
        chunk_content: r.chunk_content,
        chunk_context: r.chunk_context,
        chunk_index: r.chunk_index,
        similarity: r.similarity,
        bm25_rank: r.bm25_rank,
        vector_rank: r.vector_rank,
        combined_score: r.combined_score,
        search_type: r.search_type,
      })),
      query,
      rerankerConfig,
      limit
    );

    const finalResults = rerankResult.chunks;
    const isRerankEnabled = rerankerConfig?.enabled && rerankerConfig?.provider !== "none";
    
    const chunksWithSimilarity: ChunkResult[] = finalResults.map((result) => ({
      chunkId: result.chunk_id,
      chunkIndex: result.chunk_index,
      content: result.chunk_content,
      context: result.chunk_context,
      similarity: result.similarity,
      searchType: result.search_type,
      combinedScore: result.combined_score,
      bm25Rank: result.bm25_rank,
      vectorRank: result.vector_rank,
    }));

    const debugInfo: DebugInfo = {
      contextEnabled: embeddingConfig.contextEnabled ?? false,
      hybridSearchUsed: true,
      rerankEnabled: rerankResult.reranked,
      rerankDegraded: rerankResult.degraded,
      totalChunks: finalResults.length,
      candidatesBeforeRerank: hybridResults.length,
      searchType: "hybrid",
      rerankerProvider: rerankResult.reranked ? (rerankerConfig?.provider ?? null) : null,
      embeddingModel: embeddingConfig.model,
      resultTypes: finalResults.reduce((acc, r) => {
        acc[r.search_type] = (acc[r.search_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return streamAnswer(supabase, query, chunksWithSimilarity, doc.title, locale, debugInfo);
  } catch (error) {
    console.error("Document test stream error:", error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === "object" && error !== null
        ? JSON.stringify(error)
        : t("api.docTest.testFailed", locale);
    return new Response(
      JSON.stringify({ error: errorMessage, details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function streamAnswer(
  supabase: ReturnType<typeof createAdminClient>,
  query: string,
  chunks: ChunkResult[],
  documentTitle: string,
  locale: Locale,
  debugInfo: DebugInfo
): Promise<Response> {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(message));
  };

  (async () => {
    try {
      await sendEvent("metadata", {
        query,
        documentTitle,
        chunks,
        startTime,
        debug: debugInfo,
      });

      if (chunks.length === 0) {
        await sendEvent("text", { content: t("api.docTest.noRelevantContent", locale) });
        await sendEvent("done", { 
          responseTime: Date.now() - startTime,
          usage: null,
        });
        await writer.close();
        return;
      }

      const { data: chatConfigData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "chat_config")
        .single();

      if (!chatConfigData?.value) {
        await sendEvent("text", { content: t("api.docTest.chatNotConfigured", locale) });
        await sendEvent("done", { responseTime: Date.now() - startTime, usage: null });
        await writer.close();
        return;
      }

      const chatConfig = chatConfigData.value as unknown as ChatConfig;

      if (!chatConfig.apiKey || chatConfig.apiKey === "********") {
        await sendEvent("text", { content: t("api.docTest.apiKeyNotConfigured", locale) });
        await sendEvent("done", { responseTime: Date.now() - startTime, usage: null });
        await writer.close();
        return;
      }

      const { data: promptConfigData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "prompt_config")
        .single();
      
      const promptConfig: PromptConfig = promptConfigData?.value 
        ? { ...DEFAULT_PROMPTS, ...(promptConfigData.value as Partial<PromptConfig>) }
        : DEFAULT_PROMPTS;

      const context = formatChunkContext(chunks, locale);
      const systemPrompt = promptConfig.docQA
        .replace("{{documentTitle}}", documentTitle)
        .replace("{{context}}", context);

      try {
        const model = createChatProvider(chatConfig);

        const result = streamText({
          model,
          system: systemPrompt,
          prompt: query,
          maxOutputTokens: chatConfig.maxTokens || 1024,
          temperature: chatConfig.temperature ?? 0.3,
        });

        for await (const textPart of result.textStream) {
          await sendEvent("text", { content: textPart });
        }

        const usage = await result.usage;
        const responseTime = Date.now() - startTime;

        await sendEvent("done", {
          responseTime,
          usage: {
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          },
        });
      } catch (error) {
        console.error("Stream generation error:", error);
        await sendEvent("error", {
          message: `${t("api.docTest.generateFailed", locale)}: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    } catch (error) {
      console.error("Stream processing error:", error);
      await sendEvent("error", {
        message: error instanceof Error ? error.message : t("api.docTest.streamFailed", locale),
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
