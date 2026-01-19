import OpenAI from "openai";
import type { 
  EmbeddingConfig, 
  SimilarChunk, 
  KnowledgeBaseSettings, 
  ChatConfig,
  HybridSearchChunk,
  HybridSearchChunkWithTokens,
  HybridSearchOptions,
  SearchType,
  SearchIndexStats,
  DocumentChunkSearchResult,
  BM25SearchRawResult,
} from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecursiveCharacterSplitter, computeContentHash } from "@/lib/chunking";
import { ContextGenerator } from "@/lib/chunking";

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "text-embedding-3-small",
  dimensions: 0,
  batchSize: 100,
  chunkSize: 400,
  chunkOverlap: 60,
  contextEnabled: false,
};

export function getEmbeddingSettings(
  kbSettings: KnowledgeBaseSettings | null
): EmbeddingConfig {
  if (!kbSettings?.embedding) {
    return DEFAULT_EMBEDDING_CONFIG;
  }
  return {
    ...DEFAULT_EMBEDDING_CONFIG,
    model: kbSettings.embedding.model || DEFAULT_EMBEDDING_CONFIG.model,
    dimensions: kbSettings.embedding.dimensions || DEFAULT_EMBEDDING_CONFIG.dimensions,
    chunkSize: kbSettings.embedding.chunkSize || DEFAULT_EMBEDDING_CONFIG.chunkSize,
    chunkOverlap: kbSettings.embedding.chunkOverlap || DEFAULT_EMBEDDING_CONFIG.chunkOverlap,
  };
}

export async function getEmbeddingConfig(
  supabase: SupabaseClient
): Promise<EmbeddingConfig> {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "embedding_config")
      .single();

    if (data?.value) {
      return { ...DEFAULT_EMBEDDING_CONFIG, ...(data.value as Partial<EmbeddingConfig>) };
    }
  } catch {
    return DEFAULT_EMBEDDING_CONFIG;
  }
  return DEFAULT_EMBEDDING_CONFIG;
}

export async function getChatConfig(
  supabase: SupabaseClient
): Promise<ChatConfig | null> {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "chat_config")
      .single();

    if (data?.value) {
      return data.value as ChatConfig;
    }
  } catch {
    return null;
  }
  return null;
}

export function chunkDocument(
  content: string,
  chunkSize: number = 400,
  chunkOverlap: number = 60
): Array<{ content: string; tokenCount: number; contentHash: string }> {
  const splitter = new RecursiveCharacterSplitter({
    chunkSize,
    chunkOverlap,
  });
  
  return splitter.split(content).map(chunk => ({
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    contentHash: chunk.contentHash,
  }));
}

interface AliyunEmbeddingResponse {
  output: {
    embeddings: Array<{
      text_index: number;
      embedding: number[];
    }>;
  };
  usage: {
    total_tokens: number;
  };
  request_id: string;
}

