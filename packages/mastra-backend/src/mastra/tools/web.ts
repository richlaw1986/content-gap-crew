/**
 * Web scraping and content fetching tools.
 * Port of apps/api/app/tools/web.py
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as cheerio from "cheerio";

export const fetchWebpageContent = createTool({
  id: "fetch_webpage_content",
  description:
    "Fetch and extract main text content from a webpage. " +
    "Useful for analyzing competitor content depth and structure.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch"),
  }),
  execute: async ({ context: { url } }) => {
    try {
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      };
      const resp = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) return `ERROR: HTTP ${resp.status} for ${url}`;

      const html = await resp.text();
      const $ = cheerio.load(html);

      // Remove non-content elements
      $("script, style, nav, footer, header, aside").remove();

      const title =
        $("title").first().text().trim() || "No title found";
      const metaDesc =
        $('meta[name="description"]').attr("content") ?? "";

      // Extract headings
      const headings: string[] = [];
      for (let level = 1; level <= 4; level++) {
        $(`h${level}`).each((_, el) => {
          const text = $(el).text().trim();
          if (text) headings.push(`${"  ".repeat(level - 1)}H${level}: ${text}`);
        });
      }

      // Find main content area
      const mainEl =
        $("main").first() ||
        $("article").first() ||
        $('[role="main"]').first() ||
        $("div").filter(
          (_, el) => /content|post|article|docs/i.test($(el).attr("class") ?? "")
        ).first();

      let text = mainEl.length
        ? mainEl.text()
        : $("body").text();

      // Clean up
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      text = lines.join("\n");
      if (text.length > 10_000) text = text.slice(0, 10_000) + "\n\n[Content truncated...]";

      const wordCount = text.split(/\s+/).length;
      const hasCode = $("code, pre").length > 0;
      const numImages = $("img").length;
      const numLists = $("ul, ol").length;
      const numTables = $("table").length;

      return `
WEBPAGE CONTENT ANALYSIS
========================
URL: ${url}

TITLE: ${title}

META DESCRIPTION: ${metaDesc.slice(0, 200) || "None"}

HEADING STRUCTURE (${headings.length} headings):
${headings.slice(0, 40).join("\n") || "No headings found"}

CONTENT METRICS:
- Word count: ~${wordCount}
- Code blocks: ${hasCode ? "Yes" : "No"}
- Images: ${numImages}
- Lists: ${numLists}
- Tables: ${numTables}

MAIN CONTENT:
${text.slice(0, 6000)}
`;
    } catch (e: any) {
      return `ERROR fetching URL ${url}: ${e.message}`;
    }
  },
});

export const fetchAndCompareUrls = createTool({
  id: "fetch_and_compare_urls",
  description:
    "Fetch and compare content from multiple URLs side by side. " +
    "Essential for competitor gap analysis.",
  inputSchema: z.object({
    urls: z.string().describe("Comma-separated URLs (max 5)"),
  }),
  execute: async ({ context: { urls } }) => {
    const urlList = urls
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (!urlList.length) return "ERROR: No valid URLs provided.";

    const results: Array<{
      url: string;
      wordCount: number;
      hasCode: boolean;
      headingCount: number;
      fullAnalysis: string;
    }> = [];

    for (const url of urlList) {
      const analysis = (await fetchWebpageContent.execute!({
        context: { url },
      } as any)) as string;

      let wordCount = 0;
      let hasCode = false;
      let headingCount = 0;

      const wcMatch = analysis.match(/Word count: ~?(\d+)/);
      if (wcMatch) wordCount = parseInt(wcMatch[1]);
      if (analysis.includes("Code blocks: Yes")) hasCode = true;
      const hcMatch = analysis.match(/\((\d+) headings\)/);
      if (hcMatch) headingCount = parseInt(hcMatch[1]);

      results.push({ url, wordCount, hasCode, headingCount, fullAnalysis: analysis });
      // Rate limiting
      await new Promise((r) => setTimeout(r, 1000));
    }

    let output = `
MULTI-URL CONTENT COMPARISON
============================
URLs analyzed: ${results.length}

QUICK COMPARISON:
${"URL".padEnd(50)} ${"Words".padEnd(10)} ${"Headings".padEnd(10)} Code
${"-".repeat(80)}
`;
    for (const r of results) {
      const urlShort = r.url.length > 50 ? r.url.slice(0, 47) + "..." : r.url;
      output += `${urlShort.padEnd(50)} ${String(r.wordCount).padEnd(10)} ${String(r.headingCount).padEnd(10)} ${r.hasCode ? "Yes" : "No"}\n`;
    }

    output += "\n\nDETAILED ANALYSIS PER URL:\n" + "=".repeat(80) + "\n";
    for (const r of results) {
      output += `\n${r.fullAnalysis}\n${"─".repeat(80)}\n`;
    }

    return output;
  },
});

export const topGoogleSearchPages = createTool({
  id: "top_google_search_pages",
  description:
    "Identify current top-ranking Google search pages for the query. " +
    "Provides analysis framework and competitor content gaps.",
  inputSchema: z.object({
    query: z.string().describe("Search query to analyze"),
  }),
  execute: async ({ context: { query } }) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return `
TOP GOOGLE SEARCH PAGES ANALYSIS
================================
Query: "${query}"

Search URL: ${searchUrl}

KEY COMPETITOR DOMAINS TO CHECK:
1. Contentful.com - Major competitor
2. Strapi.io - Open source competitor
3. Prismic.io - Mid-market competitor
4. DatoCMS.com - Enterprise competitor
5. Hygraph.com (formerly GraphCMS)
6. Storyblok.com - Visual editing competitor
7. Builder.io - No-code competitor

CONTENT FORMAT ANALYSIS CHECKLIST:
□ Does your site have a page specifically for "${query}"?
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
`;
  },
});

export const topAeoPages = createTool({
  id: "top_aeo_pages",
  description:
    "Identify AEO (Answer Engine Optimization) opportunities with focus on " +
    "Top X lists, definitional content, and comparison content.",
  inputSchema: z.object({
    query: z.string().describe("Topic to analyze for AEO opportunities"),
  }),
  execute: async ({ context: { query } }) => {
    return `
AEO (ANSWER ENGINE OPTIMIZATION) ANALYSIS
==========================================
Query: "${query}"

⭐ HIGH-VALUE AEO CONTENT TYPES:

1. TOP X LISTS (Very Important for LLM Citation)
   Examples for "${query}":
   - "Top 10 ${query} platforms"
   - "Best ${query} tools for 2025"
   - "Top 5 ${query} use cases"
   - "Leading ${query} solutions compared"

   WHY: LLMs love citing ranked lists.

2. DEFINITIONAL CONTENT
   - "What is ${query}?"
   - Clear, quotable 1-2 sentence definitions

3. COMPARISON TABLES
   - "${query} vs [competitor]" content
   - Feature comparison matrices

4. HOW-TO CONTENT WITH STEPS
   - Numbered step-by-step guides
   - Code examples for technical topics

FRESHNESS REQUIREMENTS (Critical for AEO):
- LLMs strongly prefer content updated in last 3 months
- Add "Last updated: [date]" prominently
- Review and refresh quarterly minimum
`;
  },
});

export const competitorContentGaps = createTool({
  id: "competitor_content_gaps",
  description:
    "Analyze competitor content for a topic and identify gaps where your site " +
    "is missing content that competitors have.",
  inputSchema: z.object({
    siteUrl: z.string().describe('Your website URL (e.g. "https://www.sanity.io")'),
    topic: z.string().describe("Topic to analyze for competitor gaps"),
    competitorUrls: z
      .string()
      .optional()
      .describe("Comma-separated competitor site URLs (optional, defaults to CMS competitors)"),
  }),
  execute: async ({ context: { siteUrl, topic, competitorUrls } }) => {
    // This is a framework-based tool — provides structure for analysis
    const compList = competitorUrls?.trim()
      ? competitorUrls.split(",").map((u) => u.trim())
      : [
          "https://www.contentful.com",
          "https://strapi.io",
          "https://prismic.io",
          "https://www.storyblok.com",
        ];

    const parsed = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    const siteName = parsed.hostname;

    return `
COMPETITOR CONTENT GAP ANALYSIS
===============================
Topic: "${topic}"
Your Site: ${siteUrl}

Competitors to analyze:
${compList.map((c) => `- ${c}`).join("\n")}

GAP ANALYSIS CHECKLIST:
${"─".repeat(40)}
□ Does ${siteName} have a dedicated page for "${topic}"?
□ Is your content as comprehensive as competitors?
□ Is your content more recently updated?
□ Does your content rank better in search?
□ Do AI assistants cite your site for this topic?

RECOMMENDED ACTIONS:
1. If no content exists: Create new content (HIGH PRIORITY)
2. If thin content exists: Expand and update
3. If competitors have better content: Analyze and improve
4. If you're ahead: Optimize for AEO and discoverability
`;
  },
});
