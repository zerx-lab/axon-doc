"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button, Dialog } from "@/components/ui";
import { Thread } from "@/components/assistant-ui/thread";
import { ErrorAlert } from "@/components/chat/ErrorAlert";
import { ReferencesProvider, type MessageReference } from "@/lib/references-context";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import type { ChatSession, KnowledgeBase, ChatMessage, ChatMessageMetadata } from "@/lib/supabase/types";

export default function ChatPage() {
  const { t, locale } = useI18n();
  const { user: authUser, isLoading: authLoading, hasPermission } = useAuth();
  const router = useRouter();

  const canAccess = hasPermission(PERMISSIONS.CHAT_ACCESS);
  const canCreate = hasPermission(PERMISSIONS.CHAT_CREATE);
  const canDelete = hasPermission(PERMISSIONS.CHAT_DELETE);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null);
  const [kbDialogOpen, setKbDialogOpen] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentUserId = authUser?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
   const [isRunning, setIsRunning] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [retrievalDebug, setRetrievalDebug] = useState<{
     enabled: boolean;
     kbIds: string[];
     kbCount: number;
     searchExecuted: boolean;
     chunksFound: number;
     error: string | null;
     embeddingModel: string | null;
     searchParams: { matchCount: number; matchThreshold: number; vectorWeight: number } | null;
     references?: Array<{ documentId: string; documentTitle: string; sourceUrl?: string | null; contextSummary?: string | null; content: string; similarity?: number; chunkIndex?: number }>;
     contextEnabled: boolean;
     hybridSearchUsed: boolean;
     rerankEnabled: boolean;
     candidatesBeforeRerank: number;
     rerankerProvider: string | null;
     resultTypes: { vector: number; bm25: number; hybrid: number } | null;
   } | null>(null);
   const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!currentUserId || !canAccess) return;

    try {
      const params = new URLSearchParams({ operatorId: currentUserId });
      const response = await fetch(`/api/chat/sessions?${params}`);
      const result = await response.json();
      if (result.sessions) {
        setSessions(result.sessions);
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, canAccess]);

  const fetchKnowledgeBases = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const params = new URLSearchParams({ operatorId: currentUserId });
      // 使用新的 API 获取用户有权限访问的知识库
      const response = await fetch(`/api/chat/accessible-kb?${params}`);
      const result = await response.json();
      if (result.knowledgeBases) {
        setKnowledgeBases(result.knowledgeBases);
      }
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error);
    }
  }, [currentUserId]);

  const fetchMessages = useCallback(async (sessionId: string) => {
    if (!currentUserId) return;

    try {
      const params = new URLSearchParams({ operatorId: currentUserId });
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages?${params}`);
      const result = await response.json();
      if (result.messages) {
        setMessages(result.messages);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
      setMessages([]);
    }
  }, [currentUserId]);

  const convertMessage = useCallback((message: ChatMessage): ThreadMessageLike => {
    let processedContent = message.content;
    
    if (message.role === "assistant" && message.metadata) {
      const metadata = message.metadata as unknown as ChatMessageMetadata;
      if (metadata.references && metadata.references.length > 0) {
        processedContent = processedContent.replace(/\[(\d+)\]/g, (match, num) => {
          const index = parseInt(num, 10) - 1;
          const ref = metadata.references?.[index];
          if (ref?.sourceUrl) {
            return `[\\[${num}\\]](${ref.sourceUrl} "${ref.documentTitle}")`;
          }
          return match;
        });
      }
    }
    
    return {
      id: message.id,
      role: message.role as "user" | "assistant" | "system",
      content: [{ type: "text", text: processedContent }],
      createdAt: new Date(message.created_at),
    };
  }, []);

  const onNew = useCallback(async (appendMessage: AppendMessage) => {
    if (!currentSession || !currentUserId) return;
    if (selectedKbIds.length === 0) return;
    
    const textPart = appendMessage.content.find(c => c.type === "text");
    if (!textPart || textPart.type !== "text") return;
    
    const userContent = textPart.text;
    const userMessageId = crypto.randomUUID();
    
    const optimisticUserMessage: ChatMessage = {
      id: userMessageId,
      session_id: currentSession.id,
      role: "user",
      content: userContent,
      status: "completed",
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, optimisticUserMessage]);
    setIsRunning(true);
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch(`/api/chat/sessions/${currentSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          content: userContent,
          useKnowledgeBase: selectedKbIds.length > 0,
          userMessageId,
          locale,
        }),
        signal: abortControllerRef.current.signal,
      });
      
       if (!response.ok) {
         const errorData = await response.json().catch(() => ({ error: "Failed to send message" }));
         throw new Error(errorData.error || "Failed to send message");
       }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      
      const decoder = new TextDecoder();
      let assistantMessageId: string | null = null;
      let assistantContent = "";
      let currentReferences: ChatMessageMetadata["references"] = undefined;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case "user_message":
                  setMessages(prev => 
                    prev.map(m => m.id === userMessageId ? data.message : m)
                  );
                  break;
                
                case "retrieval_debug":
                  setRetrievalDebug(data.debug);
                  break;
                
                case "context":
                  currentReferences = data.references;
                  setRetrievalDebug(prev => prev ? { ...prev, references: data.references } : null);
                  break;
                  
                case "assistant_start":
                  assistantMessageId = data.messageId;
                  const assistantPlaceholder: ChatMessage = {
                    id: assistantMessageId!,
                    session_id: currentSession.id,
                    role: "assistant",
                    content: "",
                    status: "streaming",
                    metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  setMessages(prev => [...prev, assistantPlaceholder]);
                  break;
                  
                case "delta":
                  assistantContent += data.content;
                  if (assistantMessageId) {
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantMessageId
                          ? { ...m, content: assistantContent }
                          : m
                      )
                    );
                  }
                  break;
                  
                 case "done":
                   if (assistantMessageId) {
                     const metadata = {
                       ...data.usage,
                       references: currentReferences,
                     };
                     setMessages(prev =>
                       prev.map(m =>
                         m.id === assistantMessageId
                           ? { ...m, status: "completed" as const, metadata: metadata as unknown as ChatMessage["metadata"] }
                           : m
                       )
                     );
                   }
                   fetchSessions();
                   break;
                   
                 case "error":
                   console.error("Stream error:", data.error);
                   setError(data.error);
                   if (assistantMessageId) {
                     setMessages(prev =>
                       prev.map(m =>
                         m.id === assistantMessageId
                           ? { ...m, status: "failed" as const }
                           : m
                       )
                     );
                   }
                   break;
              }
            } catch {
              // JSON parse error for incomplete chunks
            }
          }
        }
      }
     } catch (error) {
       if ((error as Error).name === "AbortError") {
         console.log("Request cancelled");
       } else {
         const errorMessage = error instanceof Error ? error.message : String(error);
         console.error("Failed to send message:", error);
         setError(errorMessage);
         setMessages(prev => prev.filter(m => m.id !== userMessageId));
       }
     } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [currentSession, currentUserId, selectedKbIds, fetchSessions]);

  const onCancel = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const onReload = useCallback(async (parentId: string | null, _config: unknown) => {
    if (!currentSession || !currentUserId || !parentId) return;
    if (selectedKbIds.length === 0) return;

    const parentIndex = messages.findIndex(m => m.id === parentId);
    if (parentIndex === -1) return;

    const parentMessage = messages[parentIndex];
    if (parentMessage.role !== "user") return;

    setMessages(prev => prev.slice(0, parentIndex + 1));
    setIsRunning(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/chat/sessions/${currentSession.id}/messages/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          parentMessageId: parentId,
          locale,
        }),
        signal: abortControllerRef.current.signal,
      });

       if (!response.ok) {
         const errorData = await response.json().catch(() => ({ error: "Failed to regenerate message" }));
         throw new Error(errorData.error || "Failed to regenerate message");
       }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantMessageId: string | null = null;
      let assistantContent = "";
      let currentReferences: ChatMessageMetadata["references"] = undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "assistant_start":
                  assistantMessageId = data.messageId;
                  const assistantPlaceholder: ChatMessage = {
                    id: assistantMessageId!,
                    session_id: currentSession.id,
                    role: "assistant",
                    content: "",
                    status: "streaming",
                    metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  setMessages(prev => [...prev, assistantPlaceholder]);
                  break;

                case "context":
                  currentReferences = data.references;
                  setRetrievalDebug(prev => prev ? { ...prev, references: data.references } : null);
                  break;

                case "delta":
                  assistantContent += data.content;
                  if (assistantMessageId) {
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantMessageId
                          ? { ...m, content: assistantContent }
                          : m
                      )
                    );
                  }
                  break;

                 case "done":
                   if (assistantMessageId) {
                     const metadata = {
                       ...data.usage,
                       references: currentReferences,
                     };
                     setMessages(prev =>
                       prev.map(m =>
                         m.id === assistantMessageId
                           ? { ...m, status: "completed" as const, metadata: metadata as unknown as ChatMessage["metadata"] }
                           : m
                       )
                     );
                   }
                   break;

                 case "error":
                   console.error("Stream error:", data.error);
                   setError(data.error);
                   if (assistantMessageId) {
                     setMessages(prev =>
                       prev.map(m =>
                         m.id === assistantMessageId
                           ? { ...m, status: "failed" as const }
                           : m
                       )
                     );
                   }
                   break;
              }
            } catch {
              // JSON parse error for incomplete chunks
            }
          }
        }
      }
     } catch (error) {
       if ((error as Error).name !== "AbortError") {
         const errorMessage = error instanceof Error ? error.message : String(error);
         console.error("Failed to regenerate message:", error);
         setError(errorMessage);
       }
     } finally {
       setIsRunning(false);
       abortControllerRef.current = null;
     }
   }, [currentSession, currentUserId, selectedKbIds, messages]);

  const runtime = useExternalStoreRuntime({
    messages,
    setMessages: (newMessages) => {
      setMessages(newMessages as unknown as ChatMessage[]);
    },
    isRunning,
    convertMessage,
    onNew,
    onCancel,
    onReload,
  });

  // Build a map of message ID to references for the ReferencesProvider
  const referencesMap = useMemo(() => {
    const map = new Map<string, MessageReference[]>();
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.metadata) {
        const metadata = msg.metadata as unknown as ChatMessageMetadata;
        if (metadata.references && metadata.references.length > 0) {
          map.set(msg.id, metadata.references);
        }
      }
    }
    return map;
  }, [messages]);

  useEffect(() => {
    fetchSessions();
    fetchKnowledgeBases();
  }, [fetchSessions, fetchKnowledgeBases]);

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/login");
    }
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (currentSession) {
      setSelectedKbIds(currentSession.kb_ids || []);
      fetchMessages(currentSession.id);
    } else {
      setMessages([]);
    }
  }, [currentSession, fetchMessages]);

  if (!authLoading && authUser && !canAccess) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="font-mono text-lg font-medium text-red-500">{t("error.accessDenied")}</h2>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{t("error.noPermission")}</p>
        </div>
      </div>
    );
  }

  const createNewSession = async () => {
    if (!currentUserId || !canCreate) return;

    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          kbIds: selectedKbIds,
        }),
      });

      const result = await response.json();
      if (result.success && result.session) {
        setSessions((prev) => [result.session, ...prev]);
        setCurrentSession(result.session);
      }
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  const selectSession = (session: ChatSession) => {
    setCurrentSession(session);
  };

  const confirmDeleteSession = (session: ChatSession) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const deleteSession = async () => {
    if (!currentUserId || !sessionToDelete) return;

    try {
      const params = new URLSearchParams({ operatorId: currentUserId });
      const response = await fetch(`/api/chat/sessions/${sessionToDelete.id}?${params}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (result.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id));
        if (currentSession?.id === sessionToDelete.id) {
          setCurrentSession(null);
        }
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    } finally {
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    }
  };

  const toggleKbSelection = (kbId: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId]
    );
  };

  const applyKbSelection = async () => {
    if (currentSession && currentUserId) {
      await fetch(`/api/chat/sessions/${currentSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          kbIds: selectedKbIds,
        }),
      });
      setCurrentSession((prev) => (prev ? { ...prev, kb_ids: selectedKbIds } : null));
    }
    setKbDialogOpen(false);
  };

  return (
    <>
      <ErrorAlert error={error} onDismiss={() => setError(null)} />
      <div className="flex h-[calc(100vh-64px)]">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 border-r border-border bg-card transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`} style={{ top: '56px' }}>
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <span className="font-mono text-sm font-medium">{t("chat.sessions")}</span>
            <div className="flex items-center gap-2">
              {canCreate && (
                <button
                  onClick={createNewSession}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.08]"
                  title={t("chat.newChat")}
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.08] md:hidden"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="h-[calc(100%-56px)] overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="font-mono text-xs text-muted-foreground">{t("common.loading")}...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="font-mono text-xs text-muted-foreground">{t("chat.noSessions")}</span>
                {canCreate && (
                  <Button size="sm" className="mt-4" onClick={createNewSession}>
                    <PlusIcon className="mr-2 h-3 w-3" />
                    {t("chat.newChat")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                      currentSession?.id === session.id 
                        ? "bg-foreground/[0.08]" 
                        : "hover:bg-foreground/[0.04]"
                    }`}
                    onClick={() => { selectSession(session); setSidebarOpen(false); }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm">
                        {session.title || t("chat.untitled")}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {session.message_count} {t("chat.messageCount")}
                      </p>
                    </div>
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDeleteSession(session);
                        }}
                        className="ml-2 hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 group-hover:flex"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-2 md:px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground md:hidden"
            >
              <MenuIcon className="h-4 w-4" />
            </button>
            <span className="font-mono text-sm font-medium truncate">
              {currentSession?.title || t("chat.newChat")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDebugPanelOpen(!debugPanelOpen)}
              disabled={!currentSession || selectedKbIds.length === 0}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                debugPanelOpen && currentSession && selectedKbIds.length > 0
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-border hover:bg-foreground/[0.04] hover:border-foreground/20 disabled:hover:bg-transparent disabled:hover:border-border"
              }`}
              title={t("chat.debugPanel")}
            >
              <BugIcon className="h-3.5 w-3.5" />
              {t("chat.debug")}
            </button>
            <button
              onClick={() => setKbDialogOpen(true)}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:bg-foreground/[0.04] hover:border-foreground/20"
            >
              <DatabaseIcon className="h-3.5 w-3.5" />
              {selectedKbIds.length > 0
                ? `${selectedKbIds.length} ${t("chat.kbSelected")}`
                : t("chat.selectKb")}
            </button>
          </div>
        </div>

        {!currentSession || selectedKbIds.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <DatabaseIcon className="h-8 w-8 text-amber-500" />
            </div>
            <div className="text-center">
              <p className="font-mono text-sm font-medium">
                {!currentSession ? t("chat.noSessions") : t("chat.noKbSelected")}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{t("chat.kbRequired")}</p>
            </div>
            {!currentSession ? (
              <Button size="sm" onClick={createNewSession} disabled={!canCreate}>
                <PlusIcon className="mr-2 h-3 w-3" />
                {t("chat.newChat")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setKbDialogOpen(true)}>
                <DatabaseIcon className="mr-2 h-3 w-3" />
                {t("chat.selectKb")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <ReferencesProvider referencesMap={referencesMap}>
                <AssistantRuntimeProvider key={currentSession.id} runtime={runtime}>
                  <Thread />
                </AssistantRuntimeProvider>
              </ReferencesProvider>
            </div>
            {debugPanelOpen && (
              <div className="w-80 flex-shrink-0 border-l border-border bg-card overflow-y-auto">
                <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
                  <span className="font-mono text-xs font-medium">{t("chat.debugPanel")}</span>
                  <button
                    onClick={() => setDebugPanelOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                {retrievalDebug ? (
                  <div className="p-4 space-y-4">
                    <div className="border border-border bg-card/50 p-3">
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t("docTest.ragPipeline")}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <PipelineStep
                          label={t("docTest.contextEnhance")}
                          active={retrievalDebug.contextEnabled}
                          icon={<ContextIcon className="h-3 w-3" />}
                        />
                        <PipelineArrow />
                        <PipelineStep
                          label={t("docTest.hybridSearch")}
                          active={retrievalDebug.hybridSearchUsed}
                          icon={<SearchIcon className="h-3 w-3" />}
                          detail={retrievalDebug.resultTypes ? 
                            `V:${retrievalDebug.resultTypes.vector || 0} B:${retrievalDebug.resultTypes.bm25 || 0} H:${retrievalDebug.resultTypes.hybrid || 0}` 
                            : undefined}
                        />
                        <PipelineArrow />
                        <PipelineStep
                          label={t("docTest.rerank")}
                          active={retrievalDebug.rerankEnabled}
                          icon={<RerankIcon className="h-3 w-3" />}
                          detail={retrievalDebug.rerankEnabled ? 
                            `${retrievalDebug.candidatesBeforeRerank} → ${retrievalDebug.chunksFound}` 
                            : undefined}
                        />
                      </div>
                      <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground flex-wrap">
                        {retrievalDebug.embeddingModel && (
                          <span>{t("docTest.embeddingModel")}: {retrievalDebug.embeddingModel}</span>
                        )}
                        {retrievalDebug.rerankerProvider && (
                          <span>{t("docTest.rerankerModel")}: {retrievalDebug.rerankerProvider}</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-mono text-[10px] font-medium uppercase text-muted-foreground">Status</h4>
                      <div className="space-y-1 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("chat.searchExecuted")}</span>
                          <span className={retrievalDebug.searchExecuted ? "text-green-500" : "text-red-500"}>
                            {retrievalDebug.searchExecuted ? t("common.yes") : t("common.no")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("chat.chunksFound")}</span>
                          <span className={retrievalDebug.chunksFound > 0 ? "text-green-500" : "text-amber-500"}>
                            {retrievalDebug.chunksFound}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("chat.kbCount")}</span>
                          <span>{retrievalDebug.kbCount}</span>
                        </div>
                      </div>
                    </div>
                    
                    {retrievalDebug.error && (
                      <div className="space-y-2">
                        <h4 className="font-mono text-[10px] font-medium uppercase text-red-500">{t("common.error")}</h4>
                        <p className="font-mono text-xs text-red-400 bg-red-500/10 p-2 rounded">{retrievalDebug.error}</p>
                      </div>
                    )}
                    
                    {retrievalDebug.searchParams && (
                      <div className="space-y-2">
                        <h4 className="font-mono text-[10px] font-medium uppercase text-muted-foreground">{t("chat.searchParams")}</h4>
                        <div className="space-y-1 font-mono text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("chat.matchCount")}</span>
                            <span>{retrievalDebug.searchParams.matchCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("chat.threshold")}</span>
                            <span>{retrievalDebug.searchParams.matchThreshold}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("chat.vectorWeight")}</span>
                            <span>{retrievalDebug.searchParams.vectorWeight}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {retrievalDebug.references && retrievalDebug.references.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-mono text-[10px] font-medium uppercase text-muted-foreground">
                          {t("chat.references")} ({retrievalDebug.references.length})
                        </h4>
                        <div className="space-y-2">
                          {retrievalDebug.references.map((ref, i) => (
                            <div key={i} className="bg-foreground/5 p-2.5 rounded-md space-y-2 border border-border/50">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-mono text-xs font-medium line-clamp-2">{ref.documentTitle}</span>
                                  {ref.chunkIndex !== undefined && (
                                    <span className="font-mono text-[10px] text-muted-foreground ml-1">
                                      #{ref.chunkIndex + 1}
                                    </span>
                                  )}
                                </div>
                                {ref.similarity !== undefined && (
                                  <span className="font-mono text-[10px] text-green-400 shrink-0 bg-green-500/10 px-1.5 py-0.5 rounded">
                                    {(ref.similarity * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              {ref.sourceUrl && (
                                <a
                                  href={ref.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 font-mono text-[10px] text-blue-400 hover:text-blue-300 transition-colors group"
                                  title={ref.sourceUrl}
                                >
                                  <LinkIcon className="h-3 w-3 shrink-0" />
                                  <span className="truncate group-hover:underline">{ref.sourceUrl}</span>
                                </a>
                              )}
                              {ref.contextSummary && (
                                <div className="bg-purple-500/10 border-l-2 border-purple-500/50 pl-2 py-1">
                                  <p className="font-mono text-[10px] text-foreground/70 line-clamp-3">{ref.contextSummary}</p>
                                </div>
                              )}
                              <p className="font-mono text-[10px] text-muted-foreground/70 line-clamp-2 italic">{ref.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <BugIcon className="h-8 w-8 text-muted-foreground/50 mb-3" />
                    <p className="font-mono text-xs text-muted-foreground">
                      {t("chat.noDebugData")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title={t("chat.deleteSession")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={deleteSession}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="font-mono text-sm">{t("chat.confirmDelete")}</p>
      </Dialog>

      <Dialog
        open={kbDialogOpen}
        onClose={() => setKbDialogOpen(false)}
        title={t("chat.selectKb")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setKbDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={applyKbSelection}>{t("common.confirm")}</Button>
          </>
        }
      >
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {knowledgeBases.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">{t("kb.noData")}</p>
          ) : (
            knowledgeBases.map((kb) => (
              <label
                key={kb.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                  selectedKbIds.includes(kb.id)
                    ? "border-foreground/30 bg-foreground/5"
                    : "border-border hover:border-foreground/20 hover:bg-foreground/[0.02]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedKbIds.includes(kb.id)}
                  onChange={() => toggleKbSelection(kb.id)}
                  className="h-4 w-4 rounded border-border accent-foreground"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-medium truncate">{kb.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {kb.document_count} {t("docs.document").toLowerCase()}(s)
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
      </Dialog>
      </div>
    </>
  );
}

function PlusIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
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

function DatabaseIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function BugIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-1H4a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2Z" />
      <path d="M12 7v10M8 14h8" />
    </svg>
  );
}

function CloseIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function MenuIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

function LinkIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function ContextIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function SearchIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function RerankIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M3 12h12M3 18h6" />
    </svg>
  );
}

function CheckIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

interface PipelineStepProps {
  readonly label: string;
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly detail?: string;
}

function PipelineStep({ label, active, icon, detail }: PipelineStepProps) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 border font-mono text-[10px] ${
      active
        ? "border-green-500/50 bg-green-500/10 text-green-400"
        : "border-border bg-muted/10 text-muted-foreground"
    }`}>
      {icon}
      <span className="uppercase tracking-wider">{label}</span>
      {active && <CheckIcon className="h-2.5 w-2.5" />}
      {detail && <span className="text-[9px] opacity-70">({detail})</span>}
    </div>
  );
}

function PipelineArrow() {
  return (
    <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
