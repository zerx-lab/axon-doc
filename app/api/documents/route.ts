import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import { computeContentHash } from "@/lib/chunking";
import { deleteDocumentEmbeddings } from "@/lib/embeddings";

function countWords(content: string): number {
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = content.replace(/[\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(w => w.length > 0).length;
  return chineseChars + englishWords;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const kbId = searchParams.get("kbId");
    const docId = searchParams.get("docId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const page = parseInt(searchParams.get("page") || "1");

    if (!operatorId) {
      return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
    }

    const canList = await hasPermission(supabase, operatorId, Permissions.DOCS_LIST);
    if (!canList) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (docId) {
      const { data: doc, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", docId)
        .eq("user_id", operatorId)
        .single();

      if (error || !doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      return NextResponse.json({ document: doc });
    }

    if (!kbId) {
      return NextResponse.json({ error: "kbId is required" }, { status: 400 });
    }

    const offset = (page - 1) * limit;

    const { data: docs, count, error } = await supabase
      .from("documents")
      .select("id, kb_id, title, file_type, word_count, char_count, status, embedding_status, source_url, created_at, updated_at", { count: "exact" })
      .eq("kb_id", kbId)
      .eq("user_id", operatorId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const transformedDocs = docs?.map(doc => ({
      id: doc.id,
      kbId: doc.kb_id,
      title: doc.title,
      fileType: doc.file_type,
      wordCount: doc.word_count,
      charCount: doc.char_count,
      status: doc.status,
      embeddingStatus: doc.embedding_status || "pending",
      sourceUrl: doc.source_url,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    }));

    return NextResponse.json({
      documents: transformedDocs,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error("List documents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { operatorId, kbId, title, content } = body;

    if (!operatorId || !kbId || !title || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canCreate = await hasPermission(supabase, operatorId, Permissions.DOCS_CREATE);
    if (!canCreate) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: kb, error: kbError } = await supabase
      .from("knowledge_bases")
      .select("*")
      .eq("id", kbId)
      .eq("user_id", operatorId)
      .single();

    if (kbError || !kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    const contentHash = computeContentHash(content);
    const wordCount = countWords(content);
    const charCount = content.length;

    const { data: newDoc, error } = await supabase
      .from("documents")
      .insert({
        kb_id: kbId,
        user_id: operatorId,
        title,
        content,
        content_hash: contentHash,
        word_count: wordCount,
        char_count: charCount,
        file_type: "markdown",
      })
      .select()
      .single();

    if (error) throw error;

    // Use atomic increment to prevent race conditions
    await supabase.rpc("increment_document_count", { kb_id_param: kbId });

    return NextResponse.json({ success: true, document: newDoc }, { status: 201 });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { operatorId, docId, title, content, status } = body;

    if (!operatorId || !docId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canUpdate = await hasPermission(supabase, operatorId, Permissions.DOCS_UPDATE);
    if (!canUpdate) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: existingDoc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", docId)
      .single();

    if (!existingDoc || existingDoc.user_id !== operatorId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;

    if (content !== undefined) {
      updateData.content = content;
      updateData.content_hash = computeContentHash(content);
      updateData.word_count = countWords(content);
      updateData.char_count = content.length;
    }

    const { data: updatedDoc, error } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", docId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, document: updatedDoc });
  } catch (error) {
    console.error("Update document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const docId = searchParams.get("docId");

    if (!operatorId || !docId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canDelete = await hasPermission(supabase, operatorId, Permissions.DOCS_DELETE);
    if (!canDelete) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: existingDoc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", docId)
      .single();

    if (!existingDoc || existingDoc.user_id !== operatorId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await deleteDocumentEmbeddings(supabase, docId);

    const { error } = await supabase.from("documents").delete().eq("id", docId);

    if (error) throw error;

    // Use atomic decrement to prevent race conditions
    await supabase.rpc("decrement_document_count", { kb_id_param: existingDoc.kb_id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
