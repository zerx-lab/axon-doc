"""Site configuration manager for adaptive crawling."""

import fnmatch
from typing import Any
from urllib.parse import urlparse

from supabase import Client

from app.models import SiteConfig


class ConfigManager:
    def __init__(self, client: Client) -> None:
        self._client = client
        self._table = "crawl_site_configs"

    def get_config_for_url(self, url: str) -> SiteConfig | None:
        parsed = urlparse(url)
        domain = parsed.netloc
        path = parsed.path

        response = (
            self._client.table(self._table)
            .select("*")
            .eq("domain", domain)
            .order("path_pattern", desc=True)
            .execute()
        )

        if not response.data:
            return None

        for row in response.data:
            if self._match_path(path, row.get("path_pattern", "*")):
                return SiteConfig.from_db_row(row)

        return None

    def get_config_by_id(self, config_id: str) -> SiteConfig | None:
        response = (
            self._client.table(self._table)
            .select("*")
            .eq("id", config_id)
            .single()
            .execute()
        )

        if response.data:
            return SiteConfig.from_db_row(response.data)
        return None

    def get_configs_for_domain(self, domain: str) -> list[SiteConfig]:
        response = (
            self._client.table(self._table)
            .select("*")
            .eq("domain", domain)
            .order("path_pattern", desc=True)
            .execute()
        )

        return [SiteConfig.from_db_row(row) for row in response.data or []]

    def save_config(self, config: SiteConfig) -> str:
        data = config.to_db_dict()

        existing = (
            self._client.table(self._table)
            .select("id")
            .eq("domain", config.domain)
            .eq("path_pattern", config.path_pattern)
            .execute()
        )

        if existing.data:
            config_id = existing.data[0]["id"]
            self._client.table(self._table).update(data).eq("id", config_id).execute()
            return str(config_id)

        response = self._client.table(self._table).insert(data).execute()
        return str(response.data[0]["id"])

    def update_config(self, config_id: str, **kwargs: Any) -> None:
        self._client.table(self._table).update(kwargs).eq("id", config_id).execute()

    def record_success(self, config_id: str) -> None:
        self._client.rpc(
            "increment_site_config_success",
            {"config_id": config_id},
        ).execute()

    def record_failure(self, config_id: str) -> None:
        self._client.rpc(
            "increment_site_config_failure",
            {"config_id": config_id},
        ).execute()

    def delete_config(self, config_id: str) -> None:
        self._client.table(self._table).delete().eq("id", config_id).execute()

    def list_configs(
        self,
        limit: int = 50,
        offset: int = 0,
        domain: str | None = None,
    ) -> tuple[list[SiteConfig], int]:
        query = self._client.table(self._table).select("*", count="exact")

        if domain:
            query = query.eq("domain", domain)

        query = query.order("updated_at", desc=True).range(offset, offset + limit - 1)
        response = query.execute()

        configs = [SiteConfig.from_db_row(row) for row in response.data or []]
        total = response.count or 0

        return configs, total

    def _match_path(self, path: str, pattern: str) -> bool:
        if pattern == "*":
            return True

        normalized_path = path.rstrip("/")
        normalized_pattern = pattern.rstrip("/")

        if fnmatch.fnmatch(normalized_path, normalized_pattern):
            return True

        if normalized_pattern.endswith("/*"):
            prefix = normalized_pattern[:-2]
            if normalized_path.startswith(prefix):
                return True

        return False

    @staticmethod
    def extract_path_pattern(path: str) -> str:
        parts = path.strip("/").split("/")
        if len(parts) >= 2:
            return "/" + "/".join(parts[:2]) + "/*"
        if len(parts) == 1 and parts[0]:
            return "/" + parts[0] + "/*"
        return "*"
