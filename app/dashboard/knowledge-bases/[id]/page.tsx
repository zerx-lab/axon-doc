"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useTask } from "@/lib/task-context";
import { Button, Input, Dialog, MarkdownEditor } from "@/components/ui";
import { useRouter, useParams } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";

interface Document {
  id: string;
  kbId: string;
  title: string;
  content?: string;
  wordCount: number;
  status: string;
  embeddingStatus: "pending" | "processing" | "completed" | "failed" | "outdated";
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
}

type DialogType = "create" | "edit" | "delete" | "preview" | "test" | null;

interface ChunkResult {
  chunkId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

interface TestResult {
  query: string;
  chunks: ChunkResult[];
  answer: string;
  documentTitle: string;
  responseTime?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export default function DocumentsPage() {
  const { t } = useI18n();
  const { user: authUser, isLoading: authLoading, hasPermission } = useAuth();
  const router = useRouter();
  const params = useParams();
  const kbId = params.id as string;
  
  const { addTask, tasks } = useTask();
  const prevTasksRef = useRef<typeof tasks>([]);
  
  const canListDocs = hasPermission(PERMISSIONS.DOCS_LIST);
  const canCreateDoc = hasPermission(PERMISSIONS.DOCS_CREATE);
  const canUpdateDoc = hasPermission(PERMISSIONS.DOCS_UPDATE);
  const canDeleteDoc = hasPermission(PERMISSIONS.DOCS_DELETE);
  const canManageEmbedding = hasPermission(PERMISSIONS.EMBEDDING_MANAGE);
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [embeddingLoading, setEmbeddingLoading] = useState<Map<string, boolean>>(new Map());

  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
  });
  const [formError, setFormError] = useState("");

  const [testQuery, setTestQuery] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState("");

  const currentUserId = authUser?.id;

  const fetchKnowledgeBase = useCallback(async () => {
    if (!currentUserId || !kbId) return;
    
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
      });
      
      const response = await fetch(`/api/kb?${params}`);
      const result = await response.json();
      
