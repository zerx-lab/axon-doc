-- Migration: Sync document_count with actual document counts
-- This fixes inconsistencies where documents were created without updating the count

-- Update all knowledge bases to have the correct document count
UPDATE public.knowledge_bases kb
SET 
  document_count = (
    SELECT COUNT(*) 
    FROM public.documents d 
    WHERE d.kb_id = kb.id 
      AND d.status != 'deleted'
  ),
  updated_at = NOW();

-- Add a comment explaining the fix
COMMENT ON COLUMN public.knowledge_bases.document_count IS 
  'Cached count of non-deleted documents. Updated by increment/decrement_document_count RPCs.';
