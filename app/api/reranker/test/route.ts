import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import type { RerankerResponseFormat } from "@/lib/supabase/types";

interface TestRerankerRequest {
  operatorId: string;
  query: string;
  documents: string[];
  config: {
    provider: "cohere" | "jina" | "voyage" | "aliyun" | "openai-compatible";
    baseUrl: string;
    apiKey: string;
    model: string;
    responseFormat?: RerankerResponseFormat;
  };
}

interface DetectedFormat {
  format: RerankerResponseFormat;
  confidence: "high" | "medium" | "low";
  reason: string;
}

function detectResponseFormat(data: unknown): DetectedFormat {
  const response = data as Record<string, unknown>;
  
  if (response.output && typeof response.output === "object") {
    const output = response.output as Record<string, unknown>;
    if (Array.isArray(output.results)) {
      return {
        format: "aliyun" as RerankerResponseFormat,
        confidence: "high",
        reason: "Response has 'output.results' structure (Aliyun DashScope format)",
      };
    }
  }
  
  if (Array.isArray(response.results)) {
    const results = response.results as Array<Record<string, unknown>>;
    if (results.length > 0) {
      const first = results[0];
      if ("document" in first && typeof first.document === "object") {
        return {
          format: "jina",
          confidence: "high",
          reason: "Response has 'results' array with 'document' object (Jina format)",
        };
      }
      if ("relevance_score" in first && typeof first.relevance_score === "number") {
        return {
          format: "cohere",
          confidence: "high",
          reason: "Response has 'results' array with 'relevance_score' (Cohere format)",
        };
      }
      if ("score" in first && typeof first.score === "number") {
        return {
          format: "cohere",
          confidence: "medium",
          reason: "Response has 'results' array with 'score' field (Cohere-like format)",
        };
      }
    }
    return {
      format: "cohere",
      confidence: "low",
      reason: "Response has 'results' array but unclear structure",
    };
  }
  
  if (Array.isArray(response.data)) {
    const results = response.data as Array<Record<string, unknown>>;
    if (results.length > 0) {
      const first = results[0];
      if ("relevance_score" in first || "score" in first) {
        return {
          format: "voyage",
          confidence: "high",
          reason: "Response has 'data' array with score field (Voyage format)",
        };
      }
    }
    return {
      format: "voyage",
      confidence: "medium",
      reason: "Response has 'data' array (Voyage-like format)",
    };
  }
  
  return {
    format: "auto",
    confidence: "low",
    reason: "Unable to determine format - no 'results' or 'data' array found",
  };
}

function extractResults(
  data: unknown,
  format: RerankerResponseFormat
): Array<{ index: number; score: number }> {
  const response = data as Record<string, unknown>;
  
  if (format === "auto") {
    const detected = detectResponseFormat(data);
    format = detected.format === "auto" ? "cohere" : detected.format;
  }
  
  let results: Array<Record<string, unknown>> = [];
  
  if (format === "aliyun") {
    const output = response.output as Record<string, unknown> | undefined;
    results = (output?.results as Array<Record<string, unknown>>) || [];
  } else if (format === "voyage") {
    results = (response.data as Array<Record<string, unknown>>) || [];
  } else {
    results = (response.results as Array<Record<string, unknown>>) || [];
  }
  
  return results.map(r => ({
    index: (r.index as number) ?? 0,
    score: (r.relevance_score as number) ?? (r.score as number) ?? 0,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: TestRerankerRequest = await request.json();
    const { operatorId, query, documents, config } = body;

    if (!operatorId || !query || !documents || documents.length === 0 || !config) {
      return NextResponse.json(
        { error: "Missing required fields: operatorId, query, documents, and config are required" },
        { status: 400 }
      );
    }

    const canManage = await hasPermission(supabase, operatorId, Permissions.SYSTEM_SETTINGS);
    if (!canManage) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (!config.apiKey || config.apiKey === "********") {
      const { data: savedConfig } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "reranker_config")
        .single();

      if (savedConfig?.value && typeof savedConfig.value === "object") {
        const savedValue = savedConfig.value as { apiKey?: string };
        if (savedValue.apiKey) {
          config.apiKey = savedValue.apiKey;
        }
      }
    }

    if (!config.apiKey || config.apiKey === "********") {
      return NextResponse.json(
        { error: "API Key is required. Please configure it in the settings." },
        { status: 400 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    let apiUrl = config.baseUrl;
    
    if (config.provider === "cohere" && !config.baseUrl) {
      apiUrl = "https://api.cohere.ai/v1/rerank";
    } else if (config.provider === "jina" && !config.baseUrl) {
      apiUrl = "https://api.jina.ai/v1/rerank";
    } else if (config.provider === "voyage" && !config.baseUrl) {
      apiUrl = "https://api.voyageai.com/v1/rerank";
    } else if (config.provider === "aliyun" && !config.baseUrl) {
      apiUrl = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";
    }

    if (!apiUrl) {
      return NextResponse.json(
        { error: "API Base URL is required for Custom API provider" },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    let requestBody: Record<string, unknown>;
    
    if (config.provider === "aliyun") {
      requestBody = {
        model: config.model || "gte-rerank-v2",
        input: {
          query,
          documents,
        },
        parameters: {
          return_documents: false,
          top_n: documents.length,
        },
      };
    } else {
      requestBody = {
        query,
        documents,
      };
      if (config.model) {
        requestBody.model = config.model;
      }
      requestBody.top_n = documents.length;
      requestBody.top_k = documents.length;
      requestBody.return_documents = false;
    }

    console.log(`[Reranker Test] Calling ${apiUrl} with model: ${config.model}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { 
          error: `API Error (${response.status}): ${errorText || "No response body"}`,
          details: { 
            status: response.status,
            url: apiUrl,
            model: config.model,
            provider: config.provider,
          }
        },
        { status: 400 }
      );
    }

    const rawResponse = await response.json();
    const detectedFormat = detectResponseFormat(rawResponse);
    const effectiveFormat = config.responseFormat || "auto";
    const results = extractResults(rawResponse, effectiveFormat);

    const sortedResults = results
      .sort((a, b) => b.score - a.score)
      .map((r, newRank) => ({
        originalIndex: r.index,
        newRank: newRank + 1,
        score: r.score,
        document: documents[r.index] || `[Document ${r.index}]`,
      }));

    return NextResponse.json({
      success: true,
      result: {
        responseTime,
        results: sortedResults,
        detectedFormat: detectedFormat.format,
        formatConfidence: detectedFormat.confidence,
        formatReason: detectedFormat.reason,
        rawResponsePreview: JSON.stringify(rawResponse).slice(0, 500),
      },
    });
  } catch (error) {
    console.error("Test reranker error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test failed" },
      { status: 500 }
    );
  }
}
