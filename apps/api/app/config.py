"""
Application configuration using Pydantic Settings.

Environment variables:
- SANITY_PROJECT_ID: Sanity project ID
- SANITY_DATASET: Sanity dataset (default: production)
- SANITY_API_TOKEN: Sanity API token for read/write access
- ANTHROPIC_API_KEY: Anthropic API key for LLM calls
- ENVIRONMENT: development | staging | production
"""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Sanity CMS
    sanity_project_id: str
    sanity_dataset: str = "production"
    sanity_api_token: str
    sanity_api_version: str = "2024-01-01"
    
    # LLM Configuration
    anthropic_api_key: str
    
    # LLM Model tiers (can be overridden per environment)
    llm_model_default: str = "claude-sonnet-4-5-20250929"
    llm_model_smart: str = "claude-opus-4-5-20251101"
    llm_model_fast: str = "claude-haiku-4-5-20251001"
    llm_temperature: float = 0.7
    
    # Application
    environment: str = "development"
    debug: bool = False
    
    # CORS (for local development)
    cors_origins: list[str] = ["http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
