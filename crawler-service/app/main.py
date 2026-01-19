import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator

import nest_asyncio

nest_asyncio.apply()

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException

from app.config import get_settings
from app.crawler import get_crawler
from app.database import get_database
from app.schemas import (
    CrawlJobResponse,
    CrawlJobStatus,
    CrawlMode,
    CrawlRequest,
    CrawlStatus,
    CrawlSyncResponse,
    WebhookPayload,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield


app = FastAPI(
    title="Crawler Service",
    description="Web crawling service for AxonBase knowledge base",
    version="0.1.0",
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

    crawler = get_crawler()
    db = get_database()

    try:
        result = await crawler.crawl_single_url(str(request.url))

        doc_id = db.insert_document(
            kb_id=request.kb_id,
            result=result,
            source_label=request.source_label,
        )

        if doc_id:
            db.increment_kb_document_count(request.kb_id)

        return CrawlSyncResponse(
            success=True,
            url=str(request.url),
            document_id=doc_id,
            title=result.title,
            content_length=len(result.content),
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
    source_label: str | None,
    max_depth: int,
    max_pages: int,
    webhook_url: str | None,
) -> None:
    crawler = get_crawler()
    db = get_database()

    db.update_crawl_job(job_id, status="running")

    document_ids: list[str] = []
    pages_crawled = 0
    error_message: str | None = None

    try:
        async for result in crawler.crawl_full_site(
            url=url,
            max_depth=max_depth,
            max_pages=max_pages,
        ):
            doc_id = db.insert_document(
                kb_id=kb_id,
                result=result,
                source_label=source_label,
            )

            if doc_id:
                document_ids.append(doc_id)
                pages_crawled += 1

                db.update_crawl_job(
                    job_id,
                    pages_crawled=pages_crawled,
                    progress=min(int((pages_crawled / max_pages) * 100), 99),
                )

        db.increment_kb_document_count(kb_id, count=pages_crawled)

        db.update_crawl_job(
            job_id,
            status="completed",
            progress=100,
            pages_crawled=pages_crawled,
            completed_at=datetime.utcnow().isoformat(),
        )

    except Exception as e:
        error_message = str(e)
        db.update_crawl_job(
            job_id,
            status="failed",
            error=error_message,
            completed_at=datetime.utcnow().isoformat(),
        )

    if webhook_url:
        payload = WebhookPayload(
            job_id=job_id,
            status=CrawlStatus.COMPLETED if not error_message else CrawlStatus.FAILED,
            kb_id=kb_id,
            pages_crawled=pages_crawled,
            document_ids=document_ids,
            error=error_message,
        )

        async with httpx.AsyncClient() as client:
            try:
                await client.post(webhook_url, json=payload.model_dump())
            except Exception:
                pass


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
    )

    webhook = request.webhook_url or settings.nextjs_webhook_url

    background_tasks.add_task(
        execute_full_site_crawl,
        job_id=job_id,
        url=str(request.url),
        kb_id=request.kb_id,
        source_label=request.source_label,
        max_depth=request.max_depth,
        max_pages=request.max_pages,
        webhook_url=webhook,
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


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
