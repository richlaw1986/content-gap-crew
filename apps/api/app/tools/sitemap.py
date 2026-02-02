"""Sanity.io sitemap lookup and content audit tools."""

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

import httpx

from crewai.tools import tool


# Sitemap URLs to check
SANITY_SITEMAP_URLS = [
    "https://www.sanity.io/sitemap.xml",
    "https://www.sanity.io/community-sitemap.xml",
    "https://www.sanity.io/main-sitemap.xml",
    "https://www.sanity.io/ui-sitemap.xml",
    "https://www.sanity.io/docs/sitemap.xml",
    "https://www.sanity.io/customerstories-sitemap.xml",
    "https://www.sanity.io/resources-sitemap.xml",
    "https://www.sanity.io/blog-sitemap.xml",
    "https://www.sanity.io/guides-sitemap.xml",
    "https://www.sanity.io/templates-sitemap.xml",
    "https://www.sanity.io/plugins-sitemap.xml",
    "https://www.sanity.io/exchange-sitemap.xml",
]

# XML namespace for sitemaps
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

# Synonyms for common terms
SYNONYMS = {
    "content modeling": ["content-modeling", "content model", "schema", "document types", "content types"],
    "headless cms": ["headless-cms", "api-first", "decoupled"],
    "ai": ["artificial intelligence", "machine learning", "ml", "llm", "gpt", "generative"],
    "structured content": ["structured-content", "content structure"],
    "localization": ["localisation", "i18n", "internationalization", "translation"],
}


async def fetch_sitemap_urls(client: httpx.AsyncClient, sitemap_url: str) -> list[dict[str, Any]]:
    """Fetch URLs from a sitemap, handling both index and regular sitemaps.
    
    Returns list of dicts with 'url' and optional 'lastmod' keys.
    """
    urls = []
    
    try:
        response = await client.get(sitemap_url, timeout=30.0)
        if response.status_code != 200:
            return urls
            
        root = ET.fromstring(response.content)
        
        # Check if this is a sitemap index (contains links to other sitemaps)
        sitemap_locs = root.findall(".//sm:sitemap/sm:loc", SITEMAP_NS)
        if sitemap_locs:
            # It's an index - fetch child sitemaps (limit to 10)
            for sitemap_loc in sitemap_locs[:10]:
                child_url = sitemap_loc.text
                if child_url:
                    try:
                        child_response = await client.get(child_url, timeout=30.0)
                        if child_response.status_code == 200:
                            child_root = ET.fromstring(child_response.content)
                            for url_elem in child_root.findall(".//sm:url", SITEMAP_NS):
                                loc = url_elem.find("sm:loc", SITEMAP_NS)
                                lastmod = url_elem.find("sm:lastmod", SITEMAP_NS)
                                if loc is not None and loc.text:
                                    urls.append({
                                        "url": loc.text,
                                        "lastmod": lastmod.text if lastmod is not None else None,
                                    })
                    except Exception:
                        continue
        else:
            # Regular sitemap - extract URLs directly
            for url_elem in root.findall(".//sm:url", SITEMAP_NS):
                loc = url_elem.find("sm:loc", SITEMAP_NS)
                lastmod = url_elem.find("sm:lastmod", SITEMAP_NS)
                if loc is not None and loc.text:
                    urls.append({
                        "url": loc.text,
                        "lastmod": lastmod.text if lastmod is not None else None,
                    })
                    
    except Exception:
        pass
        
    return urls


def create_query_variations(query: str) -> list[str]:
    """Create variations of a query for matching."""
    query_lower = query.lower().strip()
    variations = [query_lower]
    
    # Add slug variations
    variations.append(query_lower.replace(" ", "-"))
    variations.append(query_lower.replace(" ", "_"))
    variations.append(query_lower.replace("-", ""))
    variations.append(query_lower.replace("_", ""))
    
    # Add synonym variations
    for key, syns in SYNONYMS.items():
        if key in query_lower or any(s in query_lower for s in syns):
            variations.extend(syns)
            variations.append(key)
    
    return list(set(variations))


def categorize_url(url: str) -> str | None:
    """Categorize a URL by content type."""
    url_lower = url.lower()
    if "/blog/" in url_lower:
        return "blog"
    elif "/docs/" in url_lower:
        return "docs"
    elif "/guides/" in url_lower or "/guide/" in url_lower:
        return "guides"
    elif "/templates/" in url_lower or "/template/" in url_lower:
        return "templates"
    elif "/plugins/" in url_lower or "/plugin/" in url_lower or "/exchange/" in url_lower:
        return "plugins"
    elif "/learn/" in url_lower:
        return "learn"
    elif "/resources/" in url_lower:
        return "resources"
    elif "/customers/" in url_lower or "/case-stud" in url_lower:
        return "customer_stories"
    return None


