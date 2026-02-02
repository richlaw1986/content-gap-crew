"""CrewAI tools for content gap analysis.

Tools are organized by credential requirements:
- No auth: sitemap, content audit, web scraping, analysis frameworks
- BigQuery: LLM visit data queries
- GSC: Google Search Console performance
- Google Ads: Keyword Planner
- Reddit: Discussion lookup
- OpenAI: Query fanout generation
"""

from app.tools.base import CredentialError, require_credentials, resolve_credential_value
from app.tools.sitemap import sanity_content_audit, sanity_sitemap_lookup
from app.tools.web import (
    competitor_content_gaps,
    fetch_and_compare_urls,
    fetch_webpage_content,
    top_aeo_pages,
    top_google_search_pages,
)

__all__ = [
    # Base utilities
    "CredentialError",
    "require_credentials",
    "resolve_credential_value",
    # Sitemap tools (no auth)
    "sanity_sitemap_lookup",
    "sanity_content_audit",
    # Web tools (no auth)
    "fetch_webpage_content",
    "fetch_and_compare_urls",
    "top_google_search_pages",
    "top_aeo_pages",
    "competitor_content_gaps",
]
