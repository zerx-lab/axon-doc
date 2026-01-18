import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { generateText } from "ai";
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

function createProvider(config: ChatConfig) {
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

function cosineSimilarity(a: number[], b: number[]): number {
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
      return NextResponse.json(
        { error: "Missing required fields: operatorId, docId, query" },
        { status: 400 }
      );
    }

    const canSearch = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_SEARCH);
    if (!canSearch) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, title, kb_id, embedding_status")
      .eq("id", docId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.embedding_status !== "completed") {
      return NextResponse.json(
        { error: "Document embedding not completed. Please embed the document first." },
        { status: 400 }
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
      return NextResponse.json({ error: `Failed to fetch chunks: ${chunksError.message}` }, { status: 500 });
    }

    if (!allChunks || allChunks.length === 0) {
      return NextResponse.json({
        success: true,
        query,
        chunks: [],
        answer: "No content found in the document to answer your question.",
        documentTitle: doc.title,
        debug: { totalChunks: 0 },
      });
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

    const allSimilarities: Array<{ index: number; similarity: number; hasEmbedding: boolean }> = [];

    const chunksWithSimilarity: ChunkResult[] = allChunks
      .map((chunk) => {
        const embedding = parseEmbedding(chunk.embedding);
        const hasEmbedding = embedding !== null && embedding.length > 0;
        const similarity = hasEmbedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
        
        allSimilarities.push({
          index: chunk.chunk_index,
          similarity,
          hasEmbedding,
        });

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

    const debug = {
      totalChunks: allChunks.length,
      chunksWithEmbedding: allSimilarities.filter(s => s.hasEmbedding).length,
      queryEmbeddingLength: queryEmbedding.length,
      threshold,
      similarities: allSimilarities.slice(0, 10),
    };

    return await generateAnswer(supabase, query, chunksWithSimilarity, doc.title, debug);
  } catch (error) {
    console.error("Document test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test failed" },
      { status: 500 }
    );
  }
}

async function generateAnswer(
  supabase: ReturnType<typeof createAdminClient>,
  query: string,
  chunks: ChunkResult[],
  documentTitle: string,
  debug?: unknown
) {
  if (chunks.length === 0) {
    return NextResponse.json({
      success: true,
      query,
      chunks: [],
      answer: "No relevant content found in the document to answer your question.",
      documentTitle,
      debug,
    });
  }

  const { data: chatConfigData } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "chat_config")
    .single();

  if (!chatConfigData?.value) {
    return NextResponse.json({
      success: true,
      query,
      chunks,
      answer: "Chat model not configured. Please configure it in Settings.",
      documentTitle,
    });
  }

  const chatConfig = chatConfigData.value as unknown as ChatConfig;

  if (!chatConfig.apiKey || chatConfig.apiKey === "********") {
    return NextResponse.json({
      success: true,
      query,
      chunks,
      answer: "Chat API key not configured. Please configure it in Settings.",
      documentTitle,
    });
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
    const model = createProvider(chatConfig);
    const startTime = Date.now();

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: query,
      maxOutputTokens: chatConfig.maxTokens || 1024,
      temperature: chatConfig.temperature ?? 0.3,
    });

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      query,
      chunks,
      answer: result.text,
      documentTitle,
      responseTime,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
      debug,
    });
  } catch (error) {
    console.error("Chat generation error:", error);
    return NextResponse.json({
      success: true,
      query,
      chunks,
      answer: `Failed to generate answer: ${error instanceof Error ? error.message : "Unknown error"}`,
      documentTitle,
    });
  }
}