@tool
async def sanity_sitemap_lookup(query: str) -> str:
    """
    Comprehensive lookup of Sanity.io sitemap and existing content.
    Fetches ALL sitemaps and performs thorough matching including partial matches,
    related terms, and content categorization.

    Use this BEFORE recommending new content to verify it doesn't already exist.
    
    Args:
        query: Search term to look for in the sitemap
        
    Returns:
        Analysis of sitemap coverage for the query
    """
    async with httpx.AsyncClient() as client:
        # Fetch all URLs from all sitemaps
        all_urls: list[dict[str, Any]] = []
        
        for sitemap_url in SANITY_SITEMAP_URLS:
            urls = await fetch_sitemap_urls(client, sitemap_url)
            all_urls.extend(urls)
        
        if not all_urls:
            return "Could not fetch sitemap. Error connecting to Sanity.io sitemaps."
        
        # Remove duplicates while preserving order
        seen = set()
        unique_urls = []
        for item in all_urls:
            if item["url"] not in seen:
                seen.add(item["url"])
                unique_urls.append(item)
        all_urls = unique_urls
        
        # Create query variations for matching
        query_lower = query.lower().strip()
        query_terms = query_lower.replace("-", " ").replace("_", " ").split()
        query_variations = create_query_variations(query)
        
        # Find matches with different confidence levels
        exact_matches = []
        strong_matches = []
        partial_matches = []
        
        for item in all_urls:
            url = item["url"]
            url_lower = url.lower()
            url_path = url_lower.replace("https://www.sanity.io/", "").replace("https://sanity.io/", "")
            
            # Exact match in URL
            if query_lower in url_path or query_lower.replace(" ", "-") in url_path:
                exact_matches.append(item)
            # All query terms present
            elif all(term in url_path for term in query_terms if len(term) > 2):
                strong_matches.append(item)
            # Any variation matches
            elif any(var in url_path for var in query_variations if len(var) > 3):
                partial_matches.append(item)
            # Any significant term matches
            elif any(term in url_path for term in query_terms if len(term) > 4):
                partial_matches.append(item)
        
        # Categorize all URLs
        categories = {
            "blog": 0,
            "docs": 0,
            "guides": 0,
            "templates": 0,
            "plugins": 0,
            "learn": 0,
            "resources": 0,
            "customer_stories": 0,
        }
        for item in all_urls:
            cat = categorize_url(item["url"])
            if cat:
                categories[cat] += 1
        
        # Build result
        result = f"""
SANITY.IO SITEMAP ANALYSIS - COMPREHENSIVE
==========================================

Total URLs indexed: {len(all_urls)}

Content by category:
- Blog posts: {categories['blog']}
- Documentation: {categories['docs']}
- Guides: {categories['guides']}
- Templates: {categories['templates']}
- Plugins/Exchange: {categories['plugins']}
- Learn: {categories['learn']}
- Resources: {categories['resources']}
- Customer Stories: {categories['customer_stories']}

SEARCH RESULTS FOR: "{query}"
=============================

EXACT MATCHES ({len(exact_matches)}):
"""
        
        if exact_matches:
            for item in exact_matches[:15]:
                result += f"  ✓ {item['url']}\n"
        else:
            result += "  None found\n"
        
        result += f"\nSTRONG MATCHES ({len(strong_matches)}):\n"
        if strong_matches:
            for item in strong_matches[:15]:
                result += f"  ~ {item['url']}\n"
        else:
            result += "  None found\n"
        
        result += f"\nPARTIAL/RELATED MATCHES ({len(partial_matches)}):\n"
        if partial_matches:
            for item in partial_matches[:20]:
                result += f"  ? {item['url']}\n"
        else:
            result += "  None found\n"
        
        # Content gap assessment
        total_matches = len(exact_matches) + len(strong_matches)
        if total_matches == 0:
            result += f"\n⚠️  POTENTIAL CONTENT GAP: No strong content found for '{query}'\n"
            result += "   This topic may be a good candidate for new content.\n"
        elif total_matches < 3:
            result += f"\n📝 LIMITED COVERAGE: Only {total_matches} pages found for '{query}'\n"
            result += "   Consider expanding content on this topic.\n"
        else:
            result += f"\n✅ GOOD COVERAGE: {total_matches} relevant pages found for '{query}'\n"
            result += "   Review existing content before creating new.\n"
        
        return result


