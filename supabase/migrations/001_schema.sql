-- AxonDoc Complete Database Schema
-- Unified migration for development (合并所有迁移文件，便于开发迭代)

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- ROLES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- ============================================
-- USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    display_name VARCHAR(255),
    avatar TEXT,
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ============================================
-- SESSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- KNOWLEDGE BASES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    document_count INTEGER NOT NULL DEFAULT 0,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_user_id ON knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_kb_name ON knowledge_bases(name);

-- ============================================
-- DOCUMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_hash VARCHAR(64),
    file_type VARCHAR(50) NOT NULL DEFAULT 'markdown',
    word_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    embedding_status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_embedding_status CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'outdated'))
);

CREATE INDEX IF NOT EXISTS idx_docs_kb_id ON documents(kb_id);
CREATE INDEX IF NOT EXISTS idx_docs_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_docs_embedding_status ON documents(embedding_status);
CREATE INDEX IF NOT EXISTS idx_docs_kb_embedding_status ON documents(kb_id, embedding_status) WHERE embedding_status = 'completed';

-- ============================================
-- DOCUMENT CHUNKS TABLE (with contextual retrieval support)
-- ============================================

CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    original_content TEXT NOT NULL,
    context_summary TEXT,
    contextualized_content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    context_hash VARCHAR(64),
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector,
    search_vector tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_context_hash ON document_chunks(context_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON document_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_order ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_chunks_has_embedding ON document_chunks(document_id) WHERE embedding IS NOT NULL;

-- ============================================
-- SYSTEM SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- ============================================
-- UPDATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_bases_updated_at BEFORE UPDATE ON knowledge_bases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DOCUMENT CONTENT CHANGE DETECTION
-- ============================================

CREATE OR REPLACE FUNCTION check_document_content_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
        NEW.embedding_status := 'outdated';
        DELETE FROM document_chunks WHERE document_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_document_content_change BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION check_document_content_change();

-- ============================================
-- CHINESE TOKENIZATION SUPPORT
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'chinese_english') THEN
        CREATE TEXT SEARCH CONFIGURATION chinese_english (COPY = simple);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION tokenize_mixed_content(content TEXT)
RETURNS tsvector
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result tsvector;
    chinese_chars TEXT;
    english_words TEXT;
    i INTEGER;
BEGIN
    IF content IS NULL OR content = '' THEN RETURN ''::tsvector; END IF;

    english_words := regexp_replace(content, '[^\x00-\x7F]+', ' ', 'g');
    result := to_tsvector('simple', COALESCE(english_words, ''));

    chinese_chars := regexp_replace(content, '[\x00-\x7F]+', '', 'g');

    IF length(chinese_chars) > 0 THEN
        FOR i IN 1..length(chinese_chars) LOOP
            result := result || to_tsvector('simple', substring(chinese_chars from i for 1));
        END LOOP;
        IF length(chinese_chars) > 1 THEN
            FOR i IN 1..length(chinese_chars)-1 LOOP
                result := result || to_tsvector('simple', substring(chinese_chars from i for 2));
            END LOOP;
        END IF;
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION tokenize_mixed_query(query_text TEXT)
RETURNS tsquery
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result tsquery;
    tokens TEXT[];
    token TEXT;
    chinese_chars TEXT;
    english_words TEXT;
    i INTEGER;
