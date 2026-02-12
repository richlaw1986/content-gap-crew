"""Sitemap lookup and content audit tools — works with any website.

All tool functions are **synchronous** because CrewAI's ``crew.kickoff()``
runs in a thread-pool (``run_in_executor``) with no event loop.  We use
``httpx.Client`` (sync) instead of ``httpx.AsyncClient``.
"""

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from crewai.tools import tool


# XML namespace for sitemaps
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def fetch_sitemap_urls(client: httpx.Client, sitemap_url: str) -> list[dict[str, Any]]:
    """Fetch URLs from a sitemap, handling both index and regular sitemaps.
    
    Returns list of dicts with 'url' and optional 'lastmod' keys.
    """
    urls = []
    
    try:
        response = client.get(sitemap_url, timeout=30.0, follow_redirects=True)
        if response.status_code != 200:
            return urls
            
        root = ET.fromstring(response.content)
        
        # Check if this is a sitemap index (contains links to other sitemaps)
        sitemap_locs = root.findall(".//sm:sitemap/sm:loc", SITEMAP_NS)
        if sitemap_locs:
            # It's an index - fetch child sitemaps (limit to 20)
            for sitemap_loc in sitemap_locs[:20]:
                child_url = sitemap_loc.text
                if child_url:
                    try:
                        child_response = client.get(child_url, timeout=30.0, follow_redirects=True)
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


def _normalize_url(raw: str) -> str:
    """Ensure a URL has a scheme so ``urlparse`` can split it correctly.

    Handles bare domains like ``sanity.io`` or ``www.example.com`` which
    ``urlparse`` misinterprets (puts the domain in ``path`` instead of
    ``netloc``) when no scheme is present.
    """
    raw = raw.strip().rstrip("/")
    if not raw:
        return raw
    # Already has a scheme
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    # Starts with // (protocol-relative)
    if raw.startswith("//"):
        return f"https:{raw}"
    # Bare domain — add https://
    return f"https://{raw}"


