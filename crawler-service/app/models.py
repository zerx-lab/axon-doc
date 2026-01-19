"""Domain models for adaptive crawling system."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class ExtractionMode(str, Enum):
    AUTO = "auto"
    PRESET = "preset"
    MANUAL = "manual"


class ValidationStatus(str, Enum):
    OK = "ok"
    EMPTY = "empty"
    TOO_SHORT = "too_short"
    SELECTOR_NOT_FOUND = "selector_not_found"
    LOW_QUALITY = "low_quality"


class DocumentFramework(str, Enum):
    DOCUSAURUS = "docusaurus"
    GITBOOK = "gitbook"
    VUEPRESS = "vuepress"
    MKDOCS = "mkdocs"
    SPHINX = "sphinx"
    READTHEDOCS = "readthedocs"
    CONFLUENCE = "confluence"
    NOTION = "notion"
    GENERIC = "generic"


@dataclass
class SiteConfig:
    domain: str
    path_pattern: str
    css_selector: str | None = None
    excluded_selector: str | None = None
    title_selector: str = "h1"
    excluded_tags: list[str] = field(
        default_factory=lambda: [
            "nav",
            "footer",
            "aside",
            "header",
            "script",
            "style",
            "noscript",
            "iframe",
        ]
    )
    framework_detected: str | None = None
    confidence: float = 0.8
    success_count: int = 0
    failure_count: int = 0
    last_success_at: datetime | None = None
    last_failure_at: datetime | None = None
    analysis_prompt: str | None = None
    sample_url: str | None = None
    id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: str | None = None

    @classmethod
    def from_db_row(cls, row: dict[str, Any]) -> "SiteConfig":
        return cls(
            id=row.get("id"),
            domain=row["domain"],
            path_pattern=row.get("path_pattern", "*"),
            css_selector=row.get("css_selector"),
            excluded_selector=row.get("excluded_selector"),
            title_selector=row.get("title_selector", "h1"),
            excluded_tags=row.get("excluded_tags")
            or [
                "nav",
                "footer",
                "aside",
                "header",
                "script",
                "style",
                "noscript",
                "iframe",
            ],
            framework_detected=row.get("framework_detected"),
            confidence=row.get("confidence", 0.8),
            success_count=row.get("success_count", 0),
            failure_count=row.get("failure_count", 0),
            last_success_at=row.get("last_success_at"),
            last_failure_at=row.get("last_failure_at"),
            analysis_prompt=row.get("analysis_prompt"),
            sample_url=row.get("sample_url"),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
            created_by=row.get("created_by"),
        )

    def to_db_dict(self) -> dict[str, Any]:
        return {
            "domain": self.domain,
            "path_pattern": self.path_pattern,
            "css_selector": self.css_selector,
            "excluded_selector": self.excluded_selector,
            "title_selector": self.title_selector,
            "excluded_tags": self.excluded_tags,
            "framework_detected": self.framework_detected,
            "confidence": self.confidence,
            "analysis_prompt": self.analysis_prompt,
            "sample_url": self.sample_url,
            "created_by": self.created_by,
        }


@dataclass
class AnalysisResult:
    css_selector: str
    excluded_selector: str
    title_selector: str = "h1"
    framework_detected: str | None = None
    confidence: float = 0.8
    reasoning: str | None = None


@dataclass
class ValidationResult:
    status: ValidationStatus
    message: str
    content_length: int = 0
    word_count: int = 0
    is_valid: bool = field(init=False)

    def __post_init__(self) -> None:
        self.is_valid = self.status == ValidationStatus.OK


@dataclass
class CrawlContext:
    url: str
    user_prompt: str | None = None
    user_id: str | None = None
    kb_id: str | None = None
    source_label: str | None = None
    config: SiteConfig | None = None
    analysis_result: AnalysisResult | None = None
    validation_result: ValidationResult | None = None
    retry_count: int = 0
    is_new_config: bool = False


FRAMEWORK_PRESETS: dict[str, dict[str, str]] = {
    "docusaurus": {
        "css_selector": ".theme-doc-markdown.markdown, article.markdown, [class*='docMainContainer'] article",
        "excluded_selector": ".theme-doc-breadcrumbs, .theme-doc-toc-mobile, .table-of-contents, .theme-doc-sidebar-container, .pagination-nav, .docSidebarContainer",
        "title_selector": "article h1, .markdown h1",
    },
    "gitbook": {
        "css_selector": ".markdown-section, .page-inner, .page-wrapper .page-inner",
        "excluded_selector": ".book-summary, .navigation, .page-footer, .book-header",
        "title_selector": ".page-inner h1, .markdown-section h1",
    },
    "vuepress": {
        "css_selector": ".theme-default-content, .content__default, .page .content",
        "excluded_selector": ".sidebar, .page-nav, .page-edit, .navbar",
        "title_selector": ".theme-default-content h1, .content__default h1",
    },
    "mkdocs": {
        "css_selector": ".md-content__inner, article, [role='main']",
        "excluded_selector": ".md-sidebar, .md-footer, .md-header, .md-nav",
        "title_selector": ".md-content h1, article h1",
    },
    "sphinx": {
        "css_selector": ".body, [role='main'], .document",
        "excluded_selector": ".sphinxsidebarwrapper, .related, .footer, .headerlink",
        "title_selector": ".body h1, [role='main'] h1",
    },
    "readthedocs": {
        "css_selector": ".rst-content, [role='main']",
        "excluded_selector": ".wy-nav-side, .rst-footer-buttons, .wy-breadcrumbs",
        "title_selector": ".rst-content h1",
    },
    "confluence": {
        "css_selector": "#main-content, .wiki-content, [data-testid='content']",
        "excluded_selector": "#navigation, .aui-sidebar, #footer",
        "title_selector": "#title-text, h1.pagetitle",
    },
    "notion": {
        "css_selector": ".notion-page-content, [class*='notion-page-content']",
        "excluded_selector": ".notion-sidebar, .notion-topbar, [class*='notion-sidebar']",
        "title_selector": ".notion-page-content h1, [class*='notion-header']",
    },
    "generic": {
        "css_selector": "main, article, [role='main'], .content, #content, .main-content",
        "excluded_selector": "nav, aside, footer, header, .sidebar, .toc, .navigation, .menu, [role='navigation'], [role='complementary']",
        "title_selector": "h1, article h1, main h1",
    },
}


def get_framework_preset(framework: str) -> dict[str, str] | None:
    return FRAMEWORK_PRESETS.get(framework.lower())
