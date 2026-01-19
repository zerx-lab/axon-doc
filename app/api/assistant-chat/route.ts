import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { streamText, convertToModelMessages, UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfig, HybridSearchChunk } from "@/lib/supabase/types";
import { generateSingleEmbedding, hybridSearchChunksMultiKb, getEmbeddingConfig } from "@/lib/embeddings";
import { isSuperAdmin } from "@/lib/supabase/access";

export const maxDuration = 60;

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

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const {
      messages,
      system: clientSystem,
      kbIds,
      operatorId,
    }: {
      messages: UIMessage[];
      system?: string;
      kbIds?: string[];
      operatorId?: string;
    } = body;

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate KB access if kbIds are provided
    let validatedKbIds: string[] = [];
    if (kbIds && kbIds.length > 0) {
      if (!operatorId) {
        return new Response(
          JSON.stringify({ error: "operatorId required when using knowledge bases" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check if user is super admin
      const userIsSuperAdmin = await isSuperAdmin(supabase, operatorId);

      if (userIsSuperAdmin) {
        // Super admin can access all KBs
        validatedKbIds = kbIds;
      } else {
        // Verify user owns the requested KBs
        const { data: userKbs } = await supabase
          .from("knowledge_bases")
          .select("id")
          .eq("user_id", operatorId)
          .in("id", kbIds);

        validatedKbIds = userKbs?.map(kb => kb.id) || [];

        // Log if some KBs were filtered out (for debugging, not exposed to user)
        if (validatedKbIds.length !== kbIds.length) {
          console.debug(
            `User ${operatorId} requested ${kbIds.length} KBs but only has access to ${validatedKbIds.length}`
          );
        }
      }
    }

    const { data: chatConfigData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "chat_config")
      .single();

    if (!chatConfigData?.value) {
      return new Response(
        JSON.stringify({ error: "Chat not configured. Please configure AI settings first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const chatConfig = chatConfigData.value as unknown as ChatConfig;
    if (!chatConfig.apiKey) {
      return new Response(
        JSON.stringify({ error: "Chat API key not configured" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const userQuery = lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");

    let contextChunks: HybridSearchChunk[] = [];
    let systemPrompt = clientSystem || "You are a helpful AI assistant. Answer questions accurately and concisely.";

    if (validatedKbIds.length > 0 && userQuery) {
      try {
        const embeddingConfig = await getEmbeddingConfig(supabase);
        const queryEmbedding = await generateSingleEmbedding(userQuery, embeddingConfig);

        contextChunks = await hybridSearchChunksMultiKb(
          supabase,
          userQuery,
          queryEmbedding,
          validatedKbIds,
          {
            matchCount: 5,
            matchThreshold: 0.3,
            vectorWeight: 0.5,
          }
        );

        if (contextChunks.length > 0) {
          const contextText = contextChunks
            .map((chunk, i) => `[${i + 1}] ${chunk.document_title}:\n${chunk.chunk_content}`)
            .join("\n\n");

          systemPrompt += `\n\nUse the following context from the knowledge base to answer the user's question. If the context doesn't contain relevant information, say so.\n\nContext:\n${contextText}`;
        }
      } catch (searchError) {
        console.error("Knowledge base search error:", searchError);
      }
    }

    const model = createProvider(chatConfig);
    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: chatConfig.maxTokens || 2048,
      temperature: chatConfig.temperature ?? 0.7,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Assistant chat error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
