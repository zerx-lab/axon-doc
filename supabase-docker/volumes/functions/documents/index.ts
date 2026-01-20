import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const docId = pathParts[1]
    const kbId = url.searchParams.get('kb_id')

    switch (req.method) {
      case 'GET':
        if (docId) return await getDocument(supabaseClient, docId)
        if (kbId) return await listDocuments(supabaseClient, kbId)
        return errorResponse('kb_id query parameter required', 400)

      case 'POST':
        return await createDocument(supabaseClient, user.id, await req.json())

      case 'PUT':
        if (!docId) return errorResponse('Document ID required', 400)
        return await updateDocument(supabaseClient, docId, await req.json())

      case 'DELETE':
        if (!docId) return errorResponse('Document ID required', 400)
        return await deleteDocument(supabaseClient, user.id, docId)

      default:
        return errorResponse('Method not allowed', 405)
    }
  } catch (error) {
    return errorResponse(error.message, 500)
  }
})

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function successResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function computeHash(content: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = new Uint8Array(32)
  
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0
  }
  
  return Math.abs(hash).toString(16).padStart(8, '0')
}

function countWords(content: string): number {
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = content.replace(/[\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(w => w.length > 0).length
  return chineseChars + englishWords
}

async function listDocuments(supabase: ReturnType<typeof createClient>, kbId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, file_type, word_count, char_count, status, metadata, created_at, updated_at')
    .eq('kb_id', kbId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  if (error) return errorResponse(error.message, 400)
  return successResponse(data)
}

async function getDocument(supabase: ReturnType<typeof createClient>, id: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return errorResponse(error.message, 404)
  return successResponse(data)
}

interface CreateDocumentBody {
  kb_id: string
  title: string
  content: string
  metadata?: Record<string, unknown>
}

async function createDocument(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: CreateDocumentBody
) {
  if (!body.kb_id) return errorResponse('kb_id is required', 400)
  if (!body.title) return errorResponse('title is required', 400)
  if (!body.content) return errorResponse('content is required', 400)

  const { data: kb, error: kbError } = await supabase
    .from('knowledge_bases')
    .select('id')
    .eq('id', body.kb_id)
    .single()

  if (kbError || !kb) return errorResponse('Knowledge base not found', 404)

  const contentHash = computeHash(body.content)
  const wordCount = countWords(body.content)
  const charCount = body.content.length

  const { data, error } = await supabase
    .from('documents')
    .insert({
      kb_id: body.kb_id,
      user_id: userId,
      title: body.title,
      content: body.content,
      content_hash: contentHash,
      word_count: wordCount,
      char_count: charCount,
      file_type: 'markdown',
      metadata: body.metadata || {},
    })
    .select()
    .single()

  if (error) return errorResponse(error.message, 400)

  // Update document count in knowledge base
  await supabase.rpc('increment_document_count', { kb_id_param: body.kb_id })

  return successResponse(data, 201)
}

interface UpdateDocumentBody {
  title?: string
  content?: string
  status?: 'active' | 'archived'
  metadata?: Record<string, unknown>
}

async function updateDocument(
  supabase: ReturnType<typeof createClient>,
  id: string,
  body: UpdateDocumentBody
) {
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) updates.title = body.title
  if (body.status !== undefined) updates.status = body.status
  if (body.metadata !== undefined) updates.metadata = body.metadata

  if (body.content !== undefined) {
    updates.content = body.content
    updates.content_hash = computeHash(body.content)
    updates.word_count = countWords(body.content)
    updates.char_count = body.content.length
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No fields to update', 400)
  }

  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse(error.message, 400)
  return successResponse(data)
}

async function deleteDocument(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  id: string
) {
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('file_path, kb_id')
    .eq('id', id)
    .single()

  if (fetchError) return errorResponse(fetchError.message, 404)

  if (doc.file_path) {
    await supabase.storage.from('documents').remove([doc.file_path])
  }

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (error) return errorResponse(error.message, 400)

  // Update document count in knowledge base
  await supabase.rpc('decrement_document_count', { kb_id_param: doc.kb_id })

  return successResponse({ success: true })
}
