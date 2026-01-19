import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfig, ChatMessageMetadata, Json, HybridSearchChunk, RerankerConfig, PromptConfig } from "@/lib/supabase/types";
import { DEFAULT_PROMPTS } from "@/lib/supabase/types";
import { generateSingleEmbedding, hybridSearchChunksMultiKb, getEmbeddingConfig } from "@/lib/embeddings";
import { hybridSearchWithReranking } from "@/lib/reranker";

interface RouteParams {
  params: Promise<{ id: string }>;
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createAdminClient();
  
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { operatorId, parentMessageId } = body as {
      operatorId: string;
      parentMessageId: string;
    };

    if (!operatorId || !parentMessageId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canAccess = await hasPermission(supabase, operatorId, Permissions.CHAT_ACCESS);
    if (!canAccess) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", operatorId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: parentMessage } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("id", parentMessageId)
      .eq("session_id", sessionId)
      .single();

    if (!parentMessage || parentMessage.role !== "user") {
      return NextResponse.json({ error: "Invalid parent message" }, { status: 400 });
    }

    const content = parentMessage.content;

    const { data: chatConfigData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "chat_config")
      .single();

    if (!chatConfigData?.value) {
      return NextResponse.json({ error: "Chat not configured" }, { status: 400 });
    }

    const chatConfig = chatConfigData.value as unknown as ChatConfig;
    if (!chatConfig.apiKey) {
      return NextResponse.json({ error: "Chat API key not configured" }, { status: 400 });
    }

    await supabase
      .from("chat_messages")
      .delete()
      .eq("session_id", sessionId)
      .gt("created_at", parentMessage.created_at);

    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        role: "assistant" as const,
        content: "",
        status: "pending" as const,
        metadata: {} as Json,
      })
      .select()
      .single();

    if (assistantMsgError) throw assistantMsgError;

    let contextChunks: HybridSearchChunk[] = [];

    if (session.kb_ids && session.kb_ids.length > 0) {
      try {
        const embeddingConfig = await getEmbeddingConfig(supabase);

        const { data: rerankerConfigData } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "reranker_config")
          .single();

        const rerankerConfig = rerankerConfigData?.value as RerankerConfig | null;
        const isRerankEnabled = rerankerConfig?.enabled && rerankerConfig?.provider !== "none";

        const baseMatchCount = 5;
        const candidateCount = isRerankEnabled ? Math.min(baseMatchCount * 5, 100) : baseMatchCount;
        const matchThreshold = isRerankEnabled ? 0.15 : 0.3;

        const queryEmbedding = await generateSingleEmbedding(content, embeddingConfig);

        const hybridResults = await hybridSearchChunksMultiKb(
          supabase,
          content,
          queryEmbedding,
          session.kb_ids,
          {
            matchCount: candidateCount,
            matchThreshold,
            vectorWeight: 0.5,
          }
        );

        if (isRerankEnabled && hybridResults.length > 0) {
          const rerankResult = await hybridSearchWithReranking(
            hybridResults,
            content,
            rerankerConfig,
            baseMatchCount
          );
          contextChunks = rerankResult.chunks;
        } else {
          contextChunks = hybridResults.slice(0, baseMatchCount);
        }
      } catch (searchError) {
        console.error("Knowledge base search error:", searchError);
      }
    }

    const { data: previousMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .neq("id", parentMessage.id)
      .neq("id", assistantMessage.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const { data: promptConfigData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "prompt_config")
      .single();

    const promptConfig: PromptConfig = promptConfigData?.value
      ? { ...DEFAULT_PROMPTS, ...(promptConfigData.value as Partial<PromptConfig>) }
      : DEFAULT_PROMPTS;

    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

    const customPrompt = (session.settings as Record<string, unknown>)?.systemPrompt as string | undefined;

    let systemPrompt: string;
    if (contextChunks.length > 0) {
      const contextText = contextChunks
        .map((chunk, i) => `[${i + 1}] ${chunk.document_title}:\n${chunk.chunk_content}`)
        .join("\n\n");

      systemPrompt = promptConfig.chatWithContext
        .replace("{{customPrompt}}", customPrompt ? `Additional instructions: ${customPrompt}` : "")
        .replace("{{context}}", contextText);
    } else {
      systemPrompt = promptConfig.chatNoContext;
    }

    messages.push({ role: "system", content: systemPrompt });

    if (previousMessages) {
      for (const msg of previousMessages) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content });

    await supabase
      .from("chat_messages")
      .update({ status: "streaming" as const })
      .eq("id", assistantMessage.id);

    const model = createProvider(chatConfig);

    const result = streamText({
      model,
      messages,
      maxOutputTokens: chatConfig.maxTokens || 2048,
      temperature: chatConfig.temperature ?? 0.7,
      onFinish: async ({ text, usage, finishReason }) => {
        const metadata: ChatMessageMetadata = {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: (usage?.inputTokens || 0) + (usage?.outputTokens || 0),
          model: chatConfig.model,
          finishReason,
        };

        if (contextChunks.length > 0) {
          metadata.references = contextChunks.map(chunk => ({
            chunkId: chunk.chunk_id,
            documentId: chunk.document_id,
            documentTitle: chunk.document_title,
            sourceUrl: chunk.document_source_url,
            contextSummary: chunk.chunk_context,
            content: chunk.chunk_content.substring(0, 300),
            similarity: chunk.similarity,
            chunkIndex: chunk.chunk_index,
          }));
        }

        await supabase
          .from("chat_messages")
          .update({
            content: text,
            status: "completed" as const,
            metadata: metadata as unknown as Json,
          })
          .eq("id", assistantMessage.id);
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "assistant_start", messageId: assistantMessage.id })}\n\n`));

        if (contextChunks.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "context", 
            references: contextChunks.map(c => ({
              documentId: c.document_id,
              documentTitle: c.document_title,
              sourceUrl: c.document_source_url,
              contextSummary: c.chunk_context,
              content: c.chunk_content.substring(0, 300),
              similarity: c.similarity,
              chunkIndex: c.chunk_index,
            }))
          })}\n\n`));
        }

        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`));
          }

          const usage = await result.usage;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "done",
            messageId: assistantMessage.id,
            usage: {
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
            }
          })}\n\n`));
        } catch (streamError) {
          console.error("Stream error:", streamError);
          const errorMessage = streamError instanceof Error ? streamError.message : "Stream failed";

          await supabase
            .from("chat_messages")
            .update({
              status: "failed" as const,
              metadata: { error: errorMessage } as unknown as Json,
            })
            .eq("id", assistantMessage.id);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Regenerate message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
