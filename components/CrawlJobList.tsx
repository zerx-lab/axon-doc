"use client";

import { useState, useEffect, useCallback } from "react";
import type { CrawlJob, CrawlPage, CrawlJobStatus } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

function calculateCrawlETA(job: CrawlJob): string {
  if (job.pages_crawled === 0 || job.total_pages === 0) return "";
  const remaining = job.total_pages - job.pages_crawled;
  const createdAt = new Date(job.created_at).getTime();
  const elapsed = (Date.now() - createdAt) / 1000;
  const rate = job.pages_crawled / elapsed;
  if (rate <= 0) return "";
  const eta = Math.ceil(remaining / rate);
  if (eta < 60) return `${eta}s`;
  if (eta < 3600) return `${Math.ceil(eta / 60)}m`;
  const hours = Math.floor(eta / 3600);
  const mins = Math.ceil((eta % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function ClockIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

interface CrawlJobListProps {
  readonly kbId: string;
  readonly onRefreshDocuments?: () => void;
}

interface CrawlProgressEvent {
  job_id: string;
  status: CrawlJobStatus;
  pages_crawled: number;
  total_pages: number;
  failed_pages: number;
  progress: number;
  latest_page?: {
    url: string;
    status: string;
    title?: string;
  };
}

export function CrawlJobList({ kbId, onRefreshDocuments }: CrawlJobListProps) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobPages, setJobPages] = useState<CrawlPage[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch all crawl jobs
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/crawl?kb_id=${kbId}`);
      if (!response.ok) throw new Error("Failed to fetch jobs");
      
      const data = await response.json();
      const sortedJobs = (data.jobs || []).sort(
        (a: CrawlJob, b: CrawlJob) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setJobs(sortedJobs);
      setError(null);
    } catch (err) {
      console.error("Error fetching jobs:", err);
      setError(t("error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [kbId, t]);

  // Fetch job details with pages
  const fetchJobDetails = useCallback(async (jobId: string) => {
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/crawl?job_id=${jobId}`);
      if (!response.ok) throw new Error("Failed to fetch job details");
      
      const data = await response.json();
      setJobPages(data.pages || []);
    } catch (err) {
      console.error("Error fetching job details:", err);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  // Handle pause/resume action
  const handleTogglePause = useCallback(async (jobId: string, currentStatus: CrawlJobStatus) => {
    const action = currentStatus === "running" ? "pause" : "resume";
    try {
      const response = await fetch("/api/crawl", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action }),
      });

      if (!response.ok) throw new Error(`Failed to ${action} job`);
      
      await fetchJobs();
    } catch (err) {
      console.error(`Error ${action}ing job:`, err);
    }
  }, [fetchJobs]);

  // Handle cancel action
  const handleCancel = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/crawl?job_id=${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to cancel job");
      
      await fetchJobs();
    } catch (err) {
      console.error("Error canceling job:", err);
    }
  }, [fetchJobs]);

  // Update job in state
  const updateJob = useCallback((jobId: string, updates: Partial<CrawlJob>) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, ...updates } : job
      )
    );
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    const channels: ReturnType<typeof supabase.channel>[] = [];

    jobs.forEach((job) => {
      if (job.status === "running" || job.status === "pending") {
        const channel = supabase.channel(`crawl:${job.id}`)
          .on("broadcast", { event: "page_crawled" }, ({ payload }) => {
            updateJob(job.id, {
              pages_crawled: payload.pages_crawled,
              failed_pages: payload.failed_pages,
            });
          })
          .on("broadcast", { event: "progress" }, ({ payload }: { payload: CrawlProgressEvent }) => {
            updateJob(job.id, {
              status: payload.status,
              progress: payload.progress,
              pages_crawled: payload.pages_crawled,
              total_pages: payload.total_pages,
              failed_pages: payload.failed_pages,
            });
          })
          .on("broadcast", { event: "completed" }, ({ payload }) => {
            updateJob(job.id, {
              status: payload.status,
              progress: 100,
              completed_at: new Date().toISOString(),
            });
            
            // Refresh documents when job completes
            if (onRefreshDocuments) {
              onRefreshDocuments();
            }
          })
          .subscribe();

        channels.push(channel);
      }
    });

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [jobs, supabase, updateJob, onRefreshDocuments]);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Open job details
  const openDetails = useCallback((jobId: string) => {
    setSelectedJob(jobId);
    fetchJobDetails(jobId);
  }, [fetchJobDetails]);

  // Close job details
  const closeDetails = useCallback(() => {
    setSelectedJob(null);
    setJobPages([]);
  }, []);

  // Get status badge color
  const getStatusColor = (status: CrawlJobStatus): string => {
    const colors: Record<CrawlJobStatus, string> = {
      pending: "text-muted-foreground",
      running: "text-blue-500",
      paused: "text-yellow-500",
      completed: "text-green-500",
      failed: "text-red-500",
      cancelled: "text-muted-foreground",
    };
    return colors[status] || "text-muted-foreground";
  };

  // Get status background color for badge
  const getStatusBgColor = (status: CrawlJobStatus): string => {
    const colors: Record<CrawlJobStatus, string> = {
      pending: "bg-muted/10",
      running: "bg-blue-500/10",
      paused: "bg-yellow-500/10",
      completed: "bg-green-500/10",
      failed: "bg-red-500/10",
      cancelled: "bg-muted/10",
    };
    return colors[status] || "bg-muted/10";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground font-mono">{t("common.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-red-500 font-mono">{error}</div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground font-mono">{t("crawl.noJobs")}</div>
      </div>
    );
  }

  const selectedJobData = jobs.find((job) => job.id === selectedJob);

  return (
    <>
      <div className="space-y-3">
        {jobs.map((job) => {
          const canPauseResume = job.status === "running" || job.status === "paused";
          const canCancel = job.status === "running" || job.status === "paused" || job.status === "pending";

          return (
            <div
              key={job.id}
              className="border border-border bg-card p-4 transition-colors hover:bg-foreground/5"
            >
              {/* Job Header */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-foreground mb-1 truncate">
                    {job.url}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${getStatusBgColor(
                        job.status
                      )} ${getStatusColor(job.status)}`}
                    >
                      {t(`crawl.status.${job.status}`)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(job.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {canPauseResume && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePause(job.id, job.status)}
                    >
                      {job.status === "running" ? t("crawl.pause") : t("crawl.resume")}
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(job.id)}
                    >
                      {t("crawl.cancel")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDetails(job.id)}
                  >
                    {t("crawl.viewDetails")}
                  </Button>
                </div>
              </div>

              {/* Progress Bar (for running jobs) */}
              {job.status === "running" && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{Math.round(job.progress)}%</span>
                      <span>{job.pages_crawled}/{job.total_pages} {t("crawl.pagesCrawled").toLowerCase()}</span>
                    </div>
                    {job.pages_crawled > 0 && (
                      <div className="flex items-center gap-1">
                        <ClockIcon className="h-2.5 w-2.5" />
                        <span>
                          {calculateCrawlETA(job)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="relative h-1.5 bg-card overflow-hidden rounded-full">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
                      style={{ width: `${Math.max(job.progress, 2)}%` }}
                    />
                    <div 
                      className="absolute inset-y-0 left-0 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      style={{ width: `${Math.max(job.progress, 2)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                <span>
                  {t("crawl.pagesCrawled")}: {job.pages_crawled}
                </span>
                <span>
                  {t("crawl.pagesTotal")}: {job.total_pages}
                </span>
                {job.failed_pages > 0 && (
                  <span className="text-red-500">
                    {t("crawl.pagesFailed")}: {job.failed_pages}
                  </span>
                )}
              </div>

              {/* Error Message */}
              {job.error && (
                <div className="mt-3 text-[10px] text-red-500 font-mono p-2 bg-red-500/10 border border-red-500/20">
                  {job.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Job Details Dialog */}
      {selectedJobData && (
        <Dialog
          open={selectedJob !== null}
          onClose={closeDetails}
          title={t("crawl.crawledPages")}
          size="lg"
        >
          <div className="space-y-4">
            {/* Job Summary */}
            <div className="border border-border bg-card p-4">
              <div className="font-mono text-xs text-foreground mb-2 truncate">
                {selectedJobData.url}
              </div>
              <div className="grid grid-cols-3 gap-4 text-[10px] font-mono">
                <div>
                  <div className="text-muted-foreground mb-1">{t("common.status")}</div>
                  <div className={getStatusColor(selectedJobData.status)}>
                    {t(`crawl.status.${selectedJobData.status}`)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t("crawl.pagesCrawled")}</div>
                  <div className="text-foreground">{selectedJobData.pages_crawled}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t("crawl.pagesFailed")}</div>
                  <div className="text-red-500">{selectedJobData.failed_pages}</div>
                </div>
              </div>
            </div>

            {/* Pages List */}
            {detailsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground font-mono">{t("common.loading")}</div>
              </div>
            ) : jobPages.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground font-mono">{t("common.noData")}</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {jobPages.map((page) => (
                  <div
                    key={page.id}
                    className="border border-border bg-card p-3 hover:bg-foreground/5"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-foreground mb-1 truncate">
                          {page.title || page.url}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {page.url}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                          page.status === "completed"
                            ? "bg-green-500/10 text-green-500"
                            : page.status === "failed"
                            ? "bg-red-500/10 text-red-500"
                            : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {page.status}
                      </span>
                    </div>

                    {page.error_message && (
                      <div className="text-[10px] text-red-500 font-mono p-2 bg-red-500/10 border border-red-500/20">
                        {page.error_message}
                      </div>
                    )}

                    {page.crawled_at && (
                      <div className="text-[10px] text-muted-foreground font-mono mt-2">
                        {new Date(page.crawled_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
