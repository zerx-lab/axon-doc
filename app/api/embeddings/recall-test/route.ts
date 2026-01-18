import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { generateEmbeddings } from "@/lib/embeddings";
import type { EmbeddingConfig } from "@/lib/supabase/types";

interface RecallTestRequest {
  operatorId: string;
  query: string;
  candidates: string[];
  config: EmbeddingConfig;
}

function cosineSimilarity(a: number[], b: number[]): number {
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
    const body: RecallTestRequest = await request.json();
    const { operatorId, query, candidates, config } = body;

    if (!operatorId || !query || !candidates || candidates.length === 0 || !config) {
      return NextResponse.json(
        { error: "Missing required fields: operatorId, query, candidates, config" },
        { status: 400 }
      );
    }

    if (candidates.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 candidate texts allowed" },
        { status: 400 }
      );
    }

    const canManage = await hasPermission(supabase, operatorId, Permissions.SYSTEM_SETTINGS);
    if (!canManage) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    let effectiveConfig = { ...config };
    if (!config.apiKey || config.apiKey === "********") {
      const { data: savedConfig } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "embedding_config")
        .single();

      if (savedConfig?.value && typeof savedConfig.value === "object") {
        const savedValue = savedConfig.value as { apiKey?: string };
        if (savedValue.apiKey) {
          effectiveConfig.apiKey = savedValue.apiKey;
        }
      }
    }

    if (!effectiveConfig.apiKey || effectiveConfig.apiKey === "********") {
      return NextResponse.json(
        { error: "API Key is required. Please configure it in the settings." },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    const allTexts = [query, ...candidates];
    const embeddings = await generateEmbeddings(allTexts, effectiveConfig);
    
    const queryEmbedding = embeddings[0];
    const candidateEmbeddings = embeddings.slice(1);

    const results = candidates.map((text, index) => ({
      index,
      text,
      similarity: Math.round(cosineSimilarity(queryEmbedding, candidateEmbeddings[index]) * 10000) / 100,
    }));

    results.sort((a, b) => b.similarity - a.similarity);

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      result: {
        query,
        responseTime,
        dimensions: queryEmbedding.length,
        results,
      },
    });
  } catch (error) {
    console.error("Recall test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recall test failed" },
      { status: 500 }
    );
  }
}
