import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfig, ChatMessageMetadata, Json, HybridSearchChunk, RerankerConfig, SearchType, PromptConfig } from "@/lib/supabase/types";
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createAdminClient();
    const { id: sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const beforeId = searchParams.get("beforeId");

    if (!operatorId) {
      return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
    }

    const canAccess = await hasPermission(supabase, operatorId, Permissions.CHAT_ACCESS);
    if (!canAccess) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .eq("user_id", operatorId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let query = supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (beforeId) {
      const { data: beforeMsg } = await supabase
        .from("chat_messages")
        .select("created_at")
        .eq("id", beforeId)
        .single();

      if (beforeMsg) {
        query = query.lt("created_at", beforeMsg.created_at);
      }
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createAdminClient();
  
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { operatorId, content, useKnowledgeBase = true, userMessageId } = body as {
      operatorId: string;
      content: string;
      useKnowledgeBase?: boolean;
      userMessageId?: string;
    };

    if (!operatorId || !content) {
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

    if (!session.kb_ids || session.kb_ids.length === 0) {
      return NextResponse.json({ error: "Knowledge base selection required" }, { status: 400 });
    }

    const { data: chatConfigData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "chat_config")
      .single();

    if (!chatConfigData?.value) {
      return NextResponse.json({ error: "Chat not configured. Please configure AI settings first." }, { status: 400 });
    }

    const chatConfig = chatConfigData.value as unknown as ChatConfig;
    if (!chatConfig.apiKey) {
      return NextResponse.json({ error: "Chat API key not configured" }, { status: 400 });
    }

    const { data: userMessage, error: userMsgError } = await supabase
      .from("chat_messages")
      .insert({
        ...(userMessageId ? { id: userMessageId } : {}),
        session_id: sessionId,
        role: "user" as const,
        content,
        status: "completed" as const,
        metadata: {} as Json,
      })
      .select()
      .single();

    if (userMsgError) throw userMsgError;

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
    
    const retrievalDebug = {
      enabled: useKnowledgeBase,
      kbIds: session.kb_ids || [],
      kbCount: session.kb_ids?.length || 0,
      searchExecuted: false,
      chunksFound: 0,
      error: null as string | null,
      embeddingModel: null as string | null,
      searchParams: null as { matchCount: number; matchThreshold: number; vectorWeight: number } | null,
      contextEnabled: false,
      hybridSearchUsed: false,
      rerankEnabled: false,
      rerankDegraded: false,
      candidatesBeforeRerank: 0,
      rerankerProvider: null as string | null,
      resultTypes: null as Record<SearchType, number> | null,
    };
    
    if (useKnowledgeBase && session.kb_ids && session.kb_ids.length > 0) {
      try {
        const embeddingConfig = await getEmbeddingConfig(supabase);
        retrievalDebug.embeddingModel = embeddingConfig.model;
        retrievalDebug.contextEnabled = embeddingConfig.contextEnabled ?? false;
        
        const { data: rerankerConfigData } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "reranker_config")
          .single();
        
        const rerankerConfig = rerankerConfigData?.value as RerankerConfig | null;
        const isRerankEnabled = rerankerConfig?.enabled && rerankerConfig?.provider !== "none";
        retrievalDebug.rerankEnabled = isRerankEnabled ?? false;
        if (isRerankEnabled) {
          retrievalDebug.rerankerProvider = rerankerConfig?.provider ?? null;
        }
        
        const baseMatchCount = 5;
        const candidateCount = isRerankEnabled ? Math.min(baseMatchCount * 5, 100) : baseMatchCount;
        const matchThreshold = isRerankEnabled ? 0.15 : 0.3;
        
        retrievalDebug.searchParams = { matchCount: candidateCount, matchThreshold, vectorWeight: 0.5 };
        
        const queryEmbedding = await generateSingleEmbedding(content, embeddingConfig);
        retrievalDebug.searchExecuted = true;
        retrievalDebug.hybridSearchUsed = true;
        
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
        
        retrievalDebug.candidatesBeforeRerank = hybridResults.length;
        
        if (isRerankEnabled && hybridResults.length > 0) {
          const rerankResult = await hybridSearchWithReranking(
            hybridResults,
            content,
            rerankerConfig,
            baseMatchCount
          );
          contextChunks = rerankResult.chunks;
          retrievalDebug.rerankEnabled = rerankResult.reranked;
          retrievalDebug.rerankDegraded = rerankResult.degraded;
        } else {
          contextChunks = hybridResults.slice(0, baseMatchCount);
        }
        
        retrievalDebug.chunksFound = contextChunks.length;
        
        const resultTypes: Record<SearchType, number> = { vector: 0, bm25: 0, hybrid: 0 };
        for (const chunk of contextChunks) {
          if (chunk.search_type) {
            resultTypes[chunk.search_type] = (resultTypes[chunk.search_type] || 0) + 1;
          }
        }
        retrievalDebug.resultTypes = resultTypes;
      } catch (searchError) {
        console.error("Knowledge base search error:", searchError);
        if (searchError instanceof Error) {
          retrievalDebug.error = searchError.message;
        } else if (typeof searchError === 'object' && searchError !== null) {
          retrievalDebug.error = JSON.stringify(searchError);
        } else {
          retrievalDebug.error = String(searchError);
        }
      }
    }

    const { data: previousMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .neq("id", userMessage.id)
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

        if (!session.title && text) {
          const title = text.substring(0, 50) + (text.length > 50 ? "..." : "");
          await supabase
            .from("chat_sessions")
            .update({ title })
            .eq("id", sessionId);
        }
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "user_message", message: userMessage })}\n\n`));
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: "retrieval_debug", 
          debug: retrievalDebug,
          contextCount: contextChunks.length,
        })}\n\n`));
        
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
    console.error("Chat message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
