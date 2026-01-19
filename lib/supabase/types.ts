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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type User = Database["public"]["Tables"]["users"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type KnowledgeBase = Database["public"]["Tables"]["knowledge_bases"]["Row"];
export type Document = Database["public"]["Tables"]["documents"]["Row"];

export type SafeUser = Omit<User, "password_hash">;
export type DocumentChunk = Database["public"]["Tables"]["document_chunks"]["Row"];

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
  chunk_content: string;
  chunk_context: string | null;
  chunk_index: number;
  similarity: number;
  bm25_rank: number | null;
  vector_rank: number | null;
  combined_score: number;
  search_type: SearchType;
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
