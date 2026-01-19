"""Pydantic schemas for API request/response models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class CrawlMode(str, Enum):
    """Crawl mode options."""

    SINGLE_URL = "single_url"
    FULL_SITE = "full_site"


class CrawlStatus(str, Enum):
    """Crawl job status."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class CrawlRequest(BaseModel):
    """Request model for creating a crawl job."""

    url: HttpUrl = Field(..., description="URL to crawl")
    mode: CrawlMode = Field(
        default=CrawlMode.SINGLE_URL, description="Crawl mode: single_url or full_site"
    )
    kb_id: str = Field(..., description="Knowledge base ID to store documents")
    source_label: str | None = Field(
        default=None, description="Custom label for the source"
    )
    max_depth: int = Field(default=3, ge=1, le=10, description="Max crawl depth")
    max_pages: int = Field(default=100, ge=1, le=1000, description="Max pages to crawl")
    webhook_url: str | None = Field(
        default=None, description="Webhook URL for completion notification"
    )


class CrawlResult(BaseModel):
    """Result of a single page crawl."""

    url: str
    title: str | None = None
    content: str  # Markdown content
    parent_url: str | None = None
    depth: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    crawled_at: datetime = Field(default_factory=datetime.utcnow)


class CrawlJobResponse(BaseModel):
    """Response model for crawl job creation."""

    job_id: str
    status: CrawlStatus
    message: str


class CrawlJobStatus(BaseModel):
    """Response model for crawl job status query."""

    job_id: str
    status: CrawlStatus
    progress: int = 0  # 0-100
    pages_crawled: int = 0
    total_pages: int | None = None
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class CrawlSyncResponse(BaseModel):
    """Response model for synchronous crawl (single URL)."""

    success: bool
    url: str
    document_id: str | None = None
    title: str | None = None
    content_length: int = 0
    error: str | None = None


class WebhookPayload(BaseModel):
    """Payload sent to webhook on job completion."""

    job_id: str
    status: CrawlStatus
    kb_id: str
    pages_crawled: int
    document_ids: list[str]
    error: str | None = None
