-- Migration: Add contextual retrieval support to document_chunks
-- This enables storing both original and contextualized content for improved RAG accuracy

ALTER TABLE document_chunks 
  ADD COLUMN IF NOT EXISTS original_content TEXT,
  ADD COLUMN IF NOT EXISTS context_summary TEXT,
  ADD COLUMN IF NOT EXISTS context_hash VARCHAR(64);

UPDATE document_chunks 
SET 
  original_content = content
WHERE original_content IS NULL;

ALTER TABLE document_chunks 
  RENAME COLUMN content TO contextualized_content;

CREATE INDEX IF NOT EXISTS idx_chunks_context_hash ON document_chunks(context_hash);

DROP FUNCTION IF EXISTS search_similar_chunks(vector, UUID, INTEGER, FLOAT);

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
        dc.id AS chunk_id,
        dc.document_id,
        d.title AS document_title,
        dc.original_content AS chunk_content,
        dc.context_summary AS chunk_context,
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

COMMENT ON COLUMN document_chunks.original_content IS 'Original chunk text before context enrichment';
COMMENT ON COLUMN document_chunks.context_summary IS 'LLM-generated context for this chunk (2-3 sentences)';
COMMENT ON COLUMN document_chunks.contextualized_content IS 'Context + original content, used for embedding generation';
COMMENT ON COLUMN document_chunks.context_hash IS 'Hash of context for cache invalidation';