@tool
async def sanity_content_audit(content_area: str) -> str:
    """
    Perform a content audit for a specific area of Sanity.io.

    Args:
        content_area: Area to audit. Options:
            - 'ai': All AI/ML/LLM related content
            - 'integrations': Integration guides and docs
            - 'comparisons': Competitor comparison content
            - 'tutorials': Tutorial and how-to content
            - 'enterprise': Enterprise-focused content
            - 'developer': Developer experience content
            - 'all': Full content inventory

    Returns:
        Categorized URLs with freshness indicators where available.
    """
    # Define search patterns for each area
    area_patterns = {
        "ai": ["ai", "artificial-intelligence", "machine-learning", "ml", "llm",
               "gpt", "chatgpt", "claude", "generative", "openai", "anthropic",
               "vector", "embedding", "rag", "retrieval"],
        "integrations": ["integration", "integrate", "connect", "webhook",
                         "api", "sdk", "plugin", "extension"],
        "comparisons": ["vs", "versus", "comparison", "compare", "alternative",
                        "contentful", "strapi", "wordpress", "prismic", "dato"],
        "tutorials": ["tutorial", "how-to", "guide", "getting-started", "learn",
                      "walkthrough", "step-by-step", "example"],
        "enterprise": ["enterprise", "security", "compliance", "sso", "saml",
                       "governance", "audit", "scale", "migration"],
        "developer": ["developer", "groq", "schema", "query", "typescript",
                      "javascript", "react", "next", "gatsby", "nuxt", "vue"],
    }
    
    if content_area == "all":
        patterns = []
        for p_list in area_patterns.values():
            patterns.extend(p_list)
    elif content_area in area_patterns:
        patterns = area_patterns[content_area]
    else:
        return f"ERROR: Unknown content_area '{content_area}'. Options: {list(area_patterns.keys()) + ['all']}"
    
    async with httpx.AsyncClient() as client:
        # Fetch URLs from key sitemaps
        all_urls: list[dict[str, Any]] = []
        key_sitemaps = [
            "https://www.sanity.io/sitemap.xml",
            "https://www.sanity.io/docs/sitemap.xml",
            "https://www.sanity.io/blog-sitemap.xml",
            "https://www.sanity.io/guides-sitemap.xml",
        ]
        
        for sitemap_url in key_sitemaps:
            urls = await fetch_sitemap_urls(client, sitemap_url)
            all_urls.extend(urls)
        
        # Remove duplicates
        seen = set()
        unique_urls = []
        for item in all_urls:
            if item["url"] not in seen:
                seen.add(item["url"])
                unique_urls.append(item)
        all_urls = unique_urls
        
        # Filter by content area patterns
        matching_urls = []
        for item in all_urls:
            url_lower = item["url"].lower()
            if any(p in url_lower for p in patterns):
                matching_urls.append(item)
        
        # Sort by lastmod if available
        matching_urls.sort(key=lambda x: x.get("lastmod") or "", reverse=True)
        
        # Categorize by freshness
        now = datetime.now()
        fresh = []  # Updated in last 3 months
        moderate = []  # Updated 3-12 months ago
        stale = []  # Updated > 12 months ago
        unknown = []  # No lastmod
        
        for item in matching_urls:
            if item.get("lastmod"):
                try:
                    mod_date = datetime.fromisoformat(item["lastmod"].replace("Z", "+00:00"))
                    age_days = (now - mod_date.replace(tzinfo=None)).days
                    if age_days < 90:
                        fresh.append(item)
                    elif age_days < 365:
                        moderate.append(item)
                    else:
                        stale.append(item)
                except Exception:
                    unknown.append(item)
            else:
                unknown.append(item)
        
        result = f"""
SANITY.IO CONTENT AUDIT: {content_area.upper()}
{'=' * 50}

Total URLs scanned: {len(all_urls)}
Matching URLs: {len(matching_urls)}

CONTENT INVENTORY:

FRESH (< 3 months): {len(fresh)}
"""
        for item in fresh[:10]:
            date_str = item.get("lastmod", "N/A")[:10] if item.get("lastmod") else "N/A"
            result += f"  ✓ [{date_str}] {item['url']}\n"
        
        result += f"\nMODERATE (3-12 months): {len(moderate)}\n"
        for item in moderate[:10]:
            date_str = item.get("lastmod", "N/A")[:10] if item.get("lastmod") else "N/A"
            result += f"  ~ [{date_str}] {item['url']}\n"
        
        result += f"\nSTALE (> 12 months): {len(stale)}\n"
        for item in stale[:10]:
            date_str = item.get("lastmod", "N/A")[:10] if item.get("lastmod") else "N/A"
            result += f"  ⚠ [{date_str}] {item['url']}\n"
        
        result += f"\nUNKNOWN DATE: {len(unknown)}\n"
        for item in unknown[:10]:
            result += f"  ? {item['url']}\n"
        
        # AI content gap analysis
        if content_area == "ai":
            expected_ai_topics = [
                "ai content generation", "llm integration", "vector search",
                "rag architecture", "ai workflows", "prompt engineering",
                "ai-powered cms", "content ai", "generative ai cms",
                "ai personalization", "ai content strategy", "ai seo"
            ]
            
            result += "\n\nAI CONTENT GAP ANALYSIS:\n"
            result += "Expected AI topics and coverage:\n"
            
            for topic in expected_ai_topics:
                topic_found = any(
                    topic.replace(" ", "-") in item["url"].lower() or
                    topic.replace(" ", "") in item["url"].lower()
                    for item in matching_urls
                )
                status = "✓ Covered" if topic_found else "⚠ MISSING"
                result += f"  {status}: {topic}\n"
        
        return result
