import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncGenerator

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logging.getLogger("playwright").setLevel(logging.WARNING)
logging.getLogger("crawl4ai").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


def _handle_exit(signum: int, frame: Any) -> None:
    logger.info("Shutting down gracefully...")
    sys.exit(0)


signal.signal(signal.SIGINT, _handle_exit)
signal.signal(signal.SIGTERM, _handle_exit)

from app.adaptive_crawler import AdaptiveCrawler
from app.config import Settings, get_settings
from app.config_manager import ConfigManager
from app.crawler import get_crawler
from app.database import get_database
from app.job_manager import get_job_manager
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CrawlJobResponse,
    CrawlJobStatus,
    CrawlMode,
    CrawlRequest,
    CrawlStatus,
    CrawlSyncResponse,
    ExtractionMode,
    JobControlResponse,
    SiteConfigListResponse,
    SiteConfigResponse,
    WebhookPayload,
)
from app.settings_loader import SettingsLoader, CrawlerConfig


def _get_supabase_client(settings: Settings) -> Any:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield


app = FastAPI(
    title="Crawler Service",
    description="Web crawling service for AxonBase knowledge base with adaptive AI-powered extraction",
    version="0.2.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


@app.post("/crawl/sync", response_model=CrawlSyncResponse)
async def crawl_single_url_sync(request: CrawlRequest) -> CrawlSyncResponse:
    if request.mode != CrawlMode.SINGLE_URL:
        raise HTTPException(
            status_code=400,
            detail="Use /crawl/async for full site crawling",
        )

    db = get_database()

    try:
        if request.use_ai:
            settings = get_settings()
            client = _get_supabase_client(settings)
            settings_loader = SettingsLoader(client)
            crawler_config = settings_loader.get_crawler_config()
            adaptive_crawler = AdaptiveCrawler(client, settings, crawler_config)

            result, config, used_cache = await adaptive_crawler.crawl_single_url(
                url=str(request.url),
                extraction_mode=request.extraction_mode,
                user_prompt=request.extraction_prompt,
                user_id=request.user_id,
                preset=request.preset,
                css_selector=request.css_selector,
                excluded_selector=request.excluded_selector,
                force_reanalyze=request.force_reanalyze,
            )

            doc_id = db.insert_document(
                kb_id=request.kb_id,
                result=result,
                source_label=request.source_label,
                user_id=request.user_id,
            )

            if doc_id:
                db.increment_kb_document_count(request.kb_id)

            return CrawlSyncResponse(
                success=True,
                url=str(request.url),
                document_id=doc_id,
                title=result.title,
                content_length=len(result.content),
                word_count=len(result.content.split()),
                config_id=config.id if config else None,
                framework_detected=config.framework_detected if config else None,
                used_cached_config=used_cache,
            )
        else:
            crawler = get_crawler()
            result = await crawler.crawl_single_url(str(request.url))

            doc_id = db.insert_document(
                kb_id=request.kb_id,
                result=result,
                source_label=request.source_label,
                user_id=request.user_id,
            )

            if doc_id:
                db.increment_kb_document_count(request.kb_id)

            return CrawlSyncResponse(
                success=True,
                url=str(request.url),
                document_id=doc_id,
                title=result.title,
                content_length=len(result.content),
                word_count=len(result.content.split()),
            )
    except Exception as e:
        return CrawlSyncResponse(
            success=False,
            url=str(request.url),
            error=str(e),
        )


async def execute_full_site_crawl(
    job_id: str,
    url: str,
    kb_id: str,
    user_id: str,
    source_label: str | None,
    max_depth: int,
    max_pages: int,
    webhook_url: str | None,
    use_ai: bool,
    extraction_mode: ExtractionMode,
    extraction_prompt: str | None,
    preset: str | None,
    css_selector: str | None,
    excluded_selector: str | None,
    force_reanalyze: bool,
) -> None:
    import traceback

    db = get_database()
    job_manager = get_job_manager()
    document_ids: list[str] = []
    pages_crawled = 0
    error_message: str | None = None
    config_id: str | None = None
    framework_detected: str | None = None
    was_cancelled = False

    job_manager.register_job(job_id)

    if not user_id:
        error_message = "user_id is required for crawling"
        logger.error(f"[Job {job_id}] {error_message}")
        db.update_crawl_job(
            job_id,
            status="failed",
            error=error_message,
            completed_at=datetime.utcnow().isoformat(),
        )
        job_manager.unregister_job(job_id)
        return

    if not kb_id:
        error_message = "kb_id is required for crawling"
        logger.error(f"[Job {job_id}] {error_message}")
        db.update_crawl_job(
            job_id,
            status="failed",
            error=error_message,
            completed_at=datetime.utcnow().isoformat(),
        )
        job_manager.unregister_job(job_id)
        return

    logger.info(
        f"[Job {job_id}] Starting crawl: url={url}, kb_id={kb_id}, user_id={user_id}, use_ai={use_ai}"
    )
    db.update_crawl_job(job_id, status="running")

    try:
        if use_ai:
            settings = get_settings()
            client = _get_supabase_client(settings)
            settings_loader = SettingsLoader(client)
            crawler_config = settings_loader.get_crawler_config()
            adaptive_crawler = AdaptiveCrawler(client, settings, crawler_config)

            logger.info(f"[Job {job_id}] Using adaptive AI crawler")

            def save_page_callback(result: Any, config: Any) -> bool:
                nonlocal pages_crawled, config_id, framework_detected

                if job_manager.should_stop(job_id):
                    logger.info(f"[Job {job_id}] Cancelled, skipping page save")
                    return False

                if config and not config_id:
                    config_id = config.id
                    framework_detected = config.framework_detected
                    logger.info(
                        f"[Job {job_id}] Framework detected: {framework_detected}"
                    )

                try:
                    doc_id = db.insert_document(
                        kb_id=kb_id,
                        result=result,
                        source_label=source_label,
                        user_id=user_id,
                    )

                    if doc_id:
                        document_ids.append(doc_id)
                        pages_crawled += 1
                        logger.info(
                            f"[Job {job_id}] Page {pages_crawled} saved: {result.url}"
                        )
                        db.update_crawl_job(
                            job_id,
                            pages_crawled=pages_crawled,
                            progress=min(int((pages_crawled / max_pages) * 100), 99),
                        )
                        return True
                    else:
                        logger.warning(
                            f"[Job {job_id}] Failed to insert document for {result.url}"
                        )
                        return False
                except Exception as insert_error:
                    logger.error(
                        f"[Job {job_id}] Error inserting document for {result.url}: {insert_error}"
                    )
                    return False

            async for result, config in adaptive_crawler.crawl_full_site(
                url=url,
                max_depth=max_depth,
                max_pages=max_pages,
                extraction_mode=extraction_mode,
                user_prompt=extraction_prompt,
                user_id=user_id,
                preset=preset,
                css_selector=css_selector,
                excluded_selector=excluded_selector,
                force_reanalyze=force_reanalyze,
                on_page_crawled=save_page_callback,
                job_id=job_id,
            ):
                if job_manager.should_stop(job_id):
                    logger.info(f"[Job {job_id}] Cancelled during crawl iteration")
                    was_cancelled = True
                    break
        else:
            crawler = get_crawler()
            logger.info(f"[Job {job_id}] Using basic crawler")

            def save_basic_page_callback(result: Any) -> bool:
                nonlocal pages_crawled

                if job_manager.should_stop(job_id):
                    logger.info(f"[Job {job_id}] Cancelled, skipping page save")
                    return False

                try:
                    doc_id = db.insert_document(
                        kb_id=kb_id,
                        result=result,
                        source_label=source_label,
                        user_id=user_id,
                    )

                    if doc_id:
                        document_ids.append(doc_id)
                        pages_crawled += 1
                        logger.info(
                            f"[Job {job_id}] Page {pages_crawled} saved: {result.url}"
                        )
                        db.update_crawl_job(
                            job_id,
                            pages_crawled=pages_crawled,
                            progress=min(int((pages_crawled / max_pages) * 100), 99),
                        )
                        return True
                    else:
                        logger.warning(
                            f"[Job {job_id}] Failed to insert document for {result.url}"
                        )
                        return False
                except Exception as insert_error:
                    logger.error(
                        f"[Job {job_id}] Error inserting document for {result.url}: {insert_error}"
                    )
                    return False

            async for result in crawler.crawl_full_site(
                url=url,
                max_depth=max_depth,
                max_pages=max_pages,
                on_page_crawled=save_basic_page_callback,
                job_id=job_id,
            ):
                if job_manager.should_stop(job_id):
                    logger.info(f"[Job {job_id}] Cancelled during crawl iteration")
                    was_cancelled = True
                    break

        if pages_crawled > 0:
            db.increment_kb_document_count(kb_id, count=pages_crawled)

        if was_cancelled:
            logger.info(f"[Job {job_id}] Crawl cancelled after {pages_crawled} pages")
            db.update_crawl_job(
                job_id,
                status="cancelled",
                pages_crawled=pages_crawled,
                completed_at=datetime.utcnow().isoformat(),
            )
        else:
            logger.info(f"[Job {job_id}] Crawl completed: {pages_crawled} pages")
            db.update_crawl_job(
                job_id,
                status="completed",
                progress=100,
                pages_crawled=pages_crawled,
                completed_at=datetime.utcnow().isoformat(),
            )

        job_manager.mark_completed(job_id)

    except Exception as e:
        error_message = str(e)
        logger.error(f"[Job {job_id}] Crawl failed: {error_message}")
        logger.error(f"[Job {job_id}] Traceback: {traceback.format_exc()}")
        db.update_crawl_job(
            job_id,
            status="failed",
            error=error_message,
            pages_crawled=pages_crawled,
            completed_at=datetime.utcnow().isoformat(),
        )
    finally:
        job_manager.unregister_job(job_id)

    if webhook_url:
        payload = WebhookPayload(
            job_id=job_id,
            status=CrawlStatus.COMPLETED if not error_message else CrawlStatus.FAILED,
            kb_id=kb_id,
            pages_crawled=pages_crawled,
            document_ids=document_ids,
            error=error_message,
            config_id=config_id,
            framework_detected=framework_detected,
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(webhook_url, json=payload.model_dump())
                logger.info(f"[Job {job_id}] Webhook sent successfully")
        except Exception as webhook_error:
            logger.warning(f"[Job {job_id}] Failed to send webhook: {webhook_error}")


@app.post("/crawl/async", response_model=CrawlJobResponse)
async def crawl_full_site_async(
    request: CrawlRequest,
    background_tasks: BackgroundTasks,
) -> CrawlJobResponse:
    db = get_database()
    settings = get_settings()

    job_id = db.create_crawl_job(
        url=str(request.url),
        kb_id=request.kb_id,
        mode=request.mode.value,
        max_depth=request.max_depth,
        max_pages=request.max_pages,
        source_label=request.source_label,
        user_id=request.user_id,
    )

    webhook = request.webhook_url or settings.nextjs_webhook_url

    background_tasks.add_task(
        execute_full_site_crawl,
        job_id=job_id,
        url=str(request.url),
        kb_id=request.kb_id,
        user_id=request.user_id,
        source_label=request.source_label,
        max_depth=request.max_depth,
        max_pages=request.max_pages,
        webhook_url=webhook,
        use_ai=request.use_ai,
        extraction_mode=request.extraction_mode,
        extraction_prompt=request.extraction_prompt,
        preset=request.preset,
        css_selector=request.css_selector,
        excluded_selector=request.excluded_selector,
        force_reanalyze=request.force_reanalyze,
    )

    return CrawlJobResponse(
        job_id=job_id,
        status=CrawlStatus.PENDING,
        message="Crawl job created successfully",
    )


@app.get("/crawl/job/{job_id}", response_model=CrawlJobStatus)
async def get_crawl_job_status(job_id: str) -> CrawlJobStatus:
    db = get_database()
    job = db.get_crawl_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return CrawlJobStatus(
        job_id=job["id"],
        status=CrawlStatus(job["status"]),
        progress=job.get("progress", 0),
        pages_crawled=job.get("pages_crawled", 0),
        total_pages=job.get("max_pages"),
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
    )


@app.post("/crawl/job/{job_id}/cancel", response_model=JobControlResponse)
async def cancel_crawl_job(job_id: str) -> JobControlResponse:
    db = get_database()
    job = db.get_crawl_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = job.get("status", "")
    if current_status in ("completed", "failed", "cancelled"):
        return JobControlResponse(
            success=False,
            job_id=job_id,
            status=CrawlStatus(current_status),
            error=f"Cannot cancel job with status: {current_status}",
        )

    job_manager = get_job_manager()
    cancelled = job_manager.cancel_job(job_id)

    db.update_crawl_job(
        job_id,
        status="cancelled",
        completed_at=datetime.utcnow().isoformat(),
    )

    logger.info(f"Job {job_id} cancel requested, manager_cancelled={cancelled}")

    return JobControlResponse(
        success=True,
        job_id=job_id,
        status=CrawlStatus.CANCELLED,
        message="Job cancellation requested",
    )


@app.post("/crawl/job/{job_id}/pause", response_model=JobControlResponse)
async def pause_crawl_job(job_id: str) -> JobControlResponse:
    db = get_database()
    job = db.get_crawl_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = job.get("status", "")
    if current_status != "running":
        return JobControlResponse(
            success=False,
            job_id=job_id,
            status=CrawlStatus(current_status),
            error=f"Cannot pause job with status: {current_status}",
        )

    job_manager = get_job_manager()
    paused = job_manager.pause_job(job_id)

    if paused:
        db.update_crawl_job(job_id, status="paused")

    return JobControlResponse(
        success=paused,
        job_id=job_id,
        status=CrawlStatus.PAUSED if paused else CrawlStatus(current_status),
        message="Job paused" if paused else "Failed to pause job",
    )


@app.post("/crawl/job/{job_id}/resume", response_model=JobControlResponse)
async def resume_crawl_job(job_id: str) -> JobControlResponse:
    db = get_database()
    job = db.get_crawl_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = job.get("status", "")
    if current_status != "paused":
        return JobControlResponse(
            success=False,
            job_id=job_id,
            status=CrawlStatus(current_status),
            error=f"Cannot resume job with status: {current_status}",
        )

    job_manager = get_job_manager()
    resumed = job_manager.resume_job(job_id)

    if resumed:
        db.update_crawl_job(job_id, status="running")

    return JobControlResponse(
        success=resumed,
        job_id=job_id,
        status=CrawlStatus.RUNNING if resumed else CrawlStatus(current_status),
        message="Job resumed" if resumed else "Failed to resume job",
    )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_page_structure(request: AnalyzeRequest) -> AnalyzeResponse:
    settings = get_settings()
    client = _get_supabase_client(settings)
    settings_loader = SettingsLoader(client)
    crawler_config = settings_loader.get_crawler_config()

    if not crawler_config.llm.enabled:
        raise HTTPException(
            status_code=503,
            detail="LLM not configured. Configure LLM settings in system_settings.",
        )

    adaptive_crawler = AdaptiveCrawler(client, settings, crawler_config)

    try:
        result = await adaptive_crawler.analyze_page(
            url=str(request.url),
            user_prompt=request.user_prompt,
        )

        return AnalyzeResponse(
            success=True,
            css_selector=result.css_selector,
            excluded_selector=result.excluded_selector,
            title_selector=result.title_selector,
            framework_detected=result.framework_detected,
            confidence=result.confidence,
            reasoning=result.reasoning,
        )
    except Exception as e:
        return AnalyzeResponse(
            success=False,
            error=str(e),
        )


@app.get("/configs", response_model=SiteConfigListResponse)
async def list_site_configs(
    domain: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> SiteConfigListResponse:
    settings = get_settings()
    client = _get_supabase_client(settings)
    config_manager = ConfigManager(client)

    configs, total = config_manager.list_configs(
        limit=limit,
        offset=offset,
        domain=domain,
    )

    return SiteConfigListResponse(
        configs=[
            SiteConfigResponse(
                id=str(c.id),
                domain=c.domain,
                path_pattern=c.path_pattern,
                css_selector=c.css_selector,
                excluded_selector=c.excluded_selector,
                title_selector=c.title_selector,
                framework_detected=c.framework_detected,
                confidence=c.confidence,
                success_count=c.success_count,
                failure_count=c.failure_count,
                created_at=c.created_at or datetime.utcnow(),
                updated_at=c.updated_at or datetime.utcnow(),
            )
            for c in configs
            if c.id
        ],
        total=total,
    )


@app.get("/configs/{config_id}", response_model=SiteConfigResponse)
async def get_site_config(config_id: str) -> SiteConfigResponse:
    settings = get_settings()
    client = _get_supabase_client(settings)
    config_manager = ConfigManager(client)

    config = config_manager.get_config_by_id(config_id)

    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    return SiteConfigResponse(
        id=str(config.id),
        domain=config.domain,
        path_pattern=config.path_pattern,
        css_selector=config.css_selector,
        excluded_selector=config.excluded_selector,
        title_selector=config.title_selector,
        framework_detected=config.framework_detected,
        confidence=config.confidence,
        success_count=config.success_count,
        failure_count=config.failure_count,
        created_at=config.created_at or datetime.utcnow(),
        updated_at=config.updated_at or datetime.utcnow(),
    )


@app.delete("/configs/{config_id}")
async def delete_site_config(config_id: str) -> dict[str, str]:
    settings = get_settings()
    client = _get_supabase_client(settings)
    config_manager = ConfigManager(client)

    config = config_manager.get_config_by_id(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    config_manager.delete_config(config_id)
    return {"message": "Config deleted successfully"}


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
