import type { 
  HybridSearchChunk, 
  RerankerConfig as BaseRerankerConfig,
  RerankerResponseFormat,
} from "@/lib/supabase/types";

export type RerankerProvider = "cohere" | "jina" | "voyage" | "aliyun" | "openai-compatible";

export interface RerankerConfig {
  provider: RerankerProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  responseFormat?: RerankerResponseFormat;
  customHeaders?: Record<string, string>;
}

export interface RerankResult {
  chunk: HybridSearchChunk;
  relevanceScore: number;
  originalRank: number;
  newRank: number;
}

export interface RerankOptions {
  topK?: number;
  returnOriginalOrder?: boolean;
}

interface CohereRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

interface JinaRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
    document?: { text: string };
  }>;
}

interface VoyageRerankResponse {
  data: Array<{
    index: number;
    relevance_score: number;
  }>;
}

interface GenericRerankResultItem {
  index: number;
  relevance_score?: number;
  score?: number;
  document?: { text: string };
}

type GenericRerankResponse = 
  | { results: GenericRerankResultItem[] }
  | { data: GenericRerankResultItem[] };

function extractResultsFromResponse(
  response: unknown,
  format: RerankerResponseFormat
): Array<{ index: number; score: number }> {
  const data = response as Record<string, unknown>;
  
  if (format === "auto") {
    if (Array.isArray(data.results)) {
      const results = data.results as GenericRerankResultItem[];
      return results.map(r => ({
        index: r.index,
        score: r.relevance_score ?? r.score ?? 0,
      }));
    }
    if (Array.isArray(data.data)) {
      const results = data.data as GenericRerankResultItem[];
      return results.map(r => ({
        index: r.index,
        score: r.relevance_score ?? r.score ?? 0,
      }));
    }
    throw new Error("Unable to auto-detect response format: no 'results' or 'data' array found");
  }
  
  switch (format) {
    case "cohere":
    case "jina": {
      const results = (data as { results?: GenericRerankResultItem[] }).results;
      if (!Array.isArray(results)) {
        throw new Error(`Expected 'results' array for ${format} format`);
      }
      return results.map(r => ({
        index: r.index,
        score: r.relevance_score ?? r.score ?? 0,
      }));
    }
    case "voyage": {
      const results = (data as { data?: GenericRerankResultItem[] }).data;
      if (!Array.isArray(results)) {
        throw new Error("Expected 'data' array for voyage format");
      }
      return results.map(r => ({
        index: r.index,
        score: r.relevance_score ?? r.score ?? 0,
      }));
    }
    default:
      throw new Error(`Unknown response format: ${format}`);
  }
}

async function rerankWithCohere(
  query: string,
  chunks: HybridSearchChunk[],
  config: RerankerConfig,
  topK: number
): Promise<RerankResult[]> {
  const response = await fetch("https://api.cohere.ai/v1/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "rerank-english-v3.0",
      query,
      documents: chunks.map(c => c.chunk_content),
      top_n: topK,
      return_documents: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere rerank failed: ${error}`);
  }

  const data: CohereRerankResponse = await response.json();
  
  return data.results.map((r, newRank) => ({
    chunk: chunks[r.index],
    relevanceScore: r.relevance_score,
    originalRank: r.index,
    newRank,
  }));
}

async function rerankWithJina(
  query: string,
  chunks: HybridSearchChunk[],
  config: RerankerConfig,
  topK: number
): Promise<RerankResult[]> {
  const response = await fetch(config.baseUrl || "https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "jina-reranker-v2-base-multilingual",
      query,
      documents: chunks.map(c => c.chunk_content),
      top_n: topK,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jina rerank failed: ${error}`);
  }

  const data: JinaRerankResponse = await response.json();
  
  return data.results.map((r, newRank) => ({
    chunk: chunks[r.index],
    relevanceScore: r.relevance_score,
    originalRank: r.index,
    newRank,
  }));
}

