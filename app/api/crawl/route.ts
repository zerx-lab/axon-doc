import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { CrawlJob, CrawlPage } from "@/lib/supabase/types";

const CRAWLER_SERVICE_URL =
  process.env.CRAWLER_SERVICE_URL || "http://localhost:8001";

interface CrawlRequestBody {
  url: string;
  mode?: "single_url" | "full_site";
  kb_id: string;
  user_id?: string;
  source_label?: string;
  max_depth?: number;
  max_pages?: number;
  use_ai?: boolean;
  extraction_mode?: "auto" | "preset" | "manual";
  extraction_prompt?: string;
  preset?: string;
  css_selector?: string;
  excluded_selector?: string;
  force_reanalyze?: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kbId = searchParams.get("kb_id");
    const jobId = searchParams.get("job_id");

    const supabase = createAdminClient();

    if (jobId) {
      const { data: job, error } = await supabase
        .from("crawl_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      const { data: pages } = await supabase
        .from("crawl_pages")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      return NextResponse.json({
        job: job as CrawlJob,
        pages: (pages || []) as CrawlPage[],
      });
    }

    if (!kbId) {
      return NextResponse.json(
        { error: "Missing kb_id parameter" },
        { status: 400 }
      );
    }

    const { data: jobs, error } = await supabase
      .from("crawl_jobs")
      .select("*")
      .eq("kb_id", kbId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: (jobs || []) as CrawlJob[] });
  } catch (error) {
    console.error("Crawl GET API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch crawl jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CrawlRequestBody = await request.json();

    if (!body.url || !body.kb_id) {
      return NextResponse.json(
        { error: "Missing required fields: url and kb_id" },
        { status: 400 }
      );
    }

    const mode = body.mode || "single_url";
    const endpoint =
      mode === "single_url"
        ? `${CRAWLER_SERVICE_URL}/crawl/sync`
        : `${CRAWLER_SERVICE_URL}/crawl/async`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: body.url,
        mode: body.mode || "single_url",
        kb_id: body.kb_id,
        user_id: body.user_id,
        source_label: body.source_label,
        max_depth: body.max_depth || 3,
        max_pages: body.max_pages || 100,
        use_ai: body.use_ai ?? true,
        extraction_mode: body.extraction_mode || "auto",
        extraction_prompt: body.extraction_prompt,
        preset: body.preset,
        css_selector: body.css_selector,
        excluded_selector: body.excluded_selector,
        force_reanalyze: body.force_reanalyze || false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || "Crawl request failed" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Crawl API error:", error);
    return NextResponse.json(
      { error: "Failed to connect to crawler service" },
      { status: 503 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { job_id, action } = body;

    if (!job_id || !action) {
      return NextResponse.json(
        { error: "Missing job_id or action" },
        { status: 400 }
      );
    }

    if (!["pause", "resume"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'pause' or 'resume'" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    
    const { data: existingJob } = await supabase
      .from("crawl_jobs")
      .select("status")
      .eq("id", job_id)
      .single();

    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const terminalStatuses = ["completed", "failed", "cancelled"];
    if (terminalStatuses.includes(existingJob.status)) {
      return NextResponse.json({ 
        success: true, 
        status: existingJob.status,
        message: "Job already in terminal state" 
      });
    }

    const newStatus = action === "pause" ? "paused" : "running";

    try {
      const response = await fetch(`${CRAWLER_SERVICE_URL}/crawl/job/${job_id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        console.warn(`Crawler service returned ${response.status} for ${action}:`, data);
      }
    } catch (fetchError) {
      console.warn(`Crawler service unavailable for ${action}:`, fetchError);
    }
    
    await supabase
      .from("crawl_jobs")
      .update({ status: newStatus })
      .eq("id", job_id);

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("Crawl PATCH API error:", error);
    return NextResponse.json(
      { error: "Failed to update crawl job" },
      { status: 503 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job_id parameter" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: existingJob } = await supabase
      .from("crawl_jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const terminalStatuses = ["completed", "failed", "cancelled"];
    if (terminalStatuses.includes(existingJob.status)) {
      return NextResponse.json({ 
        success: true, 
        message: "Job already in terminal state" 
      });
    }

    try {
      const response = await fetch(`${CRAWLER_SERVICE_URL}/crawl/job/${jobId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        console.warn(`Crawler service returned ${response.status} for cancel:`, data);
      }
    } catch (fetchError) {
      console.warn("Crawler service unavailable for cancel:", fetchError);
    }
    
    await supabase
      .from("crawl_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Crawl DELETE API error:", error);
    return NextResponse.json(
      { error: "Failed to cancel crawl job" },
      { status: 503 }
    );
  }
}
