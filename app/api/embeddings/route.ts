import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import {
  embedDocument,
  deleteDocumentEmbeddings,
  embedKnowledgeBase,
  deleteKnowledgeBaseEmbeddings,
  getEmbeddingStats,
} from "@/lib/embeddings";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const kbId = searchParams.get("kbId");
    const docId = searchParams.get("docId");

    if (!operatorId) {
      return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
    }

    const canView = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_VIEW);
    if (!canView) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (docId) {
      const { data: doc, error } = await supabase
        .from("documents")
        .select("id, title, embedding_status")
        .eq("id", docId)
        .single();

      if (error || !doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      const { data: chunks } = await supabase
        .from("document_chunks")
        .select("id, chunk_index, token_count")
        .eq("document_id", docId)
        .order("chunk_index");

      return NextResponse.json({
        document: {
          id: doc.id,
          title: doc.title,
          embeddingStatus: doc.embedding_status,
          chunkCount: chunks?.length || 0,
          chunks: chunks || [],
        },
      });
    }

    if (kbId) {
      const stats = await getEmbeddingStats(supabase, kbId);
      return NextResponse.json({ stats });
    }

    return NextResponse.json({ error: "kbId or docId is required" }, { status: 400 });
  } catch (error) {
    console.error("Get embeddings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { operatorId, action, docId, kbId } = body;

    if (!operatorId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canManage = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_MANAGE);
    if (!canManage) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (action === "embed_document") {
      if (!docId) {
        return NextResponse.json({ error: "docId is required" }, { status: 400 });
      }

      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, content, title, embedding_status")
        .eq("id", docId)
        .single();

      if (docError || !doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      if (doc.embedding_status === "processing") {
        return NextResponse.json({
          success: true,
          status: "processing",
          message: "Document is already being processed",
        });
      }

      await supabase
        .from("documents")
        .update({ embedding_status: "processing" })
        .eq("id", docId);

      after(async () => {
        const bgSupabase = createAdminClient();
        await embedDocument(bgSupabase, docId, doc.content || "", undefined, doc.title);
      });

      return NextResponse.json({
        success: true,
        status: "processing",
      });
    }

    if (action === "embed_kb") {
      if (!kbId) {
        return NextResponse.json({ error: "kbId is required" }, { status: 400 });
      }

      const { data: kb, error: kbError } = await supabase
        .from("knowledge_bases")
        .select("id")
        .eq("id", kbId)
        .single();

      if (kbError || !kb) {
        return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      }

      after(async () => {
        const bgSupabase = createAdminClient();
        await embedKnowledgeBase(bgSupabase, kbId);
      });

      return NextResponse.json({
        success: true,
        status: "processing",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Embed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const docId = searchParams.get("docId");
    const kbId = searchParams.get("kbId");

    if (!operatorId) {
      return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
    }

    const canManage = await hasPermission(supabase, operatorId, Permissions.EMBEDDING_MANAGE);
    if (!canManage) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (docId) {
      const result = await deleteDocumentEmbeddings(supabase, docId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (kbId) {
      const result = await deleteKnowledgeBaseEmbeddings(supabase, kbId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "docId or kbId is required" }, { status: 400 });
  } catch (error) {
    console.error("Delete embeddings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
