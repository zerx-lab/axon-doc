export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EmbeddingStatus = "pending" | "processing" | "completed" | "failed" | "outdated";

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          permissions: string[];
          is_system: boolean;
          is_super_admin: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          permissions?: string[];
          is_system?: boolean;
          is_super_admin?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          permissions?: string[];
          is_system?: boolean;
          is_super_admin?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          username: string;
          password_hash: string;
          role_id: string;
          display_name: string | null;
          avatar: string | null;
          last_login_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          password_hash: string;
          role_id: string;
          display_name?: string | null;
          avatar?: string | null;
          last_login_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          password_hash?: string;
          role_id?: string;
          display_name?: string | null;
          avatar?: string | null;
          last_login_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          }
        ];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          expires_at: string;
          user_agent: string | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          expires_at: string;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          expires_at?: string;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      knowledge_bases: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          document_count: number;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          document_count?: number;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          document_count?: number;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      documents: {
        Row: {
          id: string;
          kb_id: string;
          user_id: string;
          title: string;
          content: string | null;
          content_hash: string | null;
          file_type: string;
          word_count: number;
          char_count: number;
          status: string;
          embedding_status: EmbeddingStatus;
          metadata: Json;
          source_url: string | null;
          source_type: string | null;
          source_label: string | null;
          parent_url: string | null;
          crawl_depth: number | null;
          crawled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kb_id: string;
          user_id: string;
          title: string;
          content?: string | null;
          content_hash?: string | null;
          file_type?: string;
          word_count?: number;
          char_count?: number;
          status?: string;
          embedding_status?: EmbeddingStatus;
          metadata?: Json;
          source_url?: string | null;
          source_type?: string | null;
          source_label?: string | null;
          parent_url?: string | null;
          crawl_depth?: number | null;
          crawled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kb_id?: string;
          user_id?: string;
          title?: string;
          content?: string | null;
          content_hash?: string | null;
          file_type?: string;
          word_count?: number;
          char_count?: number;
          status?: string;
          embedding_status?: EmbeddingStatus;
          metadata?: Json;
          source_url?: string | null;
          source_type?: string | null;
          source_label?: string | null;
          parent_url?: string | null;
          crawl_depth?: number | null;
          crawled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_kb_id_fkey";
            columns: ["kb_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_bases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          chunk_index: number;
          original_content: string;
          context_summary: string | null;
          contextualized_content: string;
          content_hash: string;
          context_hash: string | null;
          token_count: number;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          chunk_index: number;
          original_content: string;
          context_summary?: string | null;
          contextualized_content: string;
          content_hash: string;
          context_hash?: string | null;
          token_count?: number;
          embedding?: number[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          chunk_index?: number;
          original_content?: string;
          context_summary?: string | null;
          contextualized_content?: string;
          content_hash?: string;
          context_hash?: string | null;
          token_count?: number;
          embedding?: number[] | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          }
        ];
      };
      system_settings: {
        Row: {
          id: string;
          key: string;
          value: Json;
          description: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: Json;
          description?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          description?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      crawl_jobs: {
        Row: {
          id: string;
          url: string;
          kb_id: string;
          user_id: string | null;
          mode: string;
          max_depth: number;
          max_pages: number;
          source_label: string | null;
          status: string;
          progress: number;
          pages_crawled: number;
          total_pages: number;
          failed_pages: number;
          error: string | null;
          settings: Json;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          url: string;
          kb_id: string;
          user_id?: string | null;
          mode?: string;
          max_depth?: number;
          max_pages?: number;
          source_label?: string | null;
          status?: string;
          progress?: number;
          pages_crawled?: number;
          total_pages?: number;
          failed_pages?: number;
          error?: string | null;
          settings?: Json;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          url?: string;
          kb_id?: string;
          user_id?: string | null;
          mode?: string;
          max_depth?: number;
          max_pages?: number;
          source_label?: string | null;
          status?: string;
          progress?: number;
          pages_crawled?: number;
          total_pages?: number;
          failed_pages?: number;
          error?: string | null;
          settings?: Json;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crawl_jobs_kb_id_fkey";
            columns: ["kb_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_bases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crawl_jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      crawl_pages: {
        Row: {
          id: string;
          job_id: string;
          url: string;
          status: string;
          document_id: string | null;
          content_hash: string | null;
          title: string | null;
          depth: number;
          error_message: string | null;
          crawled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          url: string;
          status?: string;
          document_id?: string | null;
          content_hash?: string | null;
          title?: string | null;
          depth?: number;
          error_message?: string | null;
          crawled_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          url?: string;
          status?: string;
          document_id?: string | null;
          content_hash?: string | null;
          title?: string | null;
          depth?: number;
          error_message?: string | null;
          crawled_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crawl_pages_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "crawl_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crawl_pages_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          }
        ];
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          kb_ids: string[];
          settings: Json;
          status: ChatSessionStatus;
          message_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          kb_ids?: string[];
          settings?: Json;
          status?: ChatSessionStatus;
          message_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          kb_ids?: string[];
          settings?: Json;
          status?: ChatSessionStatus;
          message_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: ChatMessageRole;
          content: string;
          status: ChatMessageStatus;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: ChatMessageRole;
          content?: string;
          status?: ChatMessageStatus;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: ChatMessageRole;
          content?: string;
          status?: ChatMessageStatus;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_document_count: {
        Args: { kb_id_param: string };
        Returns: void;
      };
      decrement_document_count: {
        Args: { kb_id_param: string };
        Returns: void;
      };
      match_document_chunks: {
        Args: {
          query_embedding: number[];
          match_count: number;
          match_threshold: number;
          filter_kb_id?: string;
        };
        Returns: Array<{
          chunk_id: string;
          document_id: string;
          document_title: string;
          document_source_url: string | null;
          chunk_content: string;
          chunk_context: string | null;
          chunk_index: number;
          similarity: number;
        }>;
      };
      bm25_search_chunks: {
        Args: {
          query_text: string;
          filter_kb_id?: string;
          match_count?: number;
        };
        Returns: BM25SearchRawResult[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type ChatSessionStatus = "active" | "archived";
export type ChatMessageRole = "user" | "assistant" | "system";
export type ChatMessageStatus = "pending" | "streaming" | "completed" | "failed";

export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type User = Database["public"]["Tables"]["users"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type KnowledgeBase = Database["public"]["Tables"]["knowledge_bases"]["Row"];
export type Document = Database["public"]["Tables"]["documents"]["Row"];

export type SafeUser = Omit<User, "password_hash">;
export type DocumentChunk = Database["public"]["Tables"]["document_chunks"]["Row"];
export type ChatSession = Database["public"]["Tables"]["chat_sessions"]["Row"];
export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];

export interface UserWithRole extends SafeUser {
  role: Role;
  permissions: string[];
  isSuperAdmin: boolean;
}

export interface EmbeddingConfig {
  provider: "openai" | "azure" | "local" | "aliyun";
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  batchSize: number;
  chunkSize: number;
  chunkOverlap: number;
  contextEnabled?: boolean;
}

export type ChatProvider = "openai" | "anthropic" | "openai-compatible";

export interface ChatConfig {
  provider: ChatProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface EmbeddingSettings {
  model: string;
  provider: "openai" | "local";
  dimensions: number;
  chunkSize: number;
  chunkOverlap: number;
}

export type SystemSetting = Database["public"]["Tables"]["system_settings"]["Row"];

// Crawl Types
export type CrawlJobStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type CrawlJobMode = "single_url" | "full_site";
export type CrawlPageStatus = "pending" | "crawling" | "completed" | "failed" | "skipped";

export interface CrawlJob {
  id: string;
  url: string;
  kb_id: string;
  user_id: string | null;
  mode: CrawlJobMode;
  max_depth: number;
  max_pages: number;
  source_label: string | null;
  status: CrawlJobStatus;
  progress: number;
  pages_crawled: number;
  total_pages: number;
  failed_pages: number;
  error: string | null;
  settings: Json;
  created_at: string;
  completed_at: string | null;
}

export interface CrawlPage {
  id: string;
  job_id: string;
  url: string;
  status: CrawlPageStatus;
  document_id: string | null;
  content_hash: string | null;
  title: string | null;
  depth: number;
  error_message: string | null;
  crawled_at: string | null;
  created_at: string;
}

export interface CrawlJobWithPages extends CrawlJob {
  pages?: CrawlPage[];
}

export interface CrawlProgress {
  job_id: string;
  status: CrawlJobStatus;
  pages_crawled: number;
  total_pages: number;
  failed_pages: number;
  progress: number;
  latest_page?: {
    url: string;
    status: CrawlPageStatus;
    title?: string;
  };
}

export interface KnowledgeBaseSettings {
  embedding?: EmbeddingSettings;
}

export interface EmbeddingStats {
  total_documents: number;
  embedded_documents: number;
  pending_documents: number;
  failed_documents: number;
  outdated_documents: number;
  total_chunks: number;
}

export interface SimilarChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_source_url: string | null;
  chunk_content: string;
  chunk_context?: string;
  chunk_index: number;
  similarity: number;
}

export type SearchType = "vector" | "bm25" | "hybrid";

export interface HybridSearchChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_source_url: string | null;
  chunk_content: string;
  chunk_context: string | null;
  chunk_index: number;
  similarity: number;
  bm25_rank: number | null;
  vector_rank: number | null;
  combined_score: number;
  search_type: SearchType;
  kb_id?: string;
}

export interface HybridSearchOptions {
  searchType?: SearchType;
  matchCount?: number;
  matchThreshold?: number;
  vectorWeight?: number;
  rrfK?: number;
}

export interface HybridSearchChunkWithTokens extends HybridSearchChunk {
  token_count: number;
}

export type RerankerProvider = "cohere" | "jina" | "voyage" | "aliyun" | "openai-compatible" | "none";

/** 
 * API 响应格式类型
 * - cohere: { results: [{ index, relevance_score }] }
 * - jina: { results: [{ index, relevance_score, document }] }
 * - voyage: { data: [{ index, relevance_score }] }
 * - auto: 自动检测响应格式
 */
export type RerankerResponseFormat = "cohere" | "jina" | "voyage" | "aliyun" | "auto";

export interface RerankerConfig {
  provider: RerankerProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  enabled: boolean;
  /** 仅用于 openai-compatible provider，指定 API 响应格式 */
  responseFormat?: RerankerResponseFormat;
  /** 自定义请求头 */
  customHeaders?: Record<string, string>;
}

/**
 * 精排结果质量控制配置
 * 根据精排模型的相关性得分，动态决定返回结果数量
 */
export interface RerankerQualityConfig {
  /** 是否启用质量控制 */
  enabled: boolean;
  /** 最少返回结果数（保证有答案） */
  minResults: number;
  /** 最多返回结果数（防止过多输入） */
  maxResults: number;
  /** 相关性得分阈值（低于此值的结果不返回） */
  scoreThreshold: number;
  /** 相邻结果得分下降阈值（下降超过此值则停止返回） */
  dropoffThreshold: number;
}

export interface SearchStats {
  vectorOnly: number;
  bm25Only: number;
  hybrid: number;
  total: number;
}

export interface SearchIndexStats {
  total_chunks: number;
  chunks_with_embedding: number;
  chunks_with_search_vector: number;
  avg_chunk_tokens: number;
  total_documents: number;
  index_coverage_percent: number;
}

export interface DocumentChunkSearchResult {
  chunk_id: string;
  document_id: string;
  chunk_content: string;
  chunk_context: string | null;
  chunk_index: number;
  similarity: number;
  bm25_rank: number | null;
  vector_rank: number | null;
  combined_score: number;
  search_type: SearchType;
}

/** Raw result from bm25_search_chunks RPC function */
export interface BM25SearchRawResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  chunk_content: string;
  chunk_context: string | null;
  chunk_index: number;
  bm25_score: number;
}

export interface ContextConfig {
  enabled: boolean;
  maxDocumentTokens: number;
}

export interface ChunkingConfig {
  strategy: "recursive" | "semantic" | "fixed";
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

export interface DocumentChunkExtended {
  id: string;
  document_id: string;
  chunk_index: number;
  original_content: string;
  context_summary: string | null;
  contextualized_content: string;
  content_hash: string;
  token_count: number;
  embedding: number[] | null;
  context_hash: string | null;
  created_at: string;
}

export interface ChatSessionWithMessages extends ChatSession {
  messages?: ChatMessage[];
}

export interface ChatMessageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  finishReason?: string;
  references?: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    sourceUrl: string | null;
    contextSummary?: string | null;
    content: string;
    similarity: number;
    chunkIndex?: number;
  }>;
  error?: string;
}

export interface ChatSessionSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface PromptConfig {
  chatWithContext: string;
  chatNoContext: string;
  docQA: string;
}

export const DEFAULT_PROMPTS: PromptConfig = {
  chatWithContext: `You are a knowledge base assistant. Answer questions based on the provided context from the knowledge base. If the context doesn't contain relevant information, you can briefly explain what you found and suggest rephrasing the question.

{{customPrompt}}

RULES:
1. Prioritize information from the provided context
2. If context is insufficient, acknowledge it honestly
3. You may cite sources using [number] format
4. For greetings or general questions about your capabilities, respond naturally

Context from knowledge base:
{{context}}`,
  chatNoContext: `You are a knowledge base assistant. The search returned no relevant results for this query.

Please respond helpfully:
- For greetings, introduce yourself as a knowledge base assistant
- For questions, suggest the user rephrase their query or check if the knowledge base contains relevant documents
- Be polite and helpful`,
  docQA: `You are a document Q&A assistant. Answer the user's question based ONLY on the provided document fragments below.

STRICT RULES:
1. You can ONLY use information from the provided fragments to answer
2. If the fragments don't contain enough information, say "Based on the provided document content, I cannot find relevant information to answer this question."
3. Do NOT make up or infer information that is not explicitly stated in the fragments
4. Cite which fragment(s) your answer is based on when possible
5. Keep your answer concise and accurate

Document: "{{documentTitle}}"

---
DOCUMENT FRAGMENTS:
{{context}}
---`,
}
