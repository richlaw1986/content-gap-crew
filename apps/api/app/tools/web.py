"""Web scraping and content fetching tools.

All tool functions are **synchronous** because CrewAI's ``crew.kickoff()``
runs in a thread-pool (``run_in_executor``) with no event loop.
"""

import re
import time
from typing import Any

import httpx
from bs4 import BeautifulSoup

from crewai.tools import tool


@tool
def fetch_webpage_content(url: str) -> str:
    """
    Fetch and extract main text content from a webpage.
    Useful for analyzing competitor content depth and structure.
    
    Args:
        url: The URL to fetch
        
    Returns:
        Analysis of the webpage including title, headings, and content metrics
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        with httpx.Client() as client:
            response = client.get(url, headers=headers, timeout=30.0, follow_redirects=True)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, "html.parser")
            
            # Remove non-content elements
            for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                element.decompose()
            
            # Extract title
            title = soup.title.string.strip() if soup.title and soup.title.string else "No title found"
            
            # Extract meta description
            meta_desc = ""
            meta_tag = soup.find("meta", attrs={"name": "description"})
            if meta_tag and meta_tag.get("content"):
                meta_desc = meta_tag["content"]
            
            # Extract headings
            headings = []
            for level in range(1, 5):
                for heading in soup.find_all(f"h{level}"):
                    text = heading.get_text(strip=True)
                    if text:
                        headings.append(f"{'  ' * (level - 1)}H{level}: {text}")
            
            # Find main content area
            main_content = (
                soup.find("main") or
                soup.find("article") or
                soup.find("div", {"role": "main"}) or
                soup.find("div", class_=re.compile(r"content|post|article|docs", re.I))
            )
            
            if main_content:
                text = main_content.get_text(separator="\n", strip=True)
            else:
                text = soup.get_text(separator="\n", strip=True)
            
            # Clean up text
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            text = "\n".join(lines)
            
            # Truncate if too long
            if len(text) > 10000:
                text = text[:10000] + "\n\n[Content truncated...]"
            
            # Calculate metrics
            word_count = len(text.split())
            has_code = bool(soup.find("code") or soup.find("pre"))
            num_images = len(soup.find_all("img"))
            num_lists = len(soup.find_all(["ul", "ol"]))
            num_tables = len(soup.find_all("table"))
            
            result = f"""
WEBPAGE CONTENT ANALYSIS
========================
URL: {url}

TITLE: {title}

META DESCRIPTION: {meta_desc[:200] if meta_desc else "None"}

HEADING STRUCTURE ({len(headings)} headings):
{chr(10).join(headings[:40]) if headings else "No headings found"}

CONTENT METRICS:
- Word count: ~{word_count}
- Code blocks: {'Yes' if has_code else 'No'}
- Images: {num_images}
- Lists: {num_lists}
- Tables: {num_tables}

MAIN CONTENT:
{text[:6000]}
"""
            return result
            
    except httpx.HTTPError as e:
        return f"ERROR fetching URL {url}: {str(e)}"
    except Exception as e:
        return f"ERROR parsing content from {url}: {str(e)}"


@tool
def fetch_and_compare_urls(urls: str) -> str:
    """
    Fetch and compare content from multiple URLs side by side.
    Essential for competitor gap analysis.
    
    Args:
        urls: Comma-separated URLs (max 5)
        
    Returns:
        Comparison of content metrics and structure across URLs
    """
    url_list = [u.strip() for u in urls.split(",") if u.strip()]
    
    if not url_list:
        return "ERROR: No valid URLs provided."
    
    if len(url_list) > 5:
        url_list = url_list[:5]
    
    results = []
    
    for url in url_list:
        content = fetch_webpage_content(url)
        
        # Parse metrics from the content analysis
        word_count = 0
        has_code = False
        heading_count = 0
        
        if "Word count:" in content:
            try:
                match = re.search(r"Word count: ~?(\d+)", content)
                if match:
                    word_count = int(match.group(1))
            except Exception:
                pass
        
        if "Code blocks: Yes" in content:
            has_code = True
        
        if "headings)" in content:
            try:
                match = re.search(r"\((\d+) headings\)", content)
                if match:
                    heading_count = int(match.group(1))
            except Exception:
                pass
        
        results.append({
            "url": url,
            "word_count": word_count,
            "has_code": has_code,
            "heading_count": heading_count,
            "full_analysis": content,
        })
        
        # Rate limiting
        time.sleep(1)
    
    output = f"""
