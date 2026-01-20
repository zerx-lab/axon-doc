import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission, isSuperAdmin } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import type { 
  KnowledgeBaseSettings, 
  SearchType, 
  HybridSearchChunk,
  RerankerConfig,
} from "@/lib/supabase/types";
import {
  generateSingleEmbedding,
  hybridSearchChunks,
  hybridSearchForReranking,
  getEmbeddingSettings,
} from "@/lib/embeddings";
import { rerankChunks } from "@/lib/reranker";

interface SearchRequestBody {
  operatorId: string;
  kbId: string;
  query: string;
  limit?: number;
  threshold?: number;
  searchType?: SearchType;
  vectorWeight?: number;
  enableReranking?: boolean;
  rerankerConfig?: RerankerConfig;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: SearchRequestBody = await request.json();
    const { 
      operatorId, 
      kbId, 
      query, 
      limit = 20, 
      threshold = 0.3,
      searchType = "hybrid",
      vectorWeight = 0.5,
      enableReranking = false,
      rerankerConfig,
    } = body;

    if (!operatorId || !kbId || !query) {
      return NextResponse.json(
        { error: "Missing required fields: operatorId, kbId, query" },
        { status: 400 }
      );
    }

    const canSearch = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_SEARCH);
    if (!canSearch) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: kb, error: kbError } = await supabase
      .from("knowledge_bases")
      .select("id, settings, user_id")
      .eq("id", kbId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    // Verify ownership: only owner or super admin can search the knowledge base
    if (kb.user_id !== operatorId) {
      const operatorIsSuperAdmin = await isSuperAdmin(supabase, operatorId);
      if (!operatorIsSuperAdmin) {
        return NextResponse.json({ error: "Access denied to this knowledge base" }, { status: 403 });
      }
    }

    const settings = getEmbeddingSettings(kb.settings as KnowledgeBaseSettings | null);
    const queryEmbedding = await generateSingleEmbedding(query, settings);
    
    let results: HybridSearchChunk[];
    let reranked = false;
    let degraded = false;

    if (enableReranking && rerankerConfig?.enabled && rerankerConfig.apiKey) {
      const candidates = await hybridSearchForReranking(
        supabase,
        query,
        queryEmbedding,
        kbId,
        Math.min(limit * 5, 150),
        Math.max(0, Math.min(threshold, 1)) * 0.5,
        Math.max(0, Math.min(vectorWeight, 1))
      );

      if (candidates.length > 0 && rerankerConfig.provider !== "none") {
        try {
          const rerankedResults = await rerankChunks(
            query,
            candidates,
            {
              provider: rerankerConfig.provider,
              apiKey: rerankerConfig.apiKey,
              model: rerankerConfig.model,
              baseUrl: rerankerConfig.baseUrl,
              responseFormat: rerankerConfig.responseFormat,
              customHeaders: rerankerConfig.customHeaders,
            },
            { topK: limit }
          );

          results = rerankedResults.map(r => ({
            chunk_id: r.chunk.chunk_id,
            document_id: r.chunk.document_id,
            document_title: r.chunk.document_title,
            document_source_url: r.chunk.document_source_url,
            chunk_content: r.chunk.chunk_content,
            chunk_context: r.chunk.chunk_context,
            chunk_index: r.chunk.chunk_index,
            similarity: r.chunk.similarity,
            bm25_rank: r.chunk.bm25_rank,
            vector_rank: r.chunk.vector_rank,
            combined_score: r.relevanceScore,
            search_type: r.chunk.search_type,
          }));
          reranked = true;
        } catch (rerankError) {
          // Reranking failed - silently fallback to hybrid search results
          console.debug("Reranking failed, falling back to candidates:", rerankError);
          results = candidates.slice(0, limit);
          degraded = true;
        }
      } else {
        results = candidates.slice(0, limit);
      }
    } else {
      results = await hybridSearchChunks(
        supabase,
        query,
        queryEmbedding,
        kbId,
        {
          searchType,
          matchCount: Math.min(limit, 50),
          matchThreshold: Math.max(0, Math.min(threshold, 1)),
          vectorWeight: Math.max(0, Math.min(vectorWeight, 1)),
        }
      );
    }

    const groupedByDocument: Record<string, {
      documentId: string;
      documentTitle: string;
      chunks: Array<{
        chunkId: string;
        chunkIndex: number;
        content: string;
        similarity: number;
        combinedScore: number;
        searchType: SearchType;
      }>;
      maxScore: number;
    }> = {};

    for (const result of results) {
      if (!groupedByDocument[result.document_id]) {
        groupedByDocument[result.document_id] = {
          documentId: result.document_id,
          documentTitle: result.document_title,
          chunks: [],
          maxScore: 0,
        };
      }

      groupedByDocument[result.document_id].chunks.push({
        chunkId: result.chunk_id,
        chunkIndex: result.chunk_index,
        content: result.chunk_content,
        similarity: result.similarity,
        combinedScore: result.combined_score,
        searchType: result.search_type,
      });

      if (result.combined_score > groupedByDocument[result.document_id].maxScore) {
        groupedByDocument[result.document_id].maxScore = result.combined_score;
      }
    }

    const documents = Object.values(groupedByDocument)
      .sort((a, b) => b.maxScore - a.maxScore);

    const searchStats = computeSearchStats(results);

    return NextResponse.json({
      success: true,
      query,
      searchType,
      reranked,
      degraded,
      results: documents,
      totalChunks: results.length,
      stats: searchStats,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function computeSearchStats(results: HybridSearchChunk[]) {
  const vectorOnly = results.filter(r => r.search_type === "vector").length;
  const bm25Only = results.filter(r => r.search_type === "bm25").length;
  const hybrid = results.filter(r => r.search_type === "hybrid").length;
  
  return {
    vectorOnly,
    bm25Only,
    hybrid,
    total: results.length,
  };
}
