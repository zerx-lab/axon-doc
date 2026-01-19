"""Dynamic settings loader from database system_settings table."""

from dataclasses import dataclass
from typing import Any

from supabase import Client


@dataclass
class LLMSettings:
    provider: str = "openai/gpt-4o-mini"
    base_url: str = ""
    api_key: str = ""
    temperature: float = 0.1
    max_tokens: int = 2000

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)


@dataclass
class AdaptiveSettings:
    min_confidence: float = 0.5
    max_retry: int = 2
    min_content_length: int = 100
    min_word_count: int = 20


@dataclass
class CrawlerSettings:
    timeout: int = 60000
    max_depth: int = 3
    max_pages: int = 100


@dataclass
class CrawlerConfig:
    llm: LLMSettings
    adaptive: AdaptiveSettings
    crawler: CrawlerSettings

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CrawlerConfig":
        llm_data = data.get("llm", {})
        adaptive_data = data.get("adaptive", {})
        crawler_data = data.get("crawler", {})

        return cls(
            llm=LLMSettings(
                provider=llm_data.get("provider", "openai/gpt-4o-mini"),
                base_url=llm_data.get("baseUrl", ""),
                api_key=llm_data.get("apiKey", ""),
                temperature=float(llm_data.get("temperature", 0.1)),
                max_tokens=int(llm_data.get("maxTokens", 2000)),
            ),
            adaptive=AdaptiveSettings(
                min_confidence=float(adaptive_data.get("minConfidence", 0.5)),
                max_retry=int(adaptive_data.get("maxRetry", 2)),
                min_content_length=int(adaptive_data.get("minContentLength", 100)),
                min_word_count=int(adaptive_data.get("minWordCount", 20)),
            ),
            crawler=CrawlerSettings(
                timeout=int(crawler_data.get("timeout", 60000)),
                max_depth=int(crawler_data.get("maxDepth", 3)),
                max_pages=int(crawler_data.get("maxPages", 100)),
            ),
        )

    @classmethod
    def default(cls) -> "CrawlerConfig":
        return cls(
            llm=LLMSettings(),
            adaptive=AdaptiveSettings(),
            crawler=CrawlerSettings(),
        )


class SettingsLoader:
    def __init__(self, client: Client) -> None:
        self._client = client
        self._cache: CrawlerConfig | None = None

    def get_crawler_config(self, force_refresh: bool = False) -> CrawlerConfig:
        if self._cache is not None and not force_refresh:
            return self._cache

        try:
            response = (
                self._client.table("system_settings")
                .select("key, value")
                .in_("key", ["crawler_config", "chat_config"])
                .execute()
            )

            crawler_data: dict[str, Any] = {}
            chat_data: dict[str, Any] = {}

            for row in response.data or []:
                if row["key"] == "crawler_config":
                    crawler_data = row.get("value", {})
                elif row["key"] == "chat_config":
                    chat_data = row.get("value", {})

            if crawler_data:
                config = CrawlerConfig.from_dict(crawler_data)
                if not config.llm.api_key and chat_data.get("apiKey"):
                    config.llm = self._llm_from_chat_config(chat_data)
                self._cache = config
            else:
                self._cache = CrawlerConfig.default()

        except Exception:
            self._cache = CrawlerConfig.default()

        return self._cache

    def _llm_from_chat_config(self, chat_data: dict[str, Any]) -> LLMSettings:
        provider = chat_data.get("provider", "openai-compatible")
        model = chat_data.get("model", "gpt-4o-mini")

        if provider == "openai-compatible":
            litellm_provider = f"openai/{model}"
        else:
            litellm_provider = f"{provider}/{model}"

        return LLMSettings(
            provider=litellm_provider,
            base_url=chat_data.get("baseUrl", ""),
            api_key=chat_data.get("apiKey", ""),
            temperature=float(chat_data.get("temperature", 0.1)),
            max_tokens=int(chat_data.get("maxTokens", 2000)),
        )

    def clear_cache(self) -> None:
        self._cache = None


_loader: SettingsLoader | None = None


def get_settings_loader(client: Client) -> SettingsLoader:
    global _loader
    if _loader is None:
        _loader = SettingsLoader(client)
    return _loader
