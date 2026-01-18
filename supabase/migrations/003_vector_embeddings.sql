-- AxonBase Vector Embeddings Migration
-- Add pgvector support for semantic search in knowledge bases

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- UPDATE DOCUMENTS TABLE
-- ============================================

-- Add embedding status to track vectorization state
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) DEFAULT 'pending';

-- Add check constraint for valid status values
ALTER TABLE documents 
  ADD CONSTRAINT chk_embedding_status 
  CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'outdated'));

-- Index for filtering by embedding status
CREATE INDEX IF NOT EXISTS idx_docs_embedding_status ON documents(embedding_status);

-- ============================================
-- DOCUMENT CHUNKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(document_id, chunk_index)
);

-- Indexes for document_chunks
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);



-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to document_chunks"
    ON document_chunks FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================
-- TRIGGERS FOR AUTOMATIC OUTDATED DETECTION
-- ============================================

-- When document content changes, mark embedding as outdated and delete old chunks
CREATE OR REPLACE FUNCTION check_document_content_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If content_hash changed, embeddings are outdated
    IF OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
        NEW.embedding_status := 'outdated';
        -- Delete old chunks (will be regenerated on next vectorization)
        DELETE FROM document_chunks WHERE document_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_document_content_change
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION check_document_content_change();

-- ============================================
-- SEMANTIC SEARCH FUNCTION
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
        dc.id AS chunk_id,
        dc.document_id,
        d.title AS document_title,
        dc.content AS chunk_content,
        dc.chunk_index,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE d.kb_id = target_kb_id
        AND d.embedding_status = 'completed'
        AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to get embedding statistics for a knowledge base
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
        COUNT(*)::INTEGER AS total_documents,
        COUNT(*) FILTER (WHERE d.embedding_status = 'completed')::INTEGER AS embedded_documents,
        COUNT(*) FILTER (WHERE d.embedding_status IN ('pending', 'processing'))::INTEGER AS pending_documents,
        COUNT(*) FILTER (WHERE d.embedding_status = 'failed')::INTEGER AS failed_documents,
        COUNT(*) FILTER (WHERE d.embedding_status = 'outdated')::INTEGER AS outdated_documents,
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM public.document_chunks dc 
            WHERE dc.document_id IN (
                SELECT d2.id FROM public.documents d2 WHERE d2.kb_id = target_kb_id
            )
        ), 0) AS total_chunks
    FROM public.documents d
    WHERE d.kb_id = target_kb_id;
END;
$$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE document_chunks IS 'Stores document chunks with vector embeddings for semantic search';
COMMENT ON COLUMN document_chunks.chunk_index IS 'Order of chunk within the document (0-based)';
COMMENT ON COLUMN document_chunks.token_count IS 'Approximate token count for the chunk';
COMMENT ON COLUMN documents.embedding_status IS 'Vectorization status: pending, processing, completed, failed, outdated';

GRANT ALL PRIVILEGES ON TABLE document_chunks TO anon, authenticated, service_role;
