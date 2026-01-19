"""Adaptive web crawler with AI-powered content extraction."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import partial
from typing import Any, AsyncGenerator
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.deep_crawling import BFSDeepCrawlStrategy
from supabase import Client

from app.analyzer import PageAnalyzer
from app.config import Settings
from app.config_manager import ConfigManager
from app.job_manager import get_job_manager
from app.models import (
    AnalysisResult,
    SiteConfig,
    ValidationResult,
    ValidationStatus,
    get_framework_preset,
    FRAMEWORK_PRESETS,
)
from app.schemas import CrawlResult, ExtractionMode
from app.settings_loader import CrawlerConfig, SettingsLoader
from app.validator import ContentValidator

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)


def _run_in_new_loop(coro_func: Any, *args: Any, **kwargs: Any) -> Any:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(coro_func(*args, **kwargs))
        logger.info(
            f"_run_in_new_loop completed, result count: {len(result) if isinstance(result, list) else 'N/A'}"
        )
        return result
    except Exception as e:
        logger.error(f"_run_in_new_loop error: {e}", exc_info=True)
        raise
    finally:
        loop.close()


class AdaptiveCrawler:
    def __init__(
        self,
        supabase_client: Client,
        settings: Settings,
        crawler_config: CrawlerConfig,
    ) -> None:
        self._client = supabase_client
        self._settings = settings
        self._crawler_config = crawler_config
        self._config_manager = ConfigManager(supabase_client)
        self._analyzer = PageAnalyzer(crawler_config.llm)
        self._validator = ContentValidator(crawler_config.adaptive)
        self._browser_config = BrowserConfig(
            headless=True,
            verbose=False,
        )

    async def crawl_single_url(
        self,
        url: str,
        extraction_mode: ExtractionMode = ExtractionMode.AUTO,
        user_prompt: str | None = None,
        user_id: str | None = None,
        preset: str | None = None,
        css_selector: str | None = None,
        excluded_selector: str | None = None,
        force_reanalyze: bool = False,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor,
            partial(
                _run_in_new_loop,
                self._do_crawl_single,
                url,
                extraction_mode,
                user_prompt,
                user_id,
                preset,
                css_selector,
                excluded_selector,
                force_reanalyze,
            ),
        )

    async def crawl_full_site(
        self,
        url: str,
        max_depth: int = 3,
        max_pages: int = 100,
        extraction_mode: ExtractionMode = ExtractionMode.AUTO,
        user_prompt: str | None = None,
        user_id: str | None = None,
        preset: str | None = None,
        css_selector: str | None = None,
        excluded_selector: str | None = None,
        force_reanalyze: bool = False,
        on_page_crawled: Any | None = None,
        job_id: str | None = None,
    ) -> AsyncGenerator[tuple[CrawlResult, SiteConfig | None], None]:
        logger.info(
            f"crawl_full_site starting: url={url}, max_pages={max_pages}, job_id={job_id}"
        )
        loop = asyncio.get_event_loop()
        try:
            results = await loop.run_in_executor(
                _executor,
                partial(
                    _run_in_new_loop,
                    self._do_crawl_full_site,
                    url,
                    max_depth,
                    max_pages,
                    extraction_mode,
                    user_prompt,
                    user_id,
                    preset,
                    css_selector,
                    excluded_selector,
                    force_reanalyze,
                    on_page_crawled,
                    job_id,
                ),
            )
            logger.info(f"crawl_full_site got {len(results) if results else 0} results")
            for result, config in results:
                logger.info(f"Yielding result: {result.url}")
                yield result, config
        except Exception as e:
            logger.error(f"crawl_full_site error: {e}", exc_info=True)
            raise

    async def analyze_page(
        self,
        url: str,
        user_prompt: str | None = None,
    ) -> AnalysisResult:
        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            run_config = CrawlerRunConfig(
                wait_until=self._settings.crawler_wait_until,
                page_timeout=self._settings.crawler_timeout,
            )
            raw_result = await crawler.arun(url=url, config=run_config)
            html = raw_result.html if hasattr(raw_result, "html") else ""

        return await self._analyzer.analyze(html, user_prompt)

    async def _do_crawl_single(
        self,
        url: str,
        extraction_mode: ExtractionMode,
        user_prompt: str | None,
        user_id: str | None,
        preset: str | None,
        css_selector: str | None,
        excluded_selector: str | None,
        force_reanalyze: bool,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        parsed = urlparse(url)
        domain = parsed.netloc

        if extraction_mode == ExtractionMode.MANUAL:
            return await self._crawl_with_manual_config(
                url, css_selector, excluded_selector
            )

        if extraction_mode == ExtractionMode.PRESET:
            return await self._crawl_with_preset(url, preset)

        existing_config = None
        if not force_reanalyze:
            existing_config = self._config_manager.get_config_for_url(url)

        if (
            existing_config
            and existing_config.confidence
            >= self._crawler_config.adaptive.min_confidence
        ):
            logger.info(
                f"Using cached config for {domain} (confidence: {existing_config.confidence})"
            )
            result, validation = await self._crawl_with_config(url, existing_config)

            if validation.is_valid:
                self._config_manager.record_success(existing_config.id)  # type: ignore
                return result, existing_config, True

            logger.warning(f"Cached config failed: {validation.message}")
            self._config_manager.record_failure(existing_config.id)  # type: ignore
            return await self._crawl_with_retry(
                url, existing_config, validation, user_prompt, user_id
            )

        logger.info(f"No valid cached config, analyzing {url}")
        return await self._crawl_with_analysis(url, user_prompt, user_id)

    async def _do_crawl_full_site(
        self,
        url: str,
        max_depth: int,
        max_pages: int,
        extraction_mode: ExtractionMode,
        user_prompt: str | None,
        user_id: str | None,
        preset: str | None,
        css_selector: str | None,
        excluded_selector: str | None,
        force_reanalyze: bool,
        on_page_crawled: Any | None = None,
        job_id: str | None = None,
    ) -> list[tuple[CrawlResult, SiteConfig | None]]:
        config = await self._resolve_config(
            url,
            extraction_mode,
            user_prompt,
            user_id,
            preset,
            css_selector,
            excluded_selector,
            force_reanalyze,
        )

        run_config = self._build_run_config(
            config,
            deep_crawl_strategy=BFSDeepCrawlStrategy(
                max_depth=max_depth,
                max_pages=max_pages,
                include_external=False,
            ),
            stream=True,
        )

        results: list[tuple[CrawlResult, SiteConfig | None]] = []
        title_selector = config.title_selector if config else None
        page_count = 0
        job_manager = get_job_manager() if job_id else None

        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            async for raw_result in await crawler.arun(url=url, config=run_config):
                if job_id and job_manager and job_manager.should_stop(job_id):
                    logger.info(f"[Job {job_id}] Crawl cancelled, stopping iteration")
                    break

                page_count += 1
                result_url = getattr(raw_result, "url", "unknown")
                success = getattr(raw_result, "success", False)
                logger.info(
                    f"[STREAM] Page {page_count}: url={result_url}, success={success}"
                )

                if success:
                    html = raw_result.html if hasattr(raw_result, "html") else None
                    result = self._build_crawl_result(
                        raw_result, html=html, title_selector=title_selector
                    )

                    if on_page_crawled:
                        try:
                            callback_result = on_page_crawled(result, config)
                            if callback_result:
                                results.append((result, config))
                            logger.info(
                                f"[STREAM] Page {page_count} saved via callback"
                            )
                        except Exception as e:
                            logger.error(f"on_page_crawled callback error: {e}")
                            results.append((result, config))
                    else:
                        results.append((result, config))
                else:
                    error = getattr(raw_result, "error_message", "unknown error")
                    logger.warning(f"[STREAM] Page {page_count} failed: {error}")

        logger.info(f"Crawl complete. Total pages processed: {len(results)}")
        return results

    async def _resolve_config(
        self,
        url: str,
        extraction_mode: ExtractionMode,
        user_prompt: str | None,
        user_id: str | None,
        preset: str | None,
        css_selector: str | None,
        excluded_selector: str | None,
        force_reanalyze: bool,
    ) -> SiteConfig | None:
        if extraction_mode == ExtractionMode.MANUAL:
            return SiteConfig(
                domain=urlparse(url).netloc,
                path_pattern="*",
                css_selector=css_selector,
                excluded_selector=excluded_selector,
            )

        if extraction_mode == ExtractionMode.PRESET and preset:
            preset_data = get_framework_preset(preset)
            if preset_data:
                return SiteConfig(
                    domain=urlparse(url).netloc,
                    path_pattern="*",
                    css_selector=preset_data["css_selector"],
                    excluded_selector=preset_data["excluded_selector"],
                    title_selector=preset_data["title_selector"],
                    framework_detected=preset,
                )

        if not force_reanalyze:
            existing = self._config_manager.get_config_for_url(url)
            if (
                existing
                and existing.confidence >= self._crawler_config.adaptive.min_confidence
            ):
                return existing

        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            run_config = CrawlerRunConfig(
                wait_until=self._settings.crawler_wait_until,
                page_timeout=self._settings.crawler_timeout,
            )
            raw_result = await crawler.arun(url=url, config=run_config)
            html = raw_result.html if hasattr(raw_result, "html") else ""

        analysis = await self._analyzer.analyze(html, user_prompt)
        parsed = urlparse(url)

        new_config = SiteConfig(
            domain=parsed.netloc,
            path_pattern=ConfigManager.extract_path_pattern(parsed.path),
            css_selector=analysis.css_selector,
            excluded_selector=analysis.excluded_selector,
            title_selector=analysis.title_selector,
            framework_detected=analysis.framework_detected,
            confidence=analysis.confidence,
            analysis_prompt=user_prompt,
            sample_url=url,
            created_by=user_id,
        )

        config_id = self._config_manager.save_config(new_config)
        new_config.id = config_id

        return new_config

    async def _crawl_with_config(
        self,
        url: str,
        config: SiteConfig,
    ) -> tuple[CrawlResult, ValidationResult]:
        run_config = self._build_run_config(config)

        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            raw_result = await crawler.arun(url=url, config=run_config)

            markdown = raw_result.markdown if hasattr(raw_result, "markdown") else ""
            validation = self._validator.validate(markdown)

            html = raw_result.html if hasattr(raw_result, "html") else None
            result = self._build_crawl_result(
                raw_result,
                html=html,
                title_selector=config.title_selector if config else None,
            )
            return result, validation

    async def _crawl_with_analysis(
        self,
        url: str,
        user_prompt: str | None,
        user_id: str | None,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            run_config = CrawlerRunConfig(
                wait_until=self._settings.crawler_wait_until,
                page_timeout=self._settings.crawler_timeout,
            )
            raw_result = await crawler.arun(url=url, config=run_config)
            html = raw_result.html if hasattr(raw_result, "html") else ""

        analysis = await self._analyzer.analyze(html, user_prompt)
        logger.info(
            f"AI analysis: framework={analysis.framework_detected}, confidence={analysis.confidence}"
        )

        parsed = urlparse(url)
        new_config = SiteConfig(
            domain=parsed.netloc,
            path_pattern=ConfigManager.extract_path_pattern(parsed.path),
            css_selector=analysis.css_selector,
            excluded_selector=analysis.excluded_selector,
            title_selector=analysis.title_selector,
            framework_detected=analysis.framework_detected,
            confidence=analysis.confidence,
            analysis_prompt=user_prompt,
            sample_url=url,
            created_by=user_id,
        )

        config_id = self._config_manager.save_config(new_config)
        new_config.id = config_id

        result, validation = await self._crawl_with_config(url, new_config)

        if validation.is_valid:
            self._config_manager.record_success(config_id)
            return result, new_config, False

        self._config_manager.record_failure(config_id)
        return await self._crawl_with_retry(
            url, new_config, validation, user_prompt, user_id
        )

    async def _crawl_with_retry(
        self,
        url: str,
        old_config: SiteConfig,
        validation: ValidationResult,
        user_prompt: str | None,
        user_id: str | None,
        retry_count: int = 0,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        max_retry = self._crawler_config.adaptive.max_retry

        if retry_count >= max_retry:
            logger.warning(
                f"Max retries ({max_retry}) reached, falling back to raw crawl"
            )
            return await self._crawl_raw(url)

        logger.info(f"Re-analyzing page (retry {retry_count + 1}/{max_retry})")

        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            run_config = CrawlerRunConfig(
                wait_until=self._settings.crawler_wait_until,
                page_timeout=self._settings.crawler_timeout,
            )
            raw_result = await crawler.arun(url=url, config=run_config)
            html = raw_result.html if hasattr(raw_result, "html") else ""

        failure_reason = self._validator.get_failure_reason(validation)
        analysis = await self._analyzer.reanalyze(html, old_config, failure_reason)

        old_config.css_selector = analysis.css_selector
        old_config.excluded_selector = analysis.excluded_selector
        old_config.title_selector = analysis.title_selector
        old_config.confidence = analysis.confidence
        old_config.framework_detected = analysis.framework_detected

        if old_config.id:
            self._config_manager.save_config(old_config)

        result, new_validation = await self._crawl_with_config(url, old_config)

        if new_validation.is_valid:
            if old_config.id:
                self._config_manager.record_success(old_config.id)
            return result, old_config, False

        if old_config.id:
            self._config_manager.record_failure(old_config.id)

        return await self._crawl_with_retry(
            url, old_config, new_validation, user_prompt, user_id, retry_count + 1
        )

    async def _crawl_with_manual_config(
        self,
        url: str,
        css_selector: str | None,
        excluded_selector: str | None,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        config = SiteConfig(
            domain=urlparse(url).netloc,
            path_pattern="*",
            css_selector=css_selector,
            excluded_selector=excluded_selector,
        )

        result, _ = await self._crawl_with_config(url, config)
        return result, None, False

    async def _crawl_with_preset(
        self,
        url: str,
        preset: str | None,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        preset_name = preset or "generic"
        preset_data = get_framework_preset(preset_name)

        if not preset_data:
            preset_data = FRAMEWORK_PRESETS["generic"]

        config = SiteConfig(
            domain=urlparse(url).netloc,
            path_pattern="*",
            css_selector=preset_data["css_selector"],
            excluded_selector=preset_data["excluded_selector"],
            title_selector=preset_data["title_selector"],
            framework_detected=preset_name,
        )

        result, _ = await self._crawl_with_config(url, config)
        return result, config, False

    async def _crawl_raw(
        self,
        url: str,
    ) -> tuple[CrawlResult, SiteConfig | None, bool]:
        run_config = CrawlerRunConfig(
            wait_until=self._settings.crawler_wait_until,
            page_timeout=self._settings.crawler_timeout,
            excluded_tags=["script", "style", "noscript", "iframe"],
        )

        async with AsyncWebCrawler(config=self._browser_config) as crawler:
            raw_result = await crawler.arun(url=url, config=run_config)
            html = raw_result.html if hasattr(raw_result, "html") else None
            result = self._build_crawl_result(
                raw_result, html=html, title_selector="h1"
            )
            result.metadata["extraction_mode"] = "raw_fallback"
            return result, None, False

    def _build_run_config(
        self,
        config: SiteConfig | None,
        deep_crawl_strategy: BFSDeepCrawlStrategy | None = None,
        stream: bool = False,
    ) -> CrawlerRunConfig:
        kwargs: dict[str, Any] = {
            "wait_until": self._settings.crawler_wait_until,
            "page_timeout": self._settings.crawler_timeout,
            "stream": stream,
        }

        if config:
            if config.css_selector:
                kwargs["css_selector"] = config.css_selector
            if config.excluded_selector:
                kwargs["excluded_selector"] = config.excluded_selector
            if config.excluded_tags:
                kwargs["excluded_tags"] = config.excluded_tags

        if deep_crawl_strategy:
            kwargs["deep_crawl_strategy"] = deep_crawl_strategy

        return CrawlerRunConfig(**kwargs)

    @staticmethod
    def _extract_title_from_html(
        html: str | None,
        title_selector: str | None,
    ) -> str | None:
        if not html:
            return None

        try:
            soup = BeautifulSoup(html, "html.parser")

            if title_selector:
                for selector in title_selector.split(","):
                    selector = selector.strip()
                    if selector:
                        element = soup.select_one(selector)
                        if element:
                            title = element.get_text(strip=True)
                            if title:
                                return title

            if soup.title and soup.title.string:
                return soup.title.string.strip()

            h1 = soup.find("h1")
            if h1:
                return h1.get_text(strip=True)

        except Exception:
            pass

        return None

    @staticmethod
    def _build_crawl_result(
        raw_result: Any,
        html: str | None = None,
        title_selector: str | None = None,
    ) -> CrawlResult:
        metadata = raw_result.metadata if hasattr(raw_result, "metadata") else {}
        if metadata is None:
            metadata = {}

        title = metadata.get("title") if isinstance(metadata, dict) else None

        if not title:
            raw_html = html or (
                raw_result.html if hasattr(raw_result, "html") else None
            )
            title = AdaptiveCrawler._extract_title_from_html(raw_html, title_selector)

        return CrawlResult(
            url=raw_result.url if hasattr(raw_result, "url") else "",
            title=title,
            content=raw_result.markdown if hasattr(raw_result, "markdown") else "",
            parent_url=getattr(raw_result, "parent_url", None),
            depth=getattr(raw_result, "depth", 0),
            metadata={
                "description": metadata.get("description")
                if isinstance(metadata, dict)
                else None,
                "keywords": metadata.get("keywords")
                if isinstance(metadata, dict)
                else None,
                "status_code": raw_result.status_code
                if hasattr(raw_result, "status_code")
                else None,
            },
            crawled_at=datetime.utcnow(),
        )


_adaptive_crawler: AdaptiveCrawler | None = None


def get_adaptive_crawler(
    client: Client,
    settings: Settings,
    crawler_config: CrawlerConfig,
) -> AdaptiveCrawler:
    global _adaptive_crawler
    if _adaptive_crawler is None:
        _adaptive_crawler = AdaptiveCrawler(client, settings, crawler_config)
    return _adaptive_crawler