      if (result.knowledgeBases) {
        const kb = result.knowledgeBases.find((kb: KnowledgeBase) => kb.id === kbId);
        if (kb) {
          setKnowledgeBase(kb);
        }
      }
    } catch (error) {
      console.error("Failed to fetch knowledge base:", error);
    }
  }, [currentUserId, kbId]);

  const fetchDocuments = useCallback(async () => {
    if (!currentUserId || !canListDocs || !kbId) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        kbId: kbId,
      });
      if (search) {
        params.append("search", search);
      }
      
      const response = await fetch(`/api/documents?${params}`);
      const result = await response.json();
      
      if (result.documents) {
        setDocuments(result.documents);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, kbId, search, canListDocs]);

  useEffect(() => {
    fetchKnowledgeBase();
    fetchDocuments();
  }, [fetchKnowledgeBase, fetchDocuments]);

  useEffect(() => {
    const prevTasks = prevTasksRef.current;
    const relevantTaskCompleted = tasks.some((task) => {
      const prevTask = prevTasks.find((t) => t.id === task.id);
      const wasRunningOrPending = prevTask && (prevTask.status === "running" || prevTask.status === "pending");
      const isNowCompleted = task.status === "completed" || task.status === "failed";
      const isRelevant = task.type === "embed_document" && task.data.docId && 
        documents.some((d) => d.id === task.data.docId);
      return wasRunningOrPending && isNowCompleted && isRelevant;
    });

    if (relevantTaskCompleted) {
      fetchDocuments();
    }

    prevTasksRef.current = tasks;
  }, [tasks, documents, fetchDocuments]);
  
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/login");
    }
  }, [authLoading, authUser, router]);
  
  if (!authLoading && authUser && !canListDocs) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="font-mono text-lg font-medium text-red-500">{t("error.accessDenied")}</h2>
          <p className="mt-2 font-mono text-sm text-muted">{t("error.noPermission")}</p>
        </div>
      </div>
    );
  }

  const openCreateDialog = () => {
    setFormData({
      title: "",
      content: "",
    });
    setFormError("");
    setDialogType("create");
  };

  const openEditDialog = async (doc: Document) => {
    setSelectedDoc(doc);
    setFormData({
      title: doc.title,
      content: "",
    });
    setFormError("");
    setDialogType("edit");
    
    if (currentUserId) {
      try {
        const params = new URLSearchParams({
          operatorId: currentUserId,
          docId: doc.id,
        });
        const response = await fetch(`/api/documents?${params}`);
        const result = await response.json();
        if (result.document) {
          setFormData({
            title: result.document.title,
            content: result.document.content || "",
          });
          setSelectedDoc(result.document);
        }
      } catch (error) {
        console.error("Failed to fetch document:", error);
      }
    }
  };

  const openDeleteDialog = (doc: Document) => {
    setSelectedDoc(doc);
    setDialogType("delete");
  };

  const openPreviewDialog = async (doc: Document) => {
    setSelectedDoc(doc);
    setDialogType("preview");
    
    if (currentUserId) {
      try {
        const params = new URLSearchParams({
          operatorId: currentUserId,
          docId: doc.id,
        });
        const response = await fetch(`/api/documents?${params}`);
        const result = await response.json();
        if (result.document) {
          setSelectedDoc(result.document);
        }
      } catch (error) {
        console.error("Failed to fetch document:", error);
      }
    }
  };

  const closeDialog = () => {
    setDialogType(null);
    setSelectedDoc(null);
    setFormError("");
    setTestQuery("");
    setTestResult(null);
    setStreamingAnswer("");
  };

  const openTestDialog = (doc: Document) => {
    setSelectedDoc(doc);
    setTestQuery("");
    setTestResult(null);
    setDialogType("test");
  };

  const handleTest = async () => {
    if (!currentUserId || !selectedDoc || !testQuery.trim()) return;

    setTestLoading(true);
    setTestResult(null);
    setStreamingAnswer("");
    setFormError("");

    try {
      const response = await fetch("/api/documents/test/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          docId: selectedDoc.id,
          query: testQuery.trim(),
          limit: 5,
          threshold: 0.5,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setFormError(errorData.error || t("docTest.testFailed"));
        setTestLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setFormError(t("docTest.testFailed"));
        setTestLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (\w+)/);
          const dataMatch = line.match(/data: (.+)$/m);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const eventData = JSON.parse(dataMatch[1]);

            switch (eventType) {
              case "metadata":
                setTestResult({
                  query: eventData.query,
                  documentTitle: eventData.documentTitle,
                  chunks: eventData.chunks,
                  answer: "",
                });
                break;

              case "text":
                fullAnswer += eventData.content;
                setStreamingAnswer(fullAnswer);
                break;

              case "done":
                setTestResult((prev) =>
                  prev
                    ? {
                        ...prev,
                        answer: fullAnswer,
                        responseTime: eventData.responseTime,
                        usage: eventData.usage,
                      }
                    : null
                );
                setStreamingAnswer("");
                setTestLoading(false);
                break;

              case "error":
                setFormError(eventData.message || t("docTest.testFailed"));
                setTestLoading(false);
                break;
            }
          }
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("docTest.testFailed"));
      setTestLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!currentUserId) return;
    if (!formData.title) {
      setFormError(t("docs.titleRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          kbId: kbId,
          title: formData.title,
          content: formData.content,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchDocuments();
      } else {
        setFormError(result.error || t("error.createFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.createFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentUserId || !selectedDoc) return;

    if (!formData.title) {
      setFormError(t("docs.titleRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          docId: selectedDoc.id,
          title: formData.title,
          content: formData.content,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchDocuments();
      } else {
        setFormError(result.error || t("error.updateFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.updateFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUserId || !selectedDoc) return;

    setActionLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        docId: selectedDoc.id,
      });
      
      const response = await fetch(`/api/documents?${params}`, {
        method: "DELETE",
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchDocuments();
      } else {
        setFormError(result.error || t("error.deleteFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.deleteFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleBack = () => {
    router.push("/dashboard/knowledge-bases");
  };

  const handleEmbed = (docId: string) => {
    if (!currentUserId) return;

    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    addTask({
      type: "embed_document",
      title: `${t("task.embedDocument")}: ${doc.title}`,
      data: {
        docId,
        operatorId: currentUserId,
      },
    });
  };

  const handleDeleteEmbedding = async (docId: string) => {
    if (!currentUserId) return;

    setEmbeddingLoading(prev => new Map(prev).set(docId, true));
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        docId: docId,
      });

      const response = await fetch(`/api/embeddings?${params}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (result.success) {
        fetchDocuments();
      } else {
        setFormError(result.error || t("embedding.deleteFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("embedding.deleteFailed"));
    } finally {
      setEmbeddingLoading(prev => {
        const newMap = new Map(prev);
        newMap.delete(docId);
        return newMap;
      });
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <button
          onClick={handleBack}
          className="mb-4 flex items-center gap-2 font-mono text-sm text-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {t("common.back")}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-xl font-medium">{knowledgeBase?.name || t("docs.title")}</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
              {documents.length} {t("docs.document").toLowerCase()}(s)
            </p>
          </div>
          {canCreateDoc && (
            <Button onClick={openCreateDialog}>
              <PlusIcon className="mr-2 h-3 w-3" />
              {t("docs.create")}
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <Input
          placeholder={t("docs.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="border border-border">
        <div className="grid grid-cols-[2fr_120px_120px_150px_160px_220px] gap-4 border-b border-border bg-card px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("docs.docTitle")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("docs.wordCount")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("docs.status")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("embedding.status")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("common.createdAt")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("common.actions")}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs text-muted">{t("common.loading")}...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs text-muted">{t("common.noData")}</span>
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className="grid grid-cols-[2fr_120px_120px_150px_160px_220px] gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-card/50"
            >
              <div className="font-mono text-sm">{doc.title}</div>
              <div className="font-mono text-sm text-muted">
                {doc.wordCount}
              </div>
              <div>
                <span className="inline-block border border-border px-2 py-0.5 font-mono text-[10px] uppercase">
                  {doc.status}
                </span>
              </div>
              <div>
                {doc.embeddingStatus === "pending" && (
                  <span className="inline-block border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
                    {t("embedding.pending")}
                  </span>
                )}
                {doc.embeddingStatus === "processing" && (
                  <span className="inline-flex items-center gap-1 border border-blue-500/50 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-blue-500">
                    <SpinnerIcon className="h-2.5 w-2.5 animate-spin" />
                    {t("embedding.processing")}
                  </span>
                )}
                {doc.embeddingStatus === "completed" && (
                  <span className="inline-block border border-green-500/50 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-green-500">
                    {t("embedding.completed")}
                  </span>
                )}
                {doc.embeddingStatus === "failed" && (
                  <span className="inline-block border border-red-500/50 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-red-500">
                    {t("embedding.failed")}
                  </span>
                )}
                {doc.embeddingStatus === "outdated" && (
                  <span className="inline-block border border-yellow-500/50 bg-yellow-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-yellow-500">
                    {t("embedding.outdated")}
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-muted">
                {new Date(doc.createdAt).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openPreviewDialog(doc)}
                  className="flex h-7 w-7 items-center justify-center text-muted hover:text-foreground"
                  title={t("common.preview")}
                >
                  <EyeIcon className="h-3.5 w-3.5" />
                </button>
                {canUpdateDoc && (
                  <button
                    onClick={() => openEditDialog(doc)}
                    className="flex h-7 w-7 items-center justify-center text-muted hover:text-foreground"
                    title={t("common.edit")}
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDeleteDoc && (
                  <button
                    onClick={() => openDeleteDialog(doc)}
                    className="flex h-7 w-7 items-center justify-center text-muted hover:text-red-500"
                    title={t("common.delete")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {doc.embeddingStatus === "completed" && (
                  <button
                    onClick={() => openTestDialog(doc)}
                    className="flex h-7 w-7 items-center justify-center text-muted hover:text-purple-500"
                    title={t("docTest.test")}
                  >
                    <ChatIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {canManageEmbedding && (
                  <>
                    {embeddingLoading.get(doc.id) ? (
                      <button
                        disabled
                        className="flex h-7 w-7 items-center justify-center text-muted"
                      >
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      </button>
                    ) : doc.embeddingStatus === "completed" ? (
                      <button
                        onClick={() => handleDeleteEmbedding(doc.id)}
                        className="flex h-7 w-7 items-center justify-center text-muted hover:text-red-500"
                        title={t("embedding.deleteEmbedding")}
                      >
                        <TrashEmbeddingIcon className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEmbed(doc.id)}
                        className="flex h-7 w-7 items-center justify-center text-muted hover:text-blue-500"
                        title={t("embedding.embed")}
                        disabled={doc.embeddingStatus === "processing"}
                      >
                        <LightningIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={dialogType === "create"}
        onClose={closeDialog}
        title={t("docs.create")}
        size="full"
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} loading={actionLoading}>
              {t("common.create")}
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col gap-4">
          <Input
            label={t("docs.docTitle")}
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted">
              {t("docs.content")}
            </label>
            <div className="flex-1">
              <MarkdownEditor
                value={formData.content}
                onChange={(value) => setFormData((prev) => ({ ...prev, content: value }))}
              />
            </div>
          </div>
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={dialogType === "edit"}
        onClose={closeDialog}
        title={t("docs.edit")}
        size="full"
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleUpdate} loading={actionLoading}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col gap-4">
          <Input
            label={t("docs.docTitle")}
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted">
              {t("docs.content")}
            </label>
            <div className="flex-1">
              <MarkdownEditor
                value={formData.content}
                onChange={(value) => setFormData((prev) => ({ ...prev, content: value }))}
              />
            </div>
          </div>
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={dialogType === "delete"}
        onClose={closeDialog}
        title={t("docs.delete")}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={actionLoading}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="font-mono text-sm">{t("docs.confirmDelete")}</p>
          <p className="font-mono text-sm text-muted">
            {t("docs.docTitle")}: <strong>{selectedDoc?.title}</strong>
          </p>
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={dialogType === "preview"}
        onClose={closeDialog}
        title={selectedDoc?.title || t("docs.preview")}
        size="full"
        footer={
          <Button onClick={closeDialog}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="flex h-full flex-col">
          <div className="mb-3 flex items-center gap-4 border-b border-border pb-2 shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {t("docs.wordCount")}: {selectedDoc?.wordCount}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {t("docs.status")}: {selectedDoc?.status}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <MarkdownEditor
              value={selectedDoc?.content || ""}
              readOnly
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialogType === "test"}
        onClose={closeDialog}
        title={`${t("docTest.test")}: ${selectedDoc?.title || ""}`}
        size="xl"
        footer={
          <Button onClick={closeDialog}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="flex h-[70vh] flex-col gap-4">
          <div className="flex gap-2 shrink-0">
            <Input
              placeholder={t("docTest.queryPlaceholder")}
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleTest();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleTest} loading={testLoading} disabled={!testQuery.trim()}>
              {testLoading ? t("docTest.testing") : t("docTest.send")}
            </Button>
          </div>

          {formError && (
            <p className="font-mono text-xs text-red-500 shrink-0">{formError}</p>
          )}

          <div className="flex-1 overflow-y-auto space-y-4">
            {testResult && (
              <>
                <div className="border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                      {t("docTest.aiAnswer")}
                      {testLoading && (
                        <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
                          <SpinnerIcon className="h-2.5 w-2.5 animate-spin" />
                          {t("docTest.streaming")}
                        </span>
                      )}
                    </span>
                    {testResult.responseTime && (
                      <span className="font-mono text-[10px] text-muted">
                        {testResult.responseTime}ms
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-sm whitespace-pre-wrap">
                    {streamingAnswer || testResult.answer}
                    {testLoading && streamingAnswer && (
                      <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse ml-0.5" />
                    )}
                  </div>
                  {testResult.usage && (
                    <div className="mt-2 flex gap-4 text-[10px] text-muted">
                      {testResult.usage.inputTokens && (
                        <span>{t("settings.inputTokens")}: {testResult.usage.inputTokens}</span>
                      )}
                      {testResult.usage.outputTokens && (
                        <span>{t("settings.outputTokens")}: {testResult.usage.outputTokens}</span>
                      )}
                    </div>
                  )}
                </div>

                {testResult.chunks.length > 0 && (
                  <div className="border border-border">
                    <div className="border-b border-border bg-card/50 px-4 py-2">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                        {t("docTest.matchedChunks")} ({testResult.chunks.length})
                      </span>
                    </div>
                    <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                      {testResult.chunks.map((chunk, index) => (
                        <div key={chunk.chunkId} className="p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-muted">
                              {t("docTest.fragment")} #{index + 1} (Index: {chunk.chunkIndex})
                            </span>
                            <span className={`font-mono text-[10px] px-2 py-0.5 border ${
                              chunk.similarity >= 0.8
                                ? "border-green-500/50 bg-green-500/10 text-green-500"
                                : chunk.similarity >= 0.6
                                ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-500"
                                : "border-border bg-muted/10 text-muted"
                            }`}>
                              {t("search.similarity")}: {(chunk.similarity * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="font-mono text-xs text-muted whitespace-pre-wrap line-clamp-4">
                            {chunk.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {testResult.chunks.length === 0 && (
                  <div className="border border-border bg-card/50 p-4 text-center">
                    <span className="font-mono text-xs text-muted">
                      {t("docTest.noChunksFound")}
                    </span>
                  </div>
                )}
              </>
            )}

            {!testResult && !testLoading && (
              <div className="flex h-full items-center justify-center">
                <span className="font-mono text-xs text-muted">
                  {t("docTest.enterQueryHint")}
                </span>
              </div>
            )}

            {testLoading && (
              <div className="flex h-full items-center justify-center">
                <SpinnerIcon className="h-6 w-6 animate-spin text-muted" />
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function PlusIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EditIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function EyeIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function LightningIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" opacity="0.4" />
      <path d="M12 2v4" />
    </svg>
  );
}

function TrashEmbeddingIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
    </svg>
  );
}

function ChatIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
