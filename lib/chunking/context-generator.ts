import type { ChatConfig } from "@/lib/supabase/types";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface ContextResult {
  original: string;
  context: string;
  contextualized: string;
}

const CONTEXT_PROMPT_TEMPLATE = `<document>
{document}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk}
</chunk>

Please give a short succinct context (2-3 sentences in the same language as the document) to situate this chunk within the overall document for the purposes of improving search retrieval. Answer only with the succinct context and nothing else.`;

function buildContextPrompt(document: string, chunk: string, title?: string): string {
  const docContent = title ? `Title: ${title}\n\n${document}` : document;
  return CONTEXT_PROMPT_TEMPLATE
    .replace("{document}", docContent)
    .replace("{chunk}", chunk);
}

function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.replace(/[\u4e00-\u9fff]/g, " ").split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil(chineseChars * 1.5 + otherChars * 1.3);
}

function truncateDocument(document: string, maxTokens: number): string {
  const currentTokens = estimateTokens(document);
  if (currentTokens <= maxTokens) {
    return document;
  }
  
  const ratio = maxTokens / currentTokens;
  const targetLength = Math.floor(document.length * ratio * 0.9);
  return document.substring(0, targetLength) + "\n\n[Document truncated for context generation...]";
}

export class ContextGenerator {
  private cache: Map<string, string> = new Map();
  private readonly chatConfig: ChatConfig;
  private readonly maxDocumentTokens: number;

  constructor(chatConfig: ChatConfig, maxDocumentTokens: number = 8000) {
    this.chatConfig = chatConfig;
    this.maxDocumentTokens = maxDocumentTokens;
  }

  private computeCacheKey(document: string, chunk: string): string {
    const combined = `${document.substring(0, 500)}::${chunk}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(12, "0");
  }

  async generateContext(
    document: string,
    chunk: string,
    title?: string
  ): Promise<string> {
    const cacheKey = this.computeCacheKey(document, chunk);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const truncatedDoc = truncateDocument(document, this.maxDocumentTokens);
    const prompt = buildContextPrompt(truncatedDoc, chunk, title);

    let context: string;

    if (this.chatConfig.provider === "anthropic") {
      context = await this.callAnthropic(prompt);
    } else {
      context = await this.callOpenAICompatible(prompt);
    }

    this.cache.set(cacheKey, context);
    return context;
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const client = new Anthropic({
      apiKey: this.chatConfig.apiKey,
      baseURL: this.chatConfig.baseUrl || undefined,
    });

    const response = await client.messages.create({
      model: this.chatConfig.model || "claude-3-haiku-20240307",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      return content.text.trim();
    }
    return "";
  }

  private async callOpenAICompatible(prompt: string): Promise<string> {
    const client = new OpenAI({
      apiKey: this.chatConfig.apiKey,
      baseURL: this.chatConfig.baseUrl,
    });

    const response = await client.chat.completions.create({
      model: this.chatConfig.model || "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }

  async generateContextBatch(
    document: string,
    chunks: string[],
    title?: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<ContextResult[]> {
    const results: ContextResult[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const context = await this.generateContext(document, chunk, title);
      
      results.push({
        original: chunk,
        context,
        contextualized: context ? `${context}\n\n${chunk}` : chunk,
      });

      if (onProgress) {
        onProgress(i + 1, chunks.length);
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export async function generateChunkContext(
  document: string,
  chunk: string,
  chatConfig: ChatConfig,
  title?: string,
  maxDocumentTokens: number = 8000
): Promise<string> {
  const generator = new ContextGenerator(chatConfig, maxDocumentTokens);
  return generator.generateContext(document, chunk, title);
}
