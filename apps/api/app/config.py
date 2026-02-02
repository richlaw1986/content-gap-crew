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

    # API Settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False

    # Sanity Configuration (optional for dev with stub client)
    sanity_project_id: str = ""
    sanity_dataset: str = "production"
    sanity_api_version: str = "2024-01-01"
    sanity_token: str = ""

    # LLM Configuration
    anthropic_api_key: str = ""
    default_llm_model: str = "claude-sonnet-4-5-20250929"
    smart_llm_model: str = "claude-opus-4-5-20251101"
    fast_llm_model: str = "claude-haiku-4-5-20251001"

    # Optional: OpenAI for query fanout
    openai_api_key: str = ""

    @property
    def sanity_configured(self) -> bool:
        """Check if Sanity is properly configured."""
        return bool(self.sanity_project_id and self.sanity_token)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
