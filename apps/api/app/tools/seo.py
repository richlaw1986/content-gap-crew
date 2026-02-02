"""
SEO and AEO (Answer Engine Optimization) analysis tools.

These tools provide analysis frameworks and don't require credentials.
"""


async def top_google_search_pages(query: str) -> str:
    """
    Identify current top-ranking Google search pages for the query.
    
    Provides analysis framework and competitor content gaps.
    Note: This doesn't actually scrape Google (which would violate ToS).
    Instead, it provides a structured framework for manual analysis.
    """
    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
    
    result = f"""
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
□ Does Sanity have a page specifically for "{query}"?
□ What format do top results use? (guide, comparison, tutorial, list)
□ Is there a featured snippet? What type?
□ Are there "People also ask" questions?
□ What schema markup do competitors use?

COMPETITOR CONTENT GAP INDICATORS:
- If competitors have dedicated pages and Sanity doesn't = HIGH PRIORITY GAP
- If no one has good content = OPPORTUNITY TO OWN THE TOPIC
- If Sanity has old/thin content vs comprehensive competitor content = UPDATE NEEDED

AEO SIGNALS TO CHECK:
- Do AI assistants cite any sources for this query?
- What domains get cited in ChatGPT/Claude responses?
- Is there a clear, quotable definition available?
"""
    
    return result


async def top_aeo_pages(query: str) -> str:
    """
    Identify AEO (Answer Engine Optimization) opportunities with focus on:
    - Top X lists and rankings
    - Definitional content
    - Comparison content
    """
    result = f"""
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
- Be explicit about Sanity.io's approach to {query}
"""
    
    return result
