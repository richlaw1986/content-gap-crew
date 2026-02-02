# Content Gap Crew - Tools Reference

## Overview

14 tools ported from the original CrewAI script, organized by credential requirements.

## No Authentication Required (7 tools)

### `sanity_sitemap_lookup`
Search Sanity.io sitemaps for existing content on a topic.
- **Use case:** Check if content already exists before recommending new content
- **Returns:** Exact, strong, and partial matches with content gap assessment

### `sanity_content_audit`
Audit content freshness for a specific area (ai, integrations, comparisons, etc.)
- **Use case:** Find stale content that needs updating
- **Returns:** URLs categorized by freshness (fresh/moderate/stale)

### `fetch_webpage_content`
Fetch and extract main content from a URL.
- **Use case:** Analyze competitor content depth and structure
- **Returns:** Title, headings, word count, content metrics

### `fetch_and_compare_urls`
Compare content from multiple URLs side by side.
- **Use case:** Competitor gap analysis
- **Returns:** Comparison table with metrics per URL

### `top_google_search_pages`
Analysis framework for Google search results.
- **Use case:** Understand competitive landscape
- **Returns:** Checklist and competitor domains to check

### `top_aeo_pages`
AEO (Answer Engine Optimization) opportunity analysis.
- **Use case:** Identify content formats that LLMs prefer to cite
- **Returns:** Recommendations for Top X lists, definitions, comparisons

### `competitor_content_gaps`
Analyze competitor content and identify gaps.
- **Use case:** Find topics competitors cover that Sanity doesn't
- **Returns:** Gap analysis with recommended actions

## OpenAI Required (1 tool)

### `openai_query_fanout`
Generate query variations using OpenAI (with local fallback).
- **Credential:** `openaiApiKey`
- **Use case:** Expand a topic into related search queries
- **Returns:** Questions, comparisons, how-tos, AI queries, Top X lists

## Reddit Required (1 tool)

### `reddit_discussion_lookup`
Find relevant Reddit discussions about a topic.
- **Credentials:** `redditClientId`, `redditClientSecret`
- **Use case:** Discover real user questions and pain points
- **Returns:** Top posts, common questions, sample comments

## BigQuery Required (3 tools)

### `bigquery_describe_table`
Describe schema of a BigQuery table.
- **Credentials:** `bigqueryCredentialsFile`, `bigqueryTables[]`
- **Use case:** Understand table structure before querying
- **Returns:** Column names, types, sample data, date range

### `bigquery_llm_visits`
Query LLM visit data across Sanity properties.
- **Credentials:** Same as above
- **Query types:**
  - `top_pages` - Most visited pages by LLM bots
  - `top_pages_sanity` - Sanity.io only
  - `top_pages_enterprisecms` - enterprisecms.org only
  - `top_pages_headlesscms` - headlesscms.guides only
  - `trending` - Pages with increasing LLM traffic
  - `by_bot` - Breakdown by bot type (ChatGPT, Claude, etc.)
  - `content_gaps` - Topics competitors have that Sanity doesn't

### `bigquery_custom_query`
Run custom SQL queries (SELECT only).
- **Credentials:** Same as above
- **Use case:** Ad-hoc analysis
- **Safety:** Only SELECT queries allowed

## Google Search Console Required (1 tool)

### `gsc_performance_lookup`
Fetch GSC performance data for queries.
- **Credentials:** `gscKeyFile`, `gscSiteUrl`
- **Use case:** Understand current search performance
- **Returns:** Clicks, impressions, CTR, position by query

## Google Ads Required (1 tool)

### `google_ads_keyword_ideas`
Fetch keyword ideas from Google Ads Keyword Planner.
- **Credentials:** `googleAdsDeveloperToken`, `googleAdsClientId`, `googleAdsClientSecret`, `googleAdsRefreshToken`, `googleAdsCustomerId`
- **Use case:** Discover keyword opportunities with volume data
- **Returns:** Keywords with search volume, competition, bid estimates

## Credential Resolution

All tools use the `resolve_credential_value()` function from `app/tools/base.py`:

```python
def resolve_credential_value(credential: dict, field: str) -> str:
    """Resolve a credential field value based on storage method.
    
    If storageMethod is 'env', the field value is an env var name.
    If storageMethod is 'direct', the field value is the actual credential.
    """
```

This supports both:
- **Development:** Direct values in Sanity for testing
- **Production:** Environment variable references for security

## Error Handling

All credentialed tools raise `CredentialError` with clear messages:
- `"Missing bigqueryCredentialsFile in credential"`
- `"Environment variable 'GOOGLE_APPLICATION_CREDENTIALS' not set"`
- `"No table mapping for alias 'sanity_llm_visits'. Available: [...]"`

No silent fallbacks — tools fail fast with actionable error messages.
