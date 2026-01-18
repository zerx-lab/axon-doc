import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfig } from "@/lib/supabase/types";
import {
  generateSingleEmbedding,
  getEmbeddingConfig,
} from "@/lib/embeddings";

interface TestDocumentRequest {
  operatorId: string;
  docId: string;
  query: string;
  limit?: number;
  threshold?: number;
}

interface ChunkResult {
  chunkId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
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

function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: TestDocumentRequest = await request.json();
    const { operatorId, docId, query, limit = 5, threshold = 0.5 } = body;

    if (!operatorId || !docId || !query) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: operatorId, docId, query" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const canSearch = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_SEARCH);
    if (!canSearch) {
      return new Response(
        JSON.stringify({ error: "Permission denied" }),
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
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (doc.embedding_status !== "completed") {
      return new Response(
        JSON.stringify({ error: "Document embedding not completed. Please embed the document first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const embeddingConfig = await getEmbeddingConfig(supabase);
    const queryEmbedding = await generateSingleEmbedding(query, embeddingConfig);

    const { data: allChunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, chunk_index, original_content, embedding")
      .eq("document_id", docId)
      .order("chunk_index");

    if (chunksError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch chunks: ${chunksError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!allChunks || allChunks.length === 0) {
      return new Response(
        JSON.stringify({
          type: "complete",
          success: true,
          query,
          chunks: [],
          answer: "No content found in the document to answer your question.",
          documentTitle: doc.title,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const parseEmbedding = (emb: unknown): number[] | null => {
      if (Array.isArray(emb)) return emb;
      if (typeof emb === "string") {
        try {
          const parsed = JSON.parse(emb);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          return null;
        }
      }
      return null;
    };

    const chunksWithSimilarity: ChunkResult[] = allChunks
      .map((chunk) => {
        const embedding = parseEmbedding(chunk.embedding);
        const hasEmbedding = embedding !== null && embedding.length > 0;
        const similarity = hasEmbedding ? calculateCosineSimilarity(queryEmbedding, embedding) : 0;

        return {
          chunkId: chunk.id,
          chunkIndex: chunk.chunk_index,
          content: chunk.original_content,
          similarity,
          hasEmbedding,
        };
      })
      .filter((chunk) => chunk.hasEmbedding && chunk.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(({ chunkId, chunkIndex, content, similarity }) => ({
        chunkId,
        chunkIndex,
        content,
        similarity,
      }));

    return streamAnswer(supabase, query, chunksWithSimilarity, doc.title);
  } catch (error) {
    console.error("Document test stream error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Test failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function streamAnswer(
  supabase: ReturnType<typeof createAdminClient>,
  query: string,
  chunks: ChunkResult[],
  documentTitle: string
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
      });

      if (chunks.length === 0) {
        await sendEvent("text", { content: "No relevant content found in the document to answer your question." });
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
        await sendEvent("text", { content: "Chat model not configured. Please configure it in Settings." });
        await sendEvent("done", { responseTime: Date.now() - startTime, usage: null });
        await writer.close();
        return;
      }

      const chatConfig = chatConfigData.value as unknown as ChatConfig;

      if (!chatConfig.apiKey || chatConfig.apiKey === "********") {
        await sendEvent("text", { content: "Chat API key not configured. Please configure it in Settings." });
        await sendEvent("done", { responseTime: Date.now() - startTime, usage: null });
        await writer.close();
        return;
      }
      const context = chunks
        .map((chunk, index) => `[Fragment ${index + 1}] (Similarity: ${(chunk.similarity * 100).toFixed(1)}%)\n${chunk.content}`)
        .join("\n\n---\n\n");

      const systemPrompt = `You are a document Q&A assistant. You MUST answer the user's question based ONLY on the provided document fragments below.

STRICT RULES:
1. You can ONLY use information from the provided fragments to answer
2. If the fragments don't contain enough information to answer the question, say "Based on the provided document content, I cannot find relevant information to answer this question."
3. Do NOT make up or infer information that is not explicitly stated in the fragments
4. Always cite which fragment(s) your answer is based on when possible
5. Keep your answer concise and accurate

Document: "${documentTitle}"

---
DOCUMENT FRAGMENTS:
${context}
---`;

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
          message: `Failed to generate answer: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    } catch (error) {
      console.error("Stream processing error:", error);
      await sendEvent("error", {
        message: error instanceof Error ? error.message : "Stream processing failed",
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