def _derive_sitemap_urls(site_url: str) -> list[str]:
    """Given a website URL, derive common sitemap locations to try.

    If the URL already points to an XML file, return it as-is.
    Otherwise, return a list of common sitemap paths to probe.
    """
    site_url = _normalize_url(site_url)

    # If the user gave us an explicit sitemap URL, just use that
    if site_url.endswith(".xml") or "sitemap" in site_url.lower():
        return [site_url]

    # Otherwise, try common locations
    parsed = urlparse(site_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    return [
        f"{base}/sitemap.xml",
        f"{base}/sitemap_index.xml",
        f"{base}/sitemap/sitemap-index.xml",
    ]


def create_query_variations(query: str) -> list[str]:
    """Create variations of a query for matching."""
    query_lower = query.lower().strip()
    variations = [query_lower]
    
    # Add slug variations
    variations.append(query_lower.replace(" ", "-"))
    variations.append(query_lower.replace(" ", "_"))
    variations.append(query_lower.replace("-", " "))
    variations.append(query_lower.replace("_", " "))
    variations.append(query_lower.replace("-", ""))
    variations.append(query_lower.replace("_", ""))
    
    return list(set(v for v in variations if v))


def categorize_url(url: str) -> str | None:
    """Categorize a URL by content type based on common path patterns."""
    url_lower = url.lower()
    if "/blog/" in url_lower or "/posts/" in url_lower or "/articles/" in url_lower:
        return "blog"
    elif "/docs/" in url_lower or "/documentation/" in url_lower or "/reference/" in url_lower:
        return "docs"
    elif "/guides/" in url_lower or "/guide/" in url_lower or "/how-to/" in url_lower:
        return "guides"
    elif "/templates/" in url_lower or "/template/" in url_lower or "/starters/" in url_lower:
        return "templates"
    elif "/plugins/" in url_lower or "/plugin/" in url_lower or "/extensions/" in url_lower or "/exchange/" in url_lower:
        return "plugins"
    elif "/learn/" in url_lower or "/tutorials/" in url_lower or "/tutorial/" in url_lower:
        return "learn"
    elif "/resources/" in url_lower or "/whitepapers/" in url_lower or "/ebooks/" in url_lower:
        return "resources"
    elif "/customers/" in url_lower or "/case-stud" in url_lower or "/success-stor" in url_lower:
        return "customer_stories"
    elif "/pricing" in url_lower:
        return "pricing"
    elif "/changelog" in url_lower or "/releases/" in url_lower:
        return "changelog"
    return None


@tool
def sitemap_lookup(site_url: str, query: str) -> str:
    """
    Look up a website's sitemap and search for content matching a query.
    Fetches the sitemap (handling indexes automatically), then performs
    thorough matching including partial matches and content categorization.

    Use this to check what content a site already has on a topic before
    recommending new content.
    
    Args:
        site_url: The website URL or sitemap URL to scan.  Bare domains are
                  accepted (e.g. "sanity.io") — https:// is added automatically.
                  Examples: "sanity.io", "https://www.sanity.io", "https://example.com/sitemap.xml"
        query: Search term to look for in the sitemap URLs.
        
    Returns:
        Analysis of sitemap coverage for the query.
    """
    site_url = _normalize_url(site_url)
    sitemap_candidates = _derive_sitemap_urls(site_url)

    with httpx.Client() as client:
        # Fetch all URLs from discovered sitemaps
        all_urls: list[dict[str, Any]] = []
        sitemaps_found = 0
        
        for sitemap_url in sitemap_candidates:
            urls = fetch_sitemap_urls(client, sitemap_url)
            if urls:
                sitemaps_found += 1
                all_urls.extend(urls)
        
        if not all_urls:
            return (
                f"Could not fetch sitemap for {site_url}. "
                f"Tried: {', '.join(sitemap_candidates)}. "
                f"The site may not have a publicly accessible sitemap."
            )
        
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
        
        # Derive the site's base path for stripping from URLs
        parsed = urlparse(site_url)
        base_domain = f"{parsed.scheme}://{parsed.netloc}/"
        
        # Find matches with different confidence levels
        exact_matches = []
        strong_matches = []
        partial_matches = []
        
        for item in all_urls:
            url = item["url"]
            url_lower = url.lower()
            url_path = url_lower.replace(base_domain.lower(), "")
            
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
        categories: dict[str, int] = {}
        for item in all_urls:
            cat = categorize_url(item["url"])
            if cat:
                categories[cat] = categories.get(cat, 0) + 1
        
        # Build result
        result = f"""
SITEMAP ANALYSIS: {site_url}
{'=' * 50}

Total URLs indexed: {len(all_urls)}
Sitemaps found: {sitemaps_found}
"""
        if categories:
            result += "\nContent by category:\n"
            for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
                result += f"- {cat.replace('_', ' ').title()}: {count}\n"

        result += f"""
SEARCH RESULTS FOR: "{query}"
{'=' * 35}

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
def content_audit(site_url: str, query: str = "") -> str:
    """
    Perform a content audit on any website by scanning its sitemap.
    Categorises URLs by content type and freshness (based on lastmod dates).
    Optionally filters to URLs matching a query.

    Args:
        site_url: The website URL or sitemap URL to audit.  Bare domains are
                  accepted (e.g. "strapi.io") — https:// is added automatically.
                  Examples: "strapi.io", "https://www.sanity.io", "https://example.com/sitemap.xml"
        query: Optional filter — only show URLs containing this term.
               Leave empty for a full inventory.

    Returns:
        Categorized URL inventory with freshness indicators.
    """
    site_url = _normalize_url(site_url)
    sitemap_candidates = _derive_sitemap_urls(site_url)

    with httpx.Client() as client:
        # Fetch URLs from sitemaps
        all_urls: list[dict[str, Any]] = []
        sitemaps_found = 0
        
        for sitemap_url in sitemap_candidates:
            urls = fetch_sitemap_urls(client, sitemap_url)
            if urls:
                sitemaps_found += 1
                all_urls.extend(urls)
        
        if not all_urls:
            return (
                f"Could not fetch sitemap for {site_url}. "
                f"Tried: {', '.join(sitemap_candidates)}. "
                f"The site may not have a publicly accessible sitemap."
            )

        # Remove duplicates
        seen = set()
        unique_urls = []
        for item in all_urls:
            if item["url"] not in seen:
                seen.add(item["url"])
                unique_urls.append(item)
        all_urls = unique_urls
        
        # Filter by query if provided
        if query.strip():
            query_lower = query.lower().strip()
            query_variations = create_query_variations(query)
            matching_urls = [
                item for item in all_urls
                if any(v in item["url"].lower() for v in query_variations)
            ]
        else:
            matching_urls = all_urls
        
        # Sort by lastmod if available
        matching_urls.sort(key=lambda x: x.get("lastmod") or "", reverse=True)
        
        # Categorize by freshness
        now = datetime.now()
        fresh = []    # Updated in last 3 months
        moderate = [] # Updated 3-12 months ago
        stale = []    # Updated > 12 months ago
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

        # Categorize by content type
        categories: dict[str, int] = {}
        for item in matching_urls:
            cat = categorize_url(item["url"]) or "other"
            categories[cat] = categories.get(cat, 0) + 1

        filter_label = f' (filtered by "{query}")' if query.strip() else ""

        result = f"""
CONTENT AUDIT: {site_url}{filter_label}
{'=' * 50}

Total URLs scanned: {len(all_urls)}
Matching URLs: {len(matching_urls)}
Sitemaps found: {sitemaps_found}
"""
        if categories:
            result += "\nContent by type:\n"
            for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
                result += f"  {cat.replace('_', ' ').title()}: {count}\n"

        result += f"""
FRESHNESS BREAKDOWN:

FRESH (< 3 months): {len(fresh)}
"""
        for item in fresh[:15]:
            date_str = item.get("lastmod", "N/A")[:10] if item.get("lastmod") else "N/A"
            result += f"  ✓ [{date_str}] {item['url']}\n"
        if len(fresh) > 15:
            result += f"  ... and {len(fresh) - 15} more\n"
        
        result += f"\nMODERATE (3-12 months): {len(moderate)}\n"
        for item in moderate[:15]:
            date_str = item.get("lastmod", "N/A")[:10] if item.get("lastmod") else "N/A"
            result += f"  ~ [{date_str}] {item['url']}\n"
        if len(moderate) > 15:
            result += f"  ... and {len(moderate) - 15} more\n"
        
        result += f"\nSTALE (> 12 months): {len(stale)}\n"
        for item in stale[:15]:
            date_str = item.get("lastmod", "N/A")[:10] if item.get("lastmod") else "N/A"
            result += f"  ⚠ [{date_str}] {item['url']}\n"
        if len(stale) > 15:
            result += f"  ... and {len(stale) - 15} more\n"
        
        result += f"\nUNKNOWN DATE: {len(unknown)}\n"
        for item in unknown[:10]:
            result += f"  ? {item['url']}\n"
        if len(unknown) > 10:
            result += f"  ... and {len(unknown) - 10} more\n"

        # Summary
        total_dated = len(fresh) + len(moderate) + len(stale)
        if total_dated > 0:
            stale_pct = round(len(stale) / total_dated * 100)
            result += f"\n📊 FRESHNESS SCORE: {stale_pct}% of dated content is stale (>12 months).\n"
            if stale_pct > 40:
                result += "   ⚠ High staleness — consider a content refresh programme.\n"
            elif stale_pct > 20:
                result += "   📝 Moderate staleness — prioritise updating key pages.\n"
            else:
                result += "   ✅ Content is relatively fresh.\n"
        
        return result
