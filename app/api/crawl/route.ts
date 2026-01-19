import { NextRequest, NextResponse } from "next/server";

const CRAWLER_SERVICE_URL =
  process.env.CRAWLER_SERVICE_URL || "http://localhost:8001";

interface CrawlRequestBody {
  url: string;
  mode?: "single_url" | "full_site";
  kb_id: string;
  source_label?: string;
  max_depth?: number;
  max_pages?: number;
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
        source_label: body.source_label,
        max_depth: body.max_depth || 3,
        max_pages: body.max_pages || 100,
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
