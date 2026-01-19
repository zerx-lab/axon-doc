"""Application configuration using pydantic-settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Redis (optional, for async tasks)
    redis_url: str = "redis://localhost:6379"

    # Crawler settings
    crawler_timeout: int = 60000  # 60 seconds
    crawler_max_depth: int = 3
    crawler_max_pages: int = 100

    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8001

    # Next.js webhook (for task completion notifications)
    nextjs_webhook_url: str = "http://localhost:3000/api/webhook/crawl"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
