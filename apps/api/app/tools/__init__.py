"""CrewAI tools for content gap analysis.

Tools are organized by credential requirements:
- No auth: sitemap, content audit, web scraping, analysis frameworks
- OpenAI: Query fanout generation
- Reddit: Discussion lookup
- BigQuery: LLM visit data queries
- GSC: Google Search Console performance
- Google Ads: Keyword Planner

All tools that require credentials will raise CredentialError if
credentials are missing or invalid (fail-fast behavior).
"""

from app.tools.base import CredentialError, require_credentials, resolve_credential_value
from app.tools.bigquery import bigquery_custom_query, bigquery_describe_table, bigquery_llm_visits
from app.tools.google_ads import google_ads_keyword_ideas
from app.tools.gsc import gsc_performance_lookup
from app.tools.openai_tools import openai_query_fanout
from app.tools.reddit import reddit_discussion_lookup
from app.tools.skills import search_skills
from app.tools.tools_catalog import list_available_tools
from app.tools.sitemap import sanity_content_audit, sanity_sitemap_lookup
from app.tools.web import (
    competitor_content_gaps,
    fetch_and_compare_urls,
    fetch_webpage_content,
    top_aeo_pages,
    top_google_search_pages,
)

# All available tools
ALL_TOOLS = [
    # No auth required
    sanity_sitemap_lookup,
    sanity_content_audit,
    fetch_webpage_content,
    fetch_and_compare_urls,
    top_google_search_pages,
    top_aeo_pages,
    competitor_content_gaps,
    # OpenAI
    openai_query_fanout,
    # Skills
    search_skills,
    # Tools catalog
    list_available_tools,
    # Reddit
    reddit_discussion_lookup,
    # BigQuery
    bigquery_describe_table,
    bigquery_llm_visits,
    bigquery_custom_query,
    # GSC
    gsc_performance_lookup,
    # Google Ads
    google_ads_keyword_ideas,
    # Skills
    search_skills,
    # Tools catalog
    list_available_tools,
]

# Tool name to function mapping
TOOL_REGISTRY = {tool.name: tool for tool in ALL_TOOLS}

# Tools by credential type
TOOLS_BY_CREDENTIAL = {
    None: [  # No credentials required
        "sanity_sitemap_lookup",
        "sanity_content_audit",
        "fetch_webpage_content",
        "fetch_and_compare_urls",
        "top_google_search_pages",
        "top_aeo_pages",
        "competitor_content_gaps",
        "list_available_tools",
    ],
    "openai": ["openai_query_fanout"],
    "reddit": ["reddit_discussion_lookup"],
    "bigquery": ["bigquery_describe_table", "bigquery_llm_visits", "bigquery_custom_query"],
    "gsc": ["gsc_performance_lookup"],
    "google_ads": ["google_ads_keyword_ideas"],
    "sanity": ["search_skills"],
}

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
    # OpenAI tools
    "openai_query_fanout",
    # Skills
    "search_skills",
    # Tools catalog
    "list_available_tools",
    # Reddit tools
    "reddit_discussion_lookup",
    # BigQuery tools
    "bigquery_describe_table",
    "bigquery_llm_visits",
    "bigquery_custom_query",
    # GSC tools
    "gsc_performance_lookup",
    # Google Ads tools
    "google_ads_keyword_ideas",
    # Registry
    "ALL_TOOLS",
    "TOOL_REGISTRY",
    "TOOLS_BY_CREDENTIAL",
]
