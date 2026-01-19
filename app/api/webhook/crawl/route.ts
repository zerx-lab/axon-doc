import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrawlPageStatus, CrawlJobStatus } from "@/lib/supabase/types";

interface PageCrawledPayload {
  type: "page_crawled";
  job_id: string;
  url: string;
  status: CrawlPageStatus;
  title?: string;
  document_id?: string;
  content_hash?: string;
  depth?: number;
  error_message?: string;
}

interface JobProgressPayload {
  type: "job_progress";
  job_id: string;
  pages_crawled: number;
  total_pages: number;
  failed_pages: number;
  progress: number;
}

interface JobCompletedPayload {
  type: "job_completed";
  job_id: string;
  status: CrawlJobStatus;
  kb_id: string;
  pages_crawled: number;
  total_pages: number;
  failed_pages: number;
  document_ids: string[];
  error?: string;
}

type CrawlWebhookPayload = PageCrawledPayload | JobProgressPayload | JobCompletedPayload;

async function broadcastProgress(supabase: ReturnType<typeof createAdminClient>, jobId: string, event: string, payload: Record<string, unknown>) {
  const channel = supabase.channel(`crawl:${jobId}`);
  await channel.send({
    type: "broadcast",
    event,
    payload,
  });
  await supabase.removeChannel(channel);
}

export async function POST(request: NextRequest) {
  try {
    const payload: CrawlWebhookPayload = await request.json();
    const supabase = createAdminClient();

    console.log("Crawl webhook received:", payload.type, payload.job_id);

    switch (payload.type) {
      case "page_crawled": {
        const { job_id, url, status, title, document_id, content_hash, depth, error_message } = payload;

        const { error: upsertError } = await supabase
          .from("crawl_pages")
          .upsert({
            job_id,
            url,
            status,
            title,
            document_id,
            content_hash,
            depth: depth || 0,
            error_message,
            crawled_at: status === "completed" || status === "failed" ? new Date().toISOString() : null,
          }, { onConflict: "job_id,url" });

        if (upsertError) {
          console.error("Failed to upsert crawl_page:", upsertError);
        }

        await broadcastProgress(supabase, job_id, "page_crawled", {
          url,
          status,
          title,
          error_message,
        });

        break;
      }

      case "job_progress": {
        const { job_id, pages_crawled, total_pages, failed_pages, progress } = payload;

        await supabase
          .from("crawl_jobs")
          .update({
            pages_crawled,
            total_pages,
            failed_pages,
            progress,
            status: "running",
          })
          .eq("id", job_id);

        await broadcastProgress(supabase, job_id, "progress", {
          pages_crawled,
          total_pages,
          failed_pages,
          progress,
        });

        break;
      }

      case "job_completed": {
        const { job_id, status, pages_crawled, total_pages, failed_pages, error } = payload;

        await supabase
          .from("crawl_jobs")
          .update({
            status,
            pages_crawled,
            total_pages,
            failed_pages,
            progress: 100,
            error: error || null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job_id);

        await broadcastProgress(supabase, job_id, "completed", {
          status,
          pages_crawled,
          total_pages,
          failed_pages,
          error,
        });

        console.log(
          `Crawl job ${job_id} ${status}: ${pages_crawled}/${total_pages} pages (${failed_pages} failed)`
        );

        break;
      }

      default:
        console.warn("Unknown webhook type:", (payload as { type: string }).type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
