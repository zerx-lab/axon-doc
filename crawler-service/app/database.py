"""Supabase database client and operations."""

import hashlib
from datetime import datetime
from typing import Any

from supabase import Client, create_client

from app.config import get_settings
from app.schemas import CrawlResult


class Database:
    """Database operations using Supabase."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

    def insert_document(
        self,
        kb_id: str,
        result: CrawlResult,
        source_label: str | None = None,
        user_id: str | None = None,
    ) -> str | None:
        """
        Insert a crawled document into the database.

        Returns the document ID if successful, None otherwise.
        """
        if not user_id:
            raise ValueError("user_id is required for document insertion")

        # Generate content hash for deduplication
        content_hash = hashlib.sha256(result.content.encode()).hexdigest()

        # Check if document with same URL already exists in this KB
        existing = (
            self.client.table("documents")
            .select("id")
            .eq("kb_id", kb_id)
            .eq("source_url", str(result.url))
            .execute()
        )

        content = result.content or ""
        word_count = len(content.split())
        char_count = len(content)

        document_data = {
            "kb_id": kb_id,
            "user_id": user_id,
            "title": result.title or "Untitled",
            "content": content,
            "file_type": "url",
            "word_count": word_count,
            "char_count": char_count,
            "status": "active",
            "source_url": str(result.url),
            "source_type": "crawl",
            "source_label": source_label,
            "parent_url": result.parent_url,
            "crawl_depth": result.depth,
            "crawled_at": result.crawled_at.isoformat(),
            "content_hash": content_hash,
            "metadata": result.metadata,
        }

        if existing.data:
            # Update existing document
            doc_id = existing.data[0]["id"]
            self.client.table("documents").update(document_data).eq(
                "id", doc_id
            ).execute()
            return doc_id
        else:
            # Insert new document
            response = self.client.table("documents").insert(document_data).execute()
            if response.data:
                return response.data[0]["id"]
            return None

    def create_crawl_job(
        self,
        url: str,
        kb_id: str,
        mode: str,
        max_depth: int,
        max_pages: int,
        source_label: str | None = None,
        user_id: str | None = None,
    ) -> str:
        """Create a crawl job record and return the job ID."""
        data = {
            "url": url,
            "kb_id": kb_id,
            "mode": mode,
            "max_depth": max_depth,
            "max_pages": max_pages,
            "source_label": source_label,
            "status": "pending",
            "pages_crawled": 0,
        }
        if user_id:
            data["user_id"] = user_id

        response = self.client.table("crawl_jobs").insert(data).execute()
        return response.data[0]["id"]

    def update_crawl_job(
        self,
        job_id: str,
        **kwargs: Any,
    ) -> None:
        """Update crawl job status and progress."""
        self.client.table("crawl_jobs").update(kwargs).eq("id", job_id).execute()

    def get_crawl_job(self, job_id: str) -> dict[str, Any] | None:
        """Get crawl job by ID."""
        response = (
            self.client.table("crawl_jobs").select("*").eq("id", job_id).execute()
        )
        if response.data:
            return response.data[0]
        return None

    def increment_kb_document_count(self, kb_id: str, count: int = 1) -> None:
        """Increment the document count for a knowledge base."""
        # Get current count
        response = (
            self.client.table("knowledge_bases")
            .select("document_count")
            .eq("id", kb_id)
            .execute()
        )
        if response.data:
            current_count = response.data[0].get("document_count", 0) or 0
            self.client.table("knowledge_bases").update(
                {"document_count": current_count + count}
            ).eq("id", kb_id).execute()


# Singleton instance
_db: Database | None = None


def get_database() -> Database:
    """Get database singleton instance."""
    global _db
    if _db is None:
        _db = Database()
    return _db