BEGIN
    IF query_text IS NULL OR query_text = '' THEN RETURN ''::tsquery; END IF;

    tokens := ARRAY[]::TEXT[];

    english_words := regexp_replace(query_text, '[^\x00-\x7F]+', ' ', 'g');
    FOREACH token IN ARRAY regexp_split_to_array(trim(english_words), '\s+') LOOP
        IF token != '' AND length(token) > 0 THEN tokens := array_append(tokens, token); END IF;
    END LOOP;

    chinese_chars := regexp_replace(query_text, '[\x00-\x7F]+', '', 'g');

    IF length(chinese_chars) > 0 THEN
        FOR i IN 1..length(chinese_chars) LOOP
            tokens := array_append(tokens, substring(chinese_chars from i for 1));
        END LOOP;
        IF length(chinese_chars) > 1 THEN
            FOR i IN 1..length(chinese_chars)-1 LOOP
                tokens := array_append(tokens, substring(chinese_chars from i for 2));
            END LOOP;
        END IF;
    END IF;

    IF array_length(tokens, 1) IS NULL OR array_length(tokens, 1) = 0 THEN RETURN ''::tsquery; END IF;

    result := to_tsquery('simple', tokens[1]);
    FOR i IN 2..array_length(tokens, 1) LOOP
        result := result || to_tsquery('simple', tokens[i]);
    END LOOP;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION update_chunk_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := tokenize_mixed_content(COALESCE(NEW.original_content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_chunk_search_vector BEFORE INSERT OR UPDATE OF original_content ON document_chunks FOR EACH ROW EXECUTE FUNCTION update_chunk_search_vector();

-- ============================================
-- ATOMIC DOCUMENT COUNT FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION increment_document_count(kb_id_param UUID, increment_by INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.knowledge_bases SET document_count = document_count + increment_by, updated_at = NOW() WHERE id = kb_id_param;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_document_count(kb_id_param UUID, decrement_by INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.knowledge_bases SET document_count = GREATEST(0, document_count - decrement_by), updated_at = NOW() WHERE id = kb_id_param;
END;
$$;

-- ============================================
-- SEARCH FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION search_similar_chunks(
    query_embedding vector,
    target_kb_id UUID,
    match_count INTEGER DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    document_title VARCHAR(500),
    chunk_content TEXT,
    chunk_context TEXT,
    chunk_index INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id, dc.document_id, d.title, dc.original_content, dc.context_summary, dc.chunk_index,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE d.kb_id = target_kb_id AND d.embedding_status = 'completed' AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION get_kb_embedding_stats(target_kb_id UUID)
RETURNS TABLE (
    total_documents INTEGER,
    embedded_documents INTEGER,
    pending_documents INTEGER,
    failed_documents INTEGER,
    outdated_documents INTEGER,
    total_chunks INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE d.embedding_status = 'completed')::INTEGER,
        COUNT(*) FILTER (WHERE d.embedding_status IN ('pending', 'processing'))::INTEGER,
        COUNT(*) FILTER (WHERE d.embedding_status = 'failed')::INTEGER,
        COUNT(*) FILTER (WHERE d.embedding_status = 'outdated')::INTEGER,
        COALESCE((SELECT COUNT(*)::INTEGER FROM public.document_chunks dc WHERE dc.document_id IN (SELECT d2.id FROM public.documents d2 WHERE d2.kb_id = target_kb_id)), 0)
    FROM public.documents d WHERE d.kb_id = target_kb_id;
END;
$$;

CREATE OR REPLACE FUNCTION hybrid_search_chunks(
    query_text TEXT,
    query_embedding extensions.vector,
    target_kb_id UUID,
    match_count INTEGER DEFAULT 20,
    match_threshold FLOAT DEFAULT 0.3,
    vector_weight FLOAT DEFAULT 0.5,
    rrf_k INTEGER DEFAULT 60
)
RETURNS TABLE (
    chunk_id UUID, document_id UUID, document_title VARCHAR(500), chunk_content TEXT, chunk_context TEXT,
    chunk_index INTEGER, similarity FLOAT, bm25_rank INTEGER, vector_rank INTEGER, combined_score FLOAT, search_type TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public, extensions'
AS $$
DECLARE
    query_tsquery tsquery;
    candidate_limit INTEGER;
BEGIN
    query_tsquery := public.tokenize_mixed_query(query_text);
    candidate_limit := LEAST(match_count * 3, 500);

    RETURN QUERY
    WITH
    valid_docs AS (SELECT d.id, d.title FROM public.documents d WHERE d.kb_id = target_kb_id AND d.embedding_status = 'completed'),
    vector_results AS (
        SELECT dc.id, dc.document_id, vd.title AS document_title, dc.original_content, dc.context_summary, dc.chunk_index,
            (1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding))::FLOAT AS sim,
            ROW_NUMBER() OVER (ORDER BY dc.embedding OPERATOR(extensions.<=>) query_embedding) AS v_rank
        FROM public.document_chunks dc INNER JOIN valid_docs vd ON vd.id = dc.document_id
        WHERE dc.embedding IS NOT NULL AND (1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding)) >= match_threshold
        ORDER BY dc.embedding OPERATOR(extensions.<=>) query_embedding LIMIT candidate_limit
    ),
    bm25_results AS (
        SELECT dc.id, dc.document_id, vd.title AS document_title, dc.original_content, dc.context_summary, dc.chunk_index,
            ts_rank_cd(dc.search_vector, query_tsquery, 32)::FLOAT AS bm25_score,
            ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC) AS b_rank
        FROM public.document_chunks dc INNER JOIN valid_docs vd ON vd.id = dc.document_id
        WHERE dc.search_vector @@ query_tsquery
        ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC LIMIT candidate_limit
    ),
    rrf_combined AS (
        SELECT COALESCE(v.id, b.id) AS id, COALESCE(v.document_id, b.document_id) AS document_id,
            COALESCE(v.document_title, b.document_title) AS document_title,
            COALESCE(v.original_content, b.original_content) AS original_content,
            COALESCE(v.context_summary, b.context_summary) AS context_summary,
            COALESCE(v.chunk_index, b.chunk_index) AS chunk_index,
            COALESCE(v.sim, 0)::FLOAT AS similarity, b.b_rank::INTEGER AS bm25_rank, v.v_rank::INTEGER AS vector_rank,
            (COALESCE(vector_weight / (rrf_k + v.v_rank), 0) + COALESCE((1 - vector_weight) / (rrf_k + b.b_rank), 0))::FLOAT AS combined_score,
            CASE WHEN v.id IS NOT NULL AND b.id IS NOT NULL THEN 'hybrid' WHEN v.id IS NOT NULL THEN 'vector' ELSE 'bm25' END AS search_type
        FROM vector_results v FULL OUTER JOIN bm25_results b ON v.id = b.id
    )
    SELECT r.id, r.document_id, r.document_title, r.original_content, r.context_summary, r.chunk_index,
        r.similarity, r.bm25_rank, r.vector_rank, r.combined_score, r.search_type
    FROM rrf_combined r ORDER BY r.combined_score DESC LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION hybrid_search_for_reranking(
    query_text TEXT, query_embedding extensions.vector, target_kb_id UUID,
    candidate_count INTEGER DEFAULT 100, match_threshold FLOAT DEFAULT 0.2, vector_weight FLOAT DEFAULT 0.5, rrf_k INTEGER DEFAULT 60
)
RETURNS TABLE (
    chunk_id UUID, document_id UUID, document_title VARCHAR(500), chunk_content TEXT, chunk_context TEXT,
    chunk_index INTEGER, similarity FLOAT, bm25_rank INTEGER, vector_rank INTEGER, combined_score FLOAT, search_type TEXT, token_count INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public, extensions'
AS $$
DECLARE
    query_tsquery tsquery;
    internal_limit INTEGER;
BEGIN
    query_tsquery := public.tokenize_mixed_query(query_text);
    internal_limit := LEAST(candidate_count * 2, 1000);

    RETURN QUERY
    WITH
    valid_docs AS (SELECT d.id, d.title FROM public.documents d WHERE d.kb_id = target_kb_id AND d.embedding_status = 'completed'),
    vector_results AS (
        SELECT dc.id, dc.document_id, vd.title AS document_title, dc.original_content, dc.context_summary, dc.chunk_index, dc.token_count,
            (1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding))::FLOAT AS sim,
            ROW_NUMBER() OVER (ORDER BY dc.embedding OPERATOR(extensions.<=>) query_embedding) AS v_rank
        FROM public.document_chunks dc INNER JOIN valid_docs vd ON vd.id = dc.document_id
        WHERE dc.embedding IS NOT NULL AND (1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding)) >= match_threshold
        ORDER BY dc.embedding OPERATOR(extensions.<=>) query_embedding LIMIT internal_limit
    ),
    bm25_results AS (
        SELECT dc.id, dc.document_id, vd.title AS document_title, dc.original_content, dc.context_summary, dc.chunk_index, dc.token_count,
            ts_rank_cd(dc.search_vector, query_tsquery, 32)::FLOAT AS bm25_score,
            ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC) AS b_rank
        FROM public.document_chunks dc INNER JOIN valid_docs vd ON vd.id = dc.document_id
        WHERE dc.search_vector @@ query_tsquery ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC LIMIT internal_limit
    ),
    rrf_combined AS (
        SELECT COALESCE(v.id, b.id) AS id, COALESCE(v.document_id, b.document_id) AS document_id,
            COALESCE(v.document_title, b.document_title) AS document_title, COALESCE(v.original_content, b.original_content) AS original_content,
            COALESCE(v.context_summary, b.context_summary) AS context_summary, COALESCE(v.chunk_index, b.chunk_index) AS chunk_index,
            COALESCE(v.token_count, b.token_count) AS token_count, COALESCE(v.sim, 0)::FLOAT AS similarity,
            b.b_rank::INTEGER AS bm25_rank, v.v_rank::INTEGER AS vector_rank,
            (COALESCE(vector_weight / (rrf_k + v.v_rank), 0) + COALESCE((1 - vector_weight) / (rrf_k + b.b_rank), 0))::FLOAT AS combined_score,
            CASE WHEN v.id IS NOT NULL AND b.id IS NOT NULL THEN 'hybrid' WHEN v.id IS NOT NULL THEN 'vector' ELSE 'bm25' END AS search_type
        FROM vector_results v FULL OUTER JOIN bm25_results b ON v.id = b.id
    )
    SELECT r.id, r.document_id, r.document_title, r.original_content, r.context_summary, r.chunk_index,
        r.similarity, r.bm25_rank, r.vector_rank, r.combined_score, r.search_type, r.token_count
    FROM rrf_combined r ORDER BY r.combined_score DESC LIMIT candidate_count;
END;
$$;

CREATE OR REPLACE FUNCTION bm25_search_chunks(query_text TEXT, target_kb_id UUID, match_count INTEGER DEFAULT 20)
RETURNS TABLE (chunk_id UUID, document_id UUID, document_title VARCHAR(500), chunk_content TEXT, chunk_context TEXT, chunk_index INTEGER, bm25_score FLOAT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public, extensions'
AS $$
DECLARE query_tsquery tsquery;
BEGIN
    query_tsquery := plainto_tsquery('simple', query_text);
    RETURN QUERY
    SELECT dc.id, dc.document_id, d.title, dc.original_content, dc.context_summary, dc.chunk_index, ts_rank_cd(dc.search_vector, query_tsquery, 32)::FLOAT
    FROM public.document_chunks dc JOIN public.documents d ON d.id = dc.document_id
    WHERE d.kb_id = target_kb_id AND d.embedding_status = 'completed' AND dc.search_vector @@ query_tsquery
    ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.hybrid_search_document_chunks(
    query_text TEXT, query_embedding extensions.vector, target_document_id UUID,
    match_count INTEGER DEFAULT 10, match_threshold FLOAT DEFAULT 0.3, vector_weight FLOAT DEFAULT 0.5, rrf_k INTEGER DEFAULT 60
)
RETURNS TABLE (chunk_id UUID, document_id UUID, chunk_content TEXT, chunk_context TEXT, chunk_index INTEGER, similarity FLOAT, bm25_rank INTEGER, vector_rank INTEGER, combined_score FLOAT, search_type TEXT)
LANGUAGE plpgsql
SET search_path = 'public, extensions'
AS $$
DECLARE query_tsquery tsquery; candidate_limit INTEGER;
BEGIN
    query_tsquery := public.tokenize_mixed_query(query_text);
    candidate_limit := LEAST(match_count * 3, 100);
    RETURN QUERY
    WITH
    vector_results AS (
        SELECT dc.id, dc.document_id, dc.original_content, dc.context_summary, dc.chunk_index,
            (1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding))::FLOAT AS sim,
            ROW_NUMBER() OVER (ORDER BY dc.embedding OPERATOR(extensions.<=>) query_embedding) AS v_rank
        FROM public.document_chunks dc WHERE dc.document_id = target_document_id AND dc.embedding IS NOT NULL
            AND (1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding)) >= match_threshold
        ORDER BY dc.embedding OPERATOR(extensions.<=>) query_embedding LIMIT candidate_limit
    ),
    bm25_results AS (
        SELECT dc.id, dc.document_id, dc.original_content, dc.context_summary, dc.chunk_index,
            ts_rank_cd(dc.search_vector, query_tsquery, 32)::FLOAT AS bm25_score,
            ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC) AS b_rank
        FROM public.document_chunks dc WHERE dc.document_id = target_document_id AND dc.search_vector IS NOT NULL AND dc.search_vector @@ query_tsquery
        ORDER BY ts_rank_cd(dc.search_vector, query_tsquery, 32) DESC LIMIT candidate_limit
    ),
    rrf_combined AS (
        SELECT COALESCE(v.id, b.id) AS id, COALESCE(v.document_id, b.document_id) AS document_id,
            COALESCE(v.original_content, b.original_content) AS original_content, COALESCE(v.context_summary, b.context_summary) AS context_summary,
            COALESCE(v.chunk_index, b.chunk_index) AS chunk_index, COALESCE(v.sim, 0)::FLOAT AS similarity,
            b.b_rank::INTEGER AS bm25_rank, v.v_rank::INTEGER AS vector_rank,
            (COALESCE(vector_weight / (rrf_k + v.v_rank), 0) + COALESCE((1 - vector_weight) / (rrf_k + b.b_rank), 0))::FLOAT AS combined_score,
            CASE WHEN v.id IS NOT NULL AND b.id IS NOT NULL THEN 'hybrid' WHEN v.id IS NOT NULL THEN 'vector' ELSE 'bm25' END AS search_type
        FROM vector_results v FULL OUTER JOIN bm25_results b ON v.id = b.id
    )
    SELECT r.id, r.document_id, r.original_content, r.context_summary, r.chunk_index, r.similarity, r.bm25_rank, r.vector_rank, r.combined_score, r.search_type
    FROM rrf_combined r ORDER BY r.combined_score DESC LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION get_search_stats(target_kb_id UUID)