async function callAliyunEmbeddingAPI(
  apiKey: string,
  model: string,
  texts: string[]
): Promise<number[][]> {
  const response = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: {
          texts,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Aliyun API Error (${response.status}): ${errorText}`);
  }

  const data: AliyunEmbeddingResponse = await response.json();
  
  if (!data.output?.embeddings) {
    throw new Error("Invalid response from Aliyun API");
  }

  return data.output.embeddings
    .sort((a, b) => a.text_index - b.text_index)
    .map((e) => e.embedding);
}

export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("API key is not configured. Please set it in Settings > Embedding Model Configuration.");
  }

  const batchSize = config.batchSize || 100;
  const allEmbeddings: number[][] = [];

  const useAliyunNativeAPI = config.provider === "aliyun" && 
    !config.baseUrl.includes("compatible-mode");

  if (useAliyunNativeAPI) {
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await callAliyunEmbeddingAPI(apiKey, config.model, batch);
      allEmbeddings.push(...embeddings);
    }
  } else {
    const openai = new OpenAI({ 
      apiKey,
      baseURL: config.baseUrl,
    });

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await openai.embeddings.create({
        model: config.model,
        input: batch,
        encoding_format: "float",
      });

      for (const item of response.data) {
        allEmbeddings.push(item.embedding);
      }
    }
  }

  return allEmbeddings;
}

export async function generateSingleEmbedding(
  text: string,
  settings: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number[]> {
  const embeddings = await generateEmbeddings([text], settings);
  if (!embeddings || embeddings.length === 0) {
    throw new Error("Failed to generate embedding: empty result returned");
  }
  return embeddings[0];
}

export async function searchSimilarChunks(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  kbId: string,
  matchCount: number = 5,
  matchThreshold: number = 0.7
): Promise<SimilarChunk[]> {
  const { data, error } = await supabase.rpc("search_similar_chunks", {
    query_embedding: queryEmbedding,
    target_kb_id: kbId,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });

  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => ({
    chunk_id: r.chunk_id as string,
    document_id: r.document_id as string,
    document_title: r.document_title as string,
    document_source_url: (r.document_source_url as string) || null,
    chunk_content: r.chunk_content as string,
    chunk_context: r.chunk_context as string | undefined,
    chunk_index: r.chunk_index as number,
    similarity: r.similarity as number,
  }));
}

export async function hybridSearchChunks(
  supabase: SupabaseClient,
  queryText: string,
  queryEmbedding: number[],
  kbId: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchChunk[]> {
  const {
    searchType = "hybrid",
    matchCount = 20,
    matchThreshold = 0.3,
    vectorWeight = 0.5,
    rrfK = 60,
  } = options;

  if (searchType === "vector") {
    const results = await searchSimilarChunks(
      supabase,
      queryEmbedding,
      kbId,
      matchCount,
      matchThreshold
    );
    return results.map((r) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      document_title: r.document_title,
      document_source_url: r.document_source_url,
      chunk_content: r.chunk_content,
      chunk_context: r.chunk_context ?? null,
      chunk_index: r.chunk_index,
      similarity: r.similarity,
      bm25_rank: null,
      vector_rank: null,
      combined_score: r.similarity,
      search_type: "vector" as SearchType,
    }));
  }

  if (searchType === "bm25") {
    const { data, error } = await supabase.rpc("bm25_search_chunks", {
      query_text: queryText,
      target_kb_id: kbId,
      match_count: matchCount,
    });
    if (error) throw error;
    return (data || []).map((r: BM25SearchRawResult, index: number) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      document_title: r.document_title,
      document_source_url: null,
      chunk_content: r.chunk_content,
      chunk_context: r.chunk_context,
      chunk_index: r.chunk_index,
      similarity: 0,
      bm25_rank: index + 1,
      vector_rank: null,
      combined_score: r.bm25_score,
      search_type: "bm25" as SearchType,
    }));
  }

  const { data, error } = await supabase.rpc("hybrid_search_chunks", {
    query_text: queryText,
    query_embedding: queryEmbedding,
    target_kb_id: kbId,
    match_count: matchCount,
    match_threshold: matchThreshold,
    vector_weight: vectorWeight,
    rrf_k: rrfK,
  });

  if (error) throw error;
  return data || [];
}

export async function hybridSearchChunksMultiKb(
  supabase: SupabaseClient,
  queryText: string,
  queryEmbedding: number[],
  kbIds: string[],
  options: HybridSearchOptions = {}
): Promise<HybridSearchChunk[]> {
  const {
    matchCount = 20,
    matchThreshold = 0.3,
    vectorWeight = 0.5,
    rrfK = 60,
  } = options;

  const allResults: HybridSearchChunk[] = [];
  
  for (const kbId of kbIds) {
    const { data, error } = await supabase.rpc("hybrid_search_chunks", {
      query_text: queryText,
      query_embedding: queryEmbedding,
      target_kb_id: kbId,
      match_count: matchCount,
      match_threshold: matchThreshold,
      vector_weight: vectorWeight,
      rrf_k: rrfK,
    });

    if (error) {
      console.error(`Search error for KB ${kbId}:`, error);
      continue;
    }
    
    if (data) {
      const resultsWithKbId = data.map((item: HybridSearchChunk) => ({
        ...item,
        kb_id: kbId,
      }));
      allResults.push(...resultsWithKbId);
    }
  }
  
  return allResults
    .sort((a, b) => (b.combined_score || 0) - (a.combined_score || 0))
    .slice(0, matchCount);
}

export async function hybridSearchForReranking(
  supabase: SupabaseClient,
  queryText: string,
  queryEmbedding: number[],
  kbId: string,
  candidateCount: number = 100,
  matchThreshold: number = 0.2,
  vectorWeight: number = 0.5
): Promise<HybridSearchChunkWithTokens[]> {
  const { data, error } = await supabase.rpc("hybrid_search_for_reranking", {
    query_text: queryText,
    query_embedding: queryEmbedding,
    target_kb_id: kbId,
    candidate_count: candidateCount,
    match_threshold: matchThreshold,
    vector_weight: vectorWeight,
    rrf_k: 60,
  });

  if (error) throw error;
  return data || [];
}

export async function getSearchStats(
  supabase: SupabaseClient,
  kbId: string
): Promise<SearchIndexStats> {
  const { data, error } = await supabase.rpc("get_search_stats", {
    target_kb_id: kbId,
  });

  if (error) throw error;
  return data?.[0] || {
    total_chunks: 0,
    chunks_with_embedding: 0,
    chunks_with_search_vector: 0,
    avg_chunk_tokens: 0,
    total_documents: 0,
    index_coverage_percent: 0,
  };
}

export async function rebuildSearchVectors(
  supabase: SupabaseClient,
  kbId: string
): Promise<{ updated_count: number; duration_ms: number }> {
  const { data, error } = await supabase.rpc("rebuild_search_vectors", {
    target_kb_id: kbId,
  });

  if (error) throw error;
  return data?.[0] || { updated_count: 0, duration_ms: 0 };
}

export async function getEmbeddingStats(
  supabase: SupabaseClient,
  kbId: string
) {
  const { data, error } = await supabase.rpc("get_kb_embedding_stats", {
    target_kb_id: kbId,
  });

  if (error) throw error;
  return data?.[0] || {
    total_documents: 0,
    embedded_documents: 0,
    pending_documents: 0,
    failed_documents: 0,
    outdated_documents: 0,
    total_chunks: 0,
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
    if (typeof err.details === "string") return err.details;
    if (typeof err.error === "object" && err.error !== null) {
      const inner = err.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
    return JSON.stringify(error);
  }
  return "Unknown error occurred";
}

interface ChunkData {
  originalContent: string;
  contextSummary: string | null;
  contextualizedContent: string;
  contentHash: string;
  contextHash: string | null;
  tokenCount: number;
}

export async function embedDocument(
  supabase: SupabaseClient,
  documentId: string,
  content: string,
  config?: EmbeddingConfig,
  documentTitle?: string
): Promise<{ success: boolean; chunkCount: number; error?: string }> {
  try {
    const embeddingConfig = config || await getEmbeddingConfig(supabase);

    // Note: Status is set to "processing" by the caller (API route) before calling this function
    // to avoid race conditions. We only update to "completed" or "failed" here.

    const splitter = new RecursiveCharacterSplitter({
      chunkSize: embeddingConfig.chunkSize,
      chunkOverlap: embeddingConfig.chunkOverlap,
    });
    
    const rawChunks = splitter.split(content);
    
    if (rawChunks.length === 0) {
      await supabase
        .from("documents")
        .update({ embedding_status: "completed" })
        .eq("id", documentId);
      return { success: true, chunkCount: 0 };
    }

    let chunkDataList: ChunkData[];

    if (embeddingConfig.contextEnabled) {
      const chatConfig = await getChatConfig(supabase);
      
      if (!chatConfig || !chatConfig.apiKey) {
        throw new Error("Chat model not configured. Please configure it in Settings to enable contextual retrieval.");
      }

      const contextGenerator = new ContextGenerator(chatConfig, 8000);
      const contextResults = await contextGenerator.generateContextBatch(
        content,
        rawChunks.map(c => c.content),
        documentTitle
      );

      chunkDataList = contextResults.map((result, index) => ({
        originalContent: result.original,
        contextSummary: result.context || null,
        contextualizedContent: result.contextualized,
        contentHash: rawChunks[index].contentHash,
        contextHash: result.context ? computeContentHash(result.context) : null,
        tokenCount: rawChunks[index].tokenCount,
      }));
    } else {
      chunkDataList = rawChunks.map(chunk => ({
        originalContent: chunk.content,
        contextSummary: null,
        contextualizedContent: chunk.content,
        contentHash: chunk.contentHash,
        contextHash: null,
        tokenCount: chunk.tokenCount,
      }));
    }

    const textsToEmbed = chunkDataList.map(c => c.contextualizedContent);
    const embeddings = await generateEmbeddings(textsToEmbed, embeddingConfig);

    const chunkRecords = chunkDataList.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      original_content: chunk.originalContent,
      context_summary: chunk.contextSummary,
      contextualized_content: chunk.contextualizedContent,
      content_hash: chunk.contentHash,
      context_hash: chunk.contextHash,
      token_count: chunk.tokenCount,
      embedding: embeddings[index],
    }));

    const { error: upsertError } = await supabase
      .from("document_chunks")
      .upsert(chunkRecords, { 
        onConflict: "document_id,chunk_index",
        ignoreDuplicates: false 
      });

    if (upsertError) throw upsertError;

    // Delete any excess chunks from previous embeddings
    const { error: deleteError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId)
      .gte("chunk_index", chunkDataList.length);

    if (deleteError) {
      console.warn("Failed to delete excess chunks:", deleteError);
      // Continue execution - this is not critical
    }

    await supabase
      .from("documents")
      .update({ embedding_status: "completed" })
      .eq("id", documentId);

    return { success: true, chunkCount: chunkDataList.length };
  } catch (error) {
    console.error("embedDocument error:", error);
    
    await supabase
      .from("documents")
      .update({ embedding_status: "failed" })
      .eq("id", documentId);

    return {
      success: false,
      chunkCount: 0,
      error: extractErrorMessage(error),
    };
  }
}

export async function deleteDocumentEmbeddings(
  supabase: SupabaseClient,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);

    await supabase
      .from("documents")
      .update({ embedding_status: "pending" })
      .eq("id", documentId);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: extractErrorMessage(error),
    };
  }
}

export async function embedKnowledgeBase(
  supabase: SupabaseClient,
  kbId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; processed: number; failed: number; error?: string }> {
  try {
    const embeddingConfig = await getEmbeddingConfig(supabase);
    
    const { data: documents, error: fetchError } = await supabase
      .from("documents")
      .select("id, content, title")
      .eq("kb_id", kbId)
      .in("embedding_status", ["pending", "outdated", "failed"]);

    if (fetchError) throw fetchError;
    if (!documents || documents.length === 0) {
      return { success: true, processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;

    for (const doc of documents) {
      const result = await embedDocument(
        supabase, 
        doc.id, 
        doc.content || "", 
        embeddingConfig,
        doc.title
      );
      
      if (result.success) {
        processed++;
      } else {
        failed++;
      }

      if (onProgress) {
        onProgress(processed + failed, documents.length);
      }
    }

    return { success: true, processed, failed };
  } catch (error) {
    return {
      success: false,
      processed: 0,
      failed: 0,
      error: extractErrorMessage(error),
    };
  }
}

export async function deleteKnowledgeBaseEmbeddings(
  supabase: SupabaseClient,
  kbId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: documents } = await supabase
      .from("documents")
      .select("id")
      .eq("kb_id", kbId);

    if (documents && documents.length > 0) {
      const docIds = documents.map((d) => d.id);
      
      await supabase
        .from("document_chunks")
        .delete()
        .in("document_id", docIds);

      await supabase
        .from("documents")
        .update({ embedding_status: "pending" })
        .in("id", docIds);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: extractErrorMessage(error),
    };
  }
}

export interface DocumentHybridSearchOptions {
  matchCount?: number;
  matchThreshold?: number;
  vectorWeight?: number;
  rrfK?: number;
}

export async function hybridSearchDocumentChunks(
  supabase: SupabaseClient,
  queryText: string,
  queryEmbedding: number[],
  documentId: string,
  options: DocumentHybridSearchOptions = {}
): Promise<DocumentChunkSearchResult[]> {
  const {
    matchCount = 10,
    matchThreshold = 0.3,
    vectorWeight = 0.5,
    rrfK = 60,
  } = options;

  const { data, error } = await supabase.rpc("hybrid_search_document_chunks", {
    query_text: queryText,
    query_embedding: queryEmbedding,
    target_document_id: documentId,
    match_count: matchCount,
    match_threshold: matchThreshold,
    vector_weight: vectorWeight,
    rrf_k: rrfK,
  });

  if (error) {
    console.error("hybridSearchDocumentChunks error:", error);
    throw new Error(`Hybrid search failed: ${error.message || JSON.stringify(error)}`);
  }
  return data || [];
}
