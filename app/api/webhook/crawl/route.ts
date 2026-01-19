import { NextRequest, NextResponse } from "next/server";

interface CrawlWebhookPayload {
  job_id: string;
  status: "completed" | "failed";
  kb_id: string;
  pages_crawled: number;
  document_ids: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: CrawlWebhookPayload = await request.json();

    console.log("Crawl webhook received:", {
      job_id: payload.job_id,
      status: payload.status,
      pages_crawled: payload.pages_crawled,
      documents: payload.document_ids.length,
    });

    if (payload.status === "completed") {
      console.log(
        `Crawl job ${payload.job_id} completed: ${payload.pages_crawled} pages crawled`
      );
    } else if (payload.status === "failed") {
      console.error(`Crawl job ${payload.job_id} failed: ${payload.error}`);
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
