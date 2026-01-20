import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { streamText, convertToModelMessages, UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatConfig, HybridSearchChunk } from "@/lib/supabase/types";
import { generateSingleEmbedding, hybridSearchChunksMultiKb, getEmbeddingConfig } from "@/lib/embeddings";
import { extractErrorMessage } from "@/lib/error-extractor";

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
    }: {
      messages: UIMessage[];
      system?: string;
      kbIds?: string[];
    } = body;

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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

    if (kbIds && kbIds.length > 0 && userQuery) {
      try {
        const embeddingConfig = await getEmbeddingConfig(supabase);
        const queryEmbedding = await generateSingleEmbedding(userQuery, embeddingConfig);

        contextChunks = await hybridSearchChunksMultiKb(
          supabase,
          userQuery,
          queryEmbedding,
          kbIds,
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
     let modelError: Error | null = null;

     const result = streamText({
       model,
       system: systemPrompt,
       messages: modelMessages,
       maxOutputTokens: chatConfig.maxTokens || 2048,
       temperature: chatConfig.temperature ?? 0.7,
        onError: async (error) => {
          let errorMessage = "Unknown error";
          
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === "object" && error !== null) {
            const err = error as Record<string, unknown>;
            if (err.error && typeof err.error === "object") {
              const innerErr = err.error as Record<string, unknown>;
              if (typeof innerErr.message === "string") {
                errorMessage = innerErr.message;
              } else {
                errorMessage = JSON.stringify(err.error);
              }
            } else if (typeof err.message === "string") {
              errorMessage = err.message;
            } else {
              errorMessage = JSON.stringify(error);
            }
          } else {
            errorMessage = String(error);
          }
          
          modelError = new Error(errorMessage);
        },
     });

     const encoder = new TextEncoder();
     const customStream = new ReadableStream({
       async start(controller) {
         try {
           for await (const chunk of result.textStream) {
             if (modelError) {
               throw modelError;
             }
             controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`));
           }
           
           if (modelError) {
             throw modelError;
           }
           
           controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish", reason: "done" })}\n\n`));
         } catch (error) {
           const finalError = modelError || error;
           const errorMessage = extractErrorMessage(finalError);
           controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`));
         }
         controller.close();
       },
     });

     return new Response(customStream, {
       headers: {
         "Content-Type": "text/event-stream",
         "Cache-Control": "no-cache",
         "Connection": "keep-alive",
       },
     });
  } catch (error) {
    console.error("Assistant chat error:", error);
    const errorMessage = extractErrorMessage(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
