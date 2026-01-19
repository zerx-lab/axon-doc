"""Pydantic schemas for API request/response models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class CrawlMode(str, Enum):
    SINGLE_URL = "single_url"
    FULL_SITE = "full_site"


class CrawlStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"


class ExtractionMode(str, Enum):
    AUTO = "auto"
    PRESET = "preset"
    MANUAL = "manual"


class CrawlRequest(BaseModel):
    url: HttpUrl
    kb_id: str
    user_id: str
    mode: CrawlMode = CrawlMode.SINGLE_URL
    source_label: str | None = None
    max_depth: int = Field(default=3, ge=1, le=10)
    max_pages: int = Field(default=100, ge=1, le=1000)
    webhook_url: str | None = None

    use_ai: bool = Field(
        default=True,
        description="Enable AI-powered adaptive extraction (recommended)",
    )
    extraction_mode: ExtractionMode = Field(
        default=ExtractionMode.AUTO,
        description="auto: AI analyzes page structure, preset: use framework preset, manual: use provided selectors",
    )
    extraction_prompt: str | None = Field(
        default=None,
        description="Custom instruction for AI to understand what content to extract",
    )
    preset: str | None = Field(
        default=None,
        description="Framework preset name: docusaurus, gitbook, vuepress, mkdocs, sphinx, generic",
    )
    css_selector: str | None = Field(
        default=None,
        description="CSS selector for main content area (manual mode)",
    )
    excluded_selector: str | None = Field(
        default=None,
        description="CSS selectors to exclude, comma-separated (manual mode)",
    )
    force_reanalyze: bool = Field(
        default=False,
        description="Force AI re-analysis even if cached config exists",
    )


class CrawlResult(BaseModel):
    url: str
    title: str | None = None
    content: str
    parent_url: str | None = None
    depth: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    crawled_at: datetime = Field(default_factory=datetime.utcnow)


class CrawlJobResponse(BaseModel):
    job_id: str
    status: CrawlStatus
    message: str
    config_id: str | None = None
    framework_detected: str | None = None


class CrawlJobStatus(BaseModel):
    job_id: str
    status: CrawlStatus
    progress: int = 0
    pages_crawled: int = 0
    total_pages: int | None = None
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    config_id: str | None = None
    framework_detected: str | None = None


class CrawlSyncResponse(BaseModel):
    success: bool
    url: str
    document_id: str | None = None
    title: str | None = None
    content_length: int = 0
    word_count: int = 0
    error: str | None = None
    config_id: str | None = None
    framework_detected: str | None = None
    used_cached_config: bool = False


class WebhookPayload(BaseModel):
    job_id: str
    status: CrawlStatus
    kb_id: str
    pages_crawled: int
    document_ids: list[str]
    error: str | None = None
    config_id: str | None = None
    framework_detected: str | None = None


class SiteConfigResponse(BaseModel):
    id: str
    domain: str
    path_pattern: str
    css_selector: str | None
    excluded_selector: str | None
    title_selector: str
    framework_detected: str | None
    confidence: float
    success_count: int
    failure_count: int
    created_at: datetime
    updated_at: datetime


class SiteConfigListResponse(BaseModel):
    configs: list[SiteConfigResponse]
    total: int


class AnalyzeRequest(BaseModel):
    url: HttpUrl
    user_prompt: str | None = None


class AnalyzeResponse(BaseModel):
    success: bool
    css_selector: str | None = None
    excluded_selector: str | None = None
    title_selector: str | None = None
    framework_detected: str | None = None
    confidence: float = 0.0
    reasoning: str | None = None
    error: str | None = None


class JobControlResponse(BaseModel):
    success: bool
    job_id: str
    status: CrawlStatus
    message: str | None = None
    error: str | None = None
