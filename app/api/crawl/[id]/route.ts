import { NextRequest, NextResponse } from "next/server";

const CRAWLER_SERVICE_URL =
  process.env.CRAWLER_SERVICE_URL || "http://localhost:8001";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(`${CRAWLER_SERVICE_URL}/crawl/job/${id}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || "Job not found" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Crawl status API error:", error);
    return NextResponse.json(
      { error: "Failed to connect to crawler service" },
      { status: 503 }
    );
  }
}
