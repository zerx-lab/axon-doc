import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import partial
from typing import AsyncGenerator

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.deep_crawling import BFSDeepCrawlStrategy

from app.config import get_settings
from app.schemas import CrawlResult

_executor = ThreadPoolExecutor(max_workers=4)


def _run_in_new_loop(coro_func, *args, **kwargs):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro_func(*args, **kwargs))
    finally:
        loop.close()


class CrawlerService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.browser_config = BrowserConfig(
            headless=True,
            verbose=False,
        )

    async def _do_crawl_single(self, url: str) -> CrawlResult:
        config = CrawlerRunConfig(
            wait_until="networkidle",
            page_timeout=self.settings.crawler_timeout,
        )

        async with AsyncWebCrawler(config=self.browser_config) as crawler:
            result = await crawler.arun(url=url, config=config)

            metadata = result.metadata or {}
            return CrawlResult(
                url=result.url,
                title=metadata.get("title"),
                content=result.markdown or "",
                parent_url=None,
                depth=0,
                metadata={
                    "description": metadata.get("description"),
                    "keywords": metadata.get("keywords"),
                    "status_code": result.status_code,
                },
                crawled_at=datetime.utcnow(),
            )

    async def crawl_single_url(self, url: str) -> CrawlResult:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor,
            partial(_run_in_new_loop, self._do_crawl_single, url),
        )

    async def _do_crawl_full_site(
        self,
        url: str,
        max_depth: int,
        max_pages: int,
    ) -> list[CrawlResult]:
        deep_crawl_strategy = BFSDeepCrawlStrategy(
            max_depth=max_depth,
            max_pages=max_pages,
            include_external=False,
        )

        config = CrawlerRunConfig(
            deep_crawl_strategy=deep_crawl_strategy,
            wait_until="networkidle",
            page_timeout=self.settings.crawler_timeout,
        )

        results_list: list[CrawlResult] = []

        async with AsyncWebCrawler(config=self.browser_config) as crawler:
            results = await crawler.arun(url=url, config=config)

            if isinstance(results, list):
                for result in results:
                    if result.success:
                        metadata = result.metadata or {}
                        results_list.append(
                            CrawlResult(
                                url=result.url,
                                title=metadata.get("title"),
                                content=result.markdown or "",
                                parent_url=getattr(result, "parent_url", None),
                                depth=getattr(result, "depth", 0),
                                metadata={
                                    "description": metadata.get("description"),
                                    "keywords": metadata.get("keywords"),
                                    "status_code": result.status_code,
                                },
                                crawled_at=datetime.utcnow(),
                            )
                        )
            else:
                if results.success:
                    metadata = results.metadata or {}
                    results_list.append(
                        CrawlResult(
                            url=results.url,
                            title=metadata.get("title"),
                            content=results.markdown or "",
                            parent_url=None,
                            depth=0,
                            metadata={
                                "description": metadata.get("description"),
                                "keywords": metadata.get("keywords"),
                                "status_code": results.status_code,
                            },
                            crawled_at=datetime.utcnow(),
                        )
                    )

        return results_list

    async def crawl_full_site(
        self,
        url: str,
        max_depth: int = 3,
        max_pages: int = 100,
    ) -> AsyncGenerator[CrawlResult, None]:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            _executor,
            partial(
                _run_in_new_loop, self._do_crawl_full_site, url, max_depth, max_pages
            ),
        )
        for result in results:
            yield result


_crawler: CrawlerService | None = None


def get_crawler() -> CrawlerService:
    global _crawler
    if _crawler is None:
        _crawler = CrawlerService()
    return _crawler