MULTI-URL CONTENT COMPARISON
============================
URLs analyzed: {len(results)}

QUICK COMPARISON:
{'URL':<50} {'Words':<10} {'Headings':<10} {'Code'}
{'-' * 80}
"""
    
    for r in results:
        url_short = r["url"][:47] + "..." if len(r["url"]) > 50 else r["url"]
        output += f"{url_short:<50} {r['word_count']:<10} {r['heading_count']:<10} {'Yes' if r['has_code'] else 'No'}\n"
    
    output += "\n\nDETAILED ANALYSIS PER URL:\n"
    output += "=" * 80 + "\n"
    
    for r in results:
        output += f"\n{r['full_analysis']}\n"
        output += "-" * 80 + "\n"
    
    return output


@tool
def top_google_search_pages(query: str) -> str:
    """
    Identify current top-ranking Google search pages for the query.
    Provides analysis framework and competitor content gaps.
    
    Note: This tool provides a framework for manual analysis rather than
    automated scraping (which would violate Google's ToS).
    
    Args:
        query: Search query to analyze
        
    Returns:
        Analysis framework with competitor domains and checklist
    """
    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
    
    return f"""
TOP GOOGLE SEARCH PAGES ANALYSIS
================================
Query: "{query}"

Search URL: {search_url}

KEY COMPETITOR DOMAINS TO CHECK:
1. Contentful.com - Major competitor
2. Strapi.io - Open source competitor
3. Prismic.io - Mid-market competitor
4. DatoCMS.com - Enterprise competitor
5. Hygraph.com (formerly GraphCMS)
6. Storyblok.com - Visual editing competitor
7. Builder.io - No-code competitor

CONTENT FORMAT ANALYSIS CHECKLIST:
□ Does your site have a page specifically for "{query}"?
□ What format do top results use? (guide, comparison, tutorial, list)
□ Is there a featured snippet? What type?
□ Are there "People also ask" questions?
□ What schema markup do competitors use?

COMPETITOR CONTENT GAP INDICATORS:
- If competitors have dedicated pages and you don't = HIGH PRIORITY GAP
- If no one has good content = OPPORTUNITY TO OWN THE TOPIC
- If your content is old/thin vs comprehensive competitor content = UPDATE NEEDED

AEO SIGNALS TO CHECK:
- Do AI assistants cite any sources for this query?
- What domains get cited in ChatGPT/Claude responses?
- Is there a clear, quotable definition available?
"""


@tool
def top_aeo_pages(query: str) -> str:
    """
    Identify AEO (Answer Engine Optimization) opportunities with focus on:
    - Top X lists and rankings
    - Definitional content
    - Comparison content
    
    Args:
        query: Topic to analyze for AEO opportunities
        
    Returns:
        AEO analysis with content recommendations
    """
    return f"""
AEO (ANSWER ENGINE OPTIMIZATION) ANALYSIS
==========================================
Query: "{query}"

⭐ HIGH-VALUE AEO CONTENT TYPES:

1. TOP X LISTS (Very Important for LLM Citation)
   Examples for "{query}":
   - "Top 10 {query} platforms"
   - "Best {query} tools for 2025"
   - "Top 5 {query} use cases"
   - "Leading {query} solutions compared"

   WHY: LLMs love citing ranked lists. They're easy to parse
   and provide clear, structured answers.

2. DEFINITIONAL CONTENT
   - "What is {query}?"
   - Clear, quotable 1-2 sentence definitions
   - Structured explanations with headers

3. COMPARISON TABLES
   - "{query} vs [competitor]" content
   - Feature comparison matrices
   - Pricing comparison tables

4. HOW-TO CONTENT WITH STEPS
   - Numbered step-by-step guides
   - Clear prerequisites and outcomes
   - Code examples for technical topics

SANITY.IO AEO RECOMMENDATIONS FOR "{query}":

Content Structure Requirements:
✓ First paragraph must contain a clear, standalone definition
✓ Use H2/H3 headers that match common questions
✓ Include a comparison table if relevant
✓ Add numbered lists for steps/rankings
✓ Update date must be within last 90 days for LLM trust

Format Priority Order:
1. Create a "Top 10 {query}" style article
2. Create a definitive "What is {query}" guide
3. Create comparison content vs competitors
4. Create a step-by-step tutorial

FRESHNESS REQUIREMENTS (Critical for AEO):
- LLMs strongly prefer content updated in last 3 months
- Add "Last updated: [date]" prominently
- Review and refresh quarterly minimum

ENTITY GROUNDING:
- Mention specific tools, companies, standards by name
- Link to authoritative sources
- Be explicit about the product/brand's approach to {query}
"""


@tool
def competitor_content_gaps(site_url: str, topic: str, competitor_urls: str = "") -> str:
    """
    Analyze competitor content for a topic and identify gaps where your site
    is missing content that competitors have.

    Scans your site's sitemap, then checks competitor sitemaps for the same
    topic so you can see where you're behind.
    
    Args:
        site_url: Your website URL (e.g. "https://www.sanity.io")
        topic: Topic to analyze for competitor gaps
        competitor_urls: Comma-separated competitor site URLs.
                         If empty, defaults to common CMS competitors.
        
    Returns:
        Gap analysis with your site vs competitor coverage
    """
    from app.tools.sitemap import sitemap_lookup
    
    # Check your site's coverage
    your_check = sitemap_lookup(site_url, topic)
    
    # Parse competitor URLs or use defaults
    if competitor_urls.strip():
        comp_list = [u.strip() for u in competitor_urls.split(",") if u.strip()]
    else:
        comp_list = [
            "https://www.contentful.com",
            "https://strapi.io",
            "https://prismic.io",
            "https://www.storyblok.com",
        ]
    
    topic_slug = topic.lower().replace(" ", "-")
    from urllib.parse import urlparse
    site_name = urlparse(site_url).netloc
    
    result = f"""
COMPETITOR CONTENT GAP ANALYSIS
===============================
Topic: "{topic}"
Your Site: {site_url}

YOUR SITE COVERAGE:
{'-' * 40}
{your_check}

COMPETITOR SITEMAPS (checking for same topic):
{'-' * 40}
"""
    
    for comp_url in comp_list:
        comp_name = urlparse(comp_url).netloc
        try:
            comp_check = sitemap_lookup(comp_url, topic)
            # Extract just the match counts from the result
            result += f"\n{comp_name}:\n"
            for line in comp_check.split("\n"):
                line_stripped = line.strip()
                if "EXACT MATCHES" in line_stripped or "STRONG MATCHES" in line_stripped:
                    result += f"  {line_stripped}\n"
                elif line_stripped.startswith("✓") or line_stripped.startswith("~"):
                    result += f"    {line_stripped}\n"
                elif "CONTENT GAP" in line_stripped or "COVERAGE" in line_stripped:
                    result += f"  {line_stripped}\n"
        except Exception:
            result += f"\n{comp_name}: Could not fetch sitemap\n"
    
    result += f"""

GAP ANALYSIS CHECKLIST:
{'-' * 40}
□ Does {site_name} have a dedicated page for "{topic}"?
□ Is your content as comprehensive as competitors?
□ Is your content more recently updated?
□ Does your content rank better in search?
□ Do AI assistants cite your site for this topic?

RECOMMENDED ACTIONS:
1. If no content exists: Create new content (HIGH PRIORITY)
2. If thin content exists: Expand and update
3. If competitors have better content: Analyze and improve
4. If you're ahead: Optimize for AEO and discoverability
"""
    
    return result



