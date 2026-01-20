"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useTask } from "@/lib/task-context";
import { Button, Input, Dialog } from "@/components/ui";
import { useRouter } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  created_at: string;
  updated_at: string;
}

interface EmbeddingStats {
  embedded: number;
  total: number;
  pending: number;
}

type DialogType = "create" | "edit" | "delete" | null;

export default function KnowledgeBasesPage() {
  const { t } = useI18n();
  const { user: authUser, isLoading: authLoading, hasPermission } = useAuth();
  const router = useRouter();
  const { tasks } = useTask();
  const prevTasksRef = useRef<typeof tasks>([]);
  
  const canListKB = hasPermission(PERMISSIONS.KB_LIST);
  const canCreateKB = hasPermission(PERMISSIONS.KB_CREATE);
  const canUpdateKB = hasPermission(PERMISSIONS.KB_UPDATE);
  const canDeleteKB = hasPermission(PERMISSIONS.KB_DELETE);
  const canManageEmbedding = hasPermission(PERMISSIONS.EMBEDDING_MANAGE);
  
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [embeddingStats, setEmbeddingStats] = useState<Map<string, EmbeddingStats>>(new Map());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [embeddingLoading, setEmbeddingLoading] = useState<Set<string>>(new Set());

  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [formError, setFormError] = useState("");

  const currentUserId = authUser?.id;

  const fetchEmbeddingStats = useCallback(async (kbId: string) => {
    if (!currentUserId) return;
    
    try {
      const params = new URLSearchParams({
        kbId,
        operatorId: currentUserId,
      });
      
      const response = await fetch(`/api/embeddings?${params}`);
      const result = await response.json();
      
      if (result.success && result.stats) {
        setEmbeddingStats(prev => {
          const newStats = new Map(prev);
          newStats.set(kbId, {
            embedded: result.stats.embedded || 0,
            total: result.stats.total || 0,
            pending: result.stats.pending || 0,
          });
          return newStats;
        });
      }
    } catch (error) {
      console.error("Failed to fetch embedding stats:", error);
    }
  }, [currentUserId]);

  const fetchKnowledgeBases = useCallback(async () => {
    if (!currentUserId || !canListKB) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
      });
      if (search) {
        params.append("search", search);
      }
      
      const response = await fetch(`/api/kb?${params}`);
      const result = await response.json();
      
      if (result.knowledgeBases) {
        setKnowledgeBases(result.knowledgeBases);
        result.knowledgeBases.forEach((kb: KnowledgeBase) => {
          fetchEmbeddingStats(kb.id);
        });
      }
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, search, canListKB, fetchEmbeddingStats]);

  useEffect(() => {
    fetchKnowledgeBases();
  }, [fetchKnowledgeBases]);

  useEffect(() => {
    const prevTasks = prevTasksRef.current;
    const relevantTaskCompleted = tasks.some((task) => {
      const prevTask = prevTasks.find((t) => t.id === task.id);
      const wasRunningOrPending = prevTask && (prevTask.status === "running" || prevTask.status === "pending");
      const isNowCompleted = task.status === "completed" || task.status === "failed";
      const isRelevant = 
        (task.type === "embed_kb" && task.data.kbId && knowledgeBases.some((kb) => kb.id === task.data.kbId)) ||
        (task.type === "crawl_webpage" && task.data.kbId && knowledgeBases.some((kb) => kb.id === task.data.kbId));
      return wasRunningOrPending && isNowCompleted && isRelevant;
    });

    if (relevantTaskCompleted) {
      fetchKnowledgeBases();
    }

    prevTasksRef.current = tasks;
  }, [tasks, knowledgeBases, fetchKnowledgeBases]);
  
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/login");
    }
  }, [authLoading, authUser, router]);
  
  if (!authLoading && authUser && !canListKB) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="font-mono text-lg font-medium text-red-500">{t("error.accessDenied")}</h2>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{t("error.noPermission")}</p>
        </div>
      </div>
    );
  }

  const openCreateDialog = () => {
    setFormData({
      name: "",
      description: "",
    });
    setFormError("");
    setDialogType("create");
  };

  const openEditDialog = (kb: KnowledgeBase) => {
    setSelectedKB(kb);
    setFormData({
      name: kb.name,
      description: kb.description || "",
    });
    setFormError("");
    setDialogType("edit");
  };

  const openDeleteDialog = (kb: KnowledgeBase) => {
    setSelectedKB(kb);
    setDialogType("delete");
  };

  const closeDialog = () => {
    setDialogType(null);
    setSelectedKB(null);
    setFormError("");
  };

  const handleCreate = async () => {
    if (!currentUserId) return;
    if (!formData.name) {
      setFormError(t("kb.nameRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          name: formData.name,
          description: formData.description || undefined,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchKnowledgeBases();
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
    if (!currentUserId || !selectedKB) return;

    if (!formData.name) {
      setFormError(t("kb.nameRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/kb", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          kbId: selectedKB.id,
          name: formData.name,
          description: formData.description,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchKnowledgeBases();
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
    if (!currentUserId || !selectedKB) return;

    setActionLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        kbId: selectedKB.id,
      });
      
      const response = await fetch(`/api/kb?${params}`, {
        method: "DELETE",
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchKnowledgeBases();
      } else {
        setFormError(result.error || t("error.deleteFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.deleteFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewKB = (kb: KnowledgeBase) => {
    router.push(`/dashboard/knowledge-bases/${kb.id}`);
  };

  const handleEmbedAll = async (kbId: string) => {
    if (!currentUserId) return;

    setEmbeddingLoading(prev => new Set(prev).add(kbId));
    try {
      const response = await fetch("/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          action: "embed_kb",
          kbId,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        await fetchEmbeddingStats(kbId);
      }
    } catch (error) {
      console.error("Failed to embed all documents:", error);
    } finally {
      setEmbeddingLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(kbId);
        return newSet;
      });
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg md:text-xl font-medium">{t("kb.title")}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {knowledgeBases.length} {t("kb.knowledgeBase").toLowerCase()}(s)
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={fetchKnowledgeBases}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            <RefreshIcon className={`mr-2 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
          {canCreateKB && (
            <Button onClick={openCreateDialog} className="w-full sm:w-auto">
              <PlusIcon className="mr-2 h-3 w-3" />
              {t("kb.create")}
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <Input
          placeholder={t("kb.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm"
        />
      </div>

      <div className="border border-border overflow-x-auto">
        <div className="grid grid-cols-[2fr_3fr_120px_120px_160px_180px] gap-4 border-b border-border bg-card px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("kb.name")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("kb.description")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("kb.documentCount")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("embedding.status")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("common.createdAt")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("common.actions")}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs text-muted-foreground">{t("common.loading")}...</span>
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs text-muted-foreground">{t("common.noData")}</span>
          </div>
        ) : (
          knowledgeBases.map((kb) => {
            const stats = embeddingStats.get(kb.id);
            const isEmbedding = embeddingLoading.has(kb.id);
            
            return (
              <div
                key={kb.id}
                className="grid grid-cols-[2fr_3fr_120px_120px_160px_180px] gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-card/50"
              >
                <div className="font-mono text-sm">{kb.name}</div>
                <div className="font-mono text-sm text-muted-foreground">
                  {kb.description || "-"}
                </div>
                <div className="font-mono text-sm text-muted-foreground">
                  {kb.document_count}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {stats ? (
                    <span className={stats.embedded === stats.total && stats.total > 0 ? "text-green-600" : ""}>
                      {stats.embedded}/{stats.total} {t("embedding.embeddedDocs").toLowerCase()}
                    </span>
                  ) : (
                    "-"
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {new Date(kb.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleViewKB(kb)}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                    title={t("common.view")}
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                  </button>
                  {canManageEmbedding && stats && stats.pending > 0 && (
                    <button
                      onClick={() => handleEmbedAll(kb.id)}
                      disabled={isEmbedding}
                      className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
                      title={t("embedding.embedAll")}
                    >
                      {isEmbedding ? (
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <SparklesIcon className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {canUpdateKB && (
                    <button
                      onClick={() => openEditDialog(kb)}
                      className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                      title={t("common.edit")}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDeleteKB && (
                    <button
                      onClick={() => openDeleteDialog(kb)}
                      className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-red-500"
                      title={t("common.delete")}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog
        open={dialogType === "create"}
        onClose={closeDialog}
        title={t("kb.create")}
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
        <div className="space-y-4">
          <Input
            label={t("kb.name")}
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <Input
            label={t("kb.description")}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          />
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={dialogType === "edit"}
        onClose={closeDialog}
        title={t("kb.edit")}
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
        <div className="space-y-4">
          <Input
            label={t("kb.name")}
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <Input
            label={t("kb.description")}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          />
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={dialogType === "delete"}
        onClose={closeDialog}
        title={t("kb.delete")}
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
          <p className="font-mono text-sm">{t("kb.confirmDelete")}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {t("kb.name")}: <strong>{selectedKB?.name}</strong>
          </p>
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
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

function SparklesIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SpinnerIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function RefreshIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