RETURNS TABLE (total_chunks BIGINT, chunks_with_embedding BIGINT, chunks_with_search_vector BIGINT, avg_chunk_tokens NUMERIC, total_documents BIGINT, index_coverage_percent NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public, extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(dc.id)::BIGINT, COUNT(dc.id) FILTER (WHERE dc.embedding IS NOT NULL)::BIGINT,
        COUNT(dc.id) FILTER (WHERE dc.search_vector IS NOT NULL)::BIGINT, ROUND(AVG(dc.token_count)::NUMERIC, 2),
        COUNT(DISTINCT dc.document_id)::BIGINT,
        ROUND((COUNT(dc.id) FILTER (WHERE dc.embedding IS NOT NULL AND dc.search_vector IS NOT NULL)::NUMERIC / NULLIF(COUNT(dc.id), 0)::NUMERIC) * 100, 2)
    FROM public.document_chunks dc INNER JOIN public.documents d ON d.id = dc.document_id WHERE d.kb_id = target_kb_id;
END;
$$;

CREATE OR REPLACE FUNCTION rebuild_search_vectors(target_kb_id UUID)
RETURNS TABLE (updated_count BIGINT, duration_ms BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public, extensions'
AS $$
DECLARE start_time TIMESTAMP; end_time TIMESTAMP; rows_updated BIGINT;
BEGIN
    start_time := clock_timestamp();
    WITH updated AS (
        UPDATE public.document_chunks dc SET search_vector = public.tokenize_mixed_content(COALESCE(dc.original_content, ''))
        FROM public.documents d WHERE d.id = dc.document_id AND d.kb_id = target_kb_id RETURNING dc.id
    )
    SELECT COUNT(*) INTO rows_updated FROM updated;
    end_time := clock_timestamp();
    RETURN QUERY SELECT rows_updated, EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_roles" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_kb" ON knowledge_bases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_docs" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_chunks" ON document_chunks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================
-- SEED SYSTEM ROLES
-- ============================================

INSERT INTO roles (name, description, permissions, is_system, is_super_admin) VALUES
    ('Super Administrator', 'Has all permissions and cannot be modified', ARRAY['*'], TRUE, TRUE),
    ('Administrator', 'Has all administrative permissions',
        ARRAY['users:list', 'users:create', 'users:update', 'users:delete', 'users:toggle_active', 'users:reset_password',
              'roles:list', 'roles:create', 'roles:update', 'roles:delete', 'system:settings', 'system:logs',
              'kb:list', 'kb:create', 'kb:update', 'kb:delete', 'docs:list', 'docs:create', 'docs:update', 'docs:delete',
              'embedding:view', 'embedding:manage', 'embedding:search'],
        TRUE, FALSE),
    ('User Manager', 'Can manage users',
        ARRAY['users:list', 'users:create', 'users:update', 'users:toggle_active', 'users:reset_password'],
        TRUE, FALSE),
    ('Viewer', 'Read-only access',
        ARRAY['users:list', 'roles:list', 'kb:list', 'docs:list', 'embedding:view', 'embedding:search'],
        TRUE, FALSE)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- SEED DEFAULT SETTINGS
-- ============================================

INSERT INTO system_settings (key, value, description) VALUES
(
    'embedding_config',
    '{"provider": "openai", "baseUrl": "https://api.openai.com/v1", "apiKey": "", "model": "text-embedding-3-small", "batchSize": 100, "chunkSize": 512, "chunkOverlap": 100}',
    'Vector embedding model configuration'
)
ON CONFLICT (key) DO NOTHING;