async function rerankWithVoyage(
  query: string,
  chunks: HybridSearchChunk[],
  config: RerankerConfig,
  topK: number
): Promise<RerankResult[]> {
  const response = await fetch(config.baseUrl || "https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "rerank-2",
      query,
      documents: chunks.map(c => c.chunk_content),
      top_k: topK,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage rerank failed: ${error}`);
  }

  const data: VoyageRerankResponse = await response.json();
  
  return data.data.map((r, newRank) => ({
    chunk: chunks[r.index],
    relevanceScore: r.relevance_score,
    originalRank: r.index,
    newRank,
  }));
}

interface AliyunRerankResponse {
  output: {
    results: Array<{
      index: number;
      relevance_score: number;
      document?: { text: string };
    }>;
  };
  usage: {
    total_tokens: number;
  };
  request_id: string;
}

async function rerankWithAliyun(
  query: string,
  chunks: HybridSearchChunk[],
  config: RerankerConfig,
  topK: number
): Promise<RerankResult[]> {
  const apiUrl = config.baseUrl || "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "gte-rerank-v2",
      input: {
        query,
        documents: chunks.map(c => c.chunk_content),
      },
      parameters: {
        return_documents: false,
        top_n: topK,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Aliyun rerank failed: ${error}`);
  }

  const data: AliyunRerankResponse = await response.json();
  
  return data.output.results.map((r, newRank) => ({
    chunk: chunks[r.index],
    relevanceScore: r.relevance_score,
    originalRank: r.index,
    newRank,
  }));
}

async function rerankWithOpenAICompatible(
  query: string,
  chunks: HybridSearchChunk[],
  config: RerankerConfig,
  topK: number
): Promise<RerankResult[]> {
  if (!config.baseUrl) {
    throw new Error("baseUrl is required for custom API provider");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.customHeaders,
  };
  
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      query,
      documents: chunks.map(c => c.chunk_content),
      top_n: topK,
      top_k: topK,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible rerank failed: ${error}`);
  }

  const data: unknown = await response.json();
  const format = config.responseFormat || "auto";
  const results = extractResultsFromResponse(data, format);
  
  const sortedResults = results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  return sortedResults.map((r, newRank) => ({
    chunk: chunks[r.index],
    relevanceScore: r.score,
    originalRank: r.index,
    newRank,
  }));
}

function passthrough(
  chunks: HybridSearchChunk[],
  topK: number
): RerankResult[] {
  return chunks.slice(0, topK).map((chunk, index) => ({
    chunk,
    relevanceScore: chunk.combined_score,
    originalRank: index,
    newRank: index,
  }));
}

export async function rerankChunks(
  query: string,
  chunks: HybridSearchChunk[],
  config: RerankerConfig,
  options: RerankOptions = {}
): Promise<RerankResult[]> {
  const { topK = 20, returnOriginalOrder = false } = options;
  
  if (chunks.length === 0) return [];
  if (!config.apiKey && config.provider !== "openai-compatible") {
    return passthrough(chunks, topK);
  }
  if (config.provider === "openai-compatible" && !config.baseUrl) {
    return passthrough(chunks, topK);
  }

  let results: RerankResult[];

  switch (config.provider) {
    case "cohere":
      results = await rerankWithCohere(query, chunks, config, topK);
      break;
    case "jina":
      results = await rerankWithJina(query, chunks, config, topK);
      break;
    case "voyage":
      results = await rerankWithVoyage(query, chunks, config, topK);
      break;
    case "aliyun":
      results = await rerankWithAliyun(query, chunks, config, topK);
      break;
    case "openai-compatible":
      results = await rerankWithOpenAICompatible(query, chunks, config, topK);
      break;
    default:
      results = passthrough(chunks, topK);
      break;
  }

  if (returnOriginalOrder) {
    results.sort((a, b) => a.originalRank - b.originalRank);
  }

  return results;
}

export async function hybridSearchWithReranking(
  searchResults: HybridSearchChunk[],
  query: string,
  rerankerConfig: BaseRerankerConfig | null,
  topK: number = 20
): Promise<HybridSearchChunk[]> {
  if (!rerankerConfig || !rerankerConfig.enabled) {
    return searchResults.slice(0, topK);
  }

  if (rerankerConfig.provider === "none") {
    return searchResults.slice(0, topK);
  }

  const config: RerankerConfig = {
    provider: rerankerConfig.provider,
    apiKey: rerankerConfig.apiKey,
    model: rerankerConfig.model,
    baseUrl: rerankerConfig.baseUrl,
    responseFormat: rerankerConfig.responseFormat,
    customHeaders: rerankerConfig.customHeaders,
  };

  const reranked = await rerankChunks(query, searchResults, config, { topK });
  
  return reranked.map(r => ({
    ...r.chunk,
    combined_score: r.relevanceScore,
  }));
}
