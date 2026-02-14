/**
 * Sitemap lookup and content audit tools.
 * Port of apps/api/app/tools/sitemap.py
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";

// ─── Helpers ──────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  raw = raw.trim().replace(/\/+$/, "");
  if (!raw) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return `https://${raw}`;
}

function deriveSitemapUrls(siteUrl: string): string[] {
  siteUrl = normalizeUrl(siteUrl);
  if (siteUrl.endsWith(".xml") || siteUrl.toLowerCase().includes("sitemap")) {
    return [siteUrl];
  }
  const base = new URL(siteUrl).origin;
  return [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap/sitemap-index.xml`,
  ];
}

interface SitemapEntry {
  url: string;
  lastmod?: string;
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  try {
    const resp = await fetch(sitemapUrl, {
      headers: { "User-Agent": "ContentGapBot/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return entries;

    const xml = await resp.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    // Check if sitemap index
    const sitemapIndex =
      parsed?.sitemapindex?.sitemap ??
      parsed?.["sitemapindex"]?.["sitemap"];
    if (sitemapIndex) {
      const locs = Array.isArray(sitemapIndex) ? sitemapIndex : [sitemapIndex];
      for (const loc of locs.slice(0, 20)) {
        const childUrl = loc?.loc;
        if (childUrl) {
          const childEntries = await fetchSitemapUrls(childUrl);
          entries.push(...childEntries);
        }
      }
      return entries;
    }

    // Regular sitemap
    const urlset = parsed?.urlset?.url ?? parsed?.["urlset"]?.["url"];
    if (urlset) {
      const urls = Array.isArray(urlset) ? urlset : [urlset];
      for (const u of urls) {
        const loc = u?.loc;
        if (loc) {
          entries.push({ url: loc, lastmod: u?.lastmod });
        }
      }
    }
  } catch {
    // Silently fail — sitemap may not exist
  }
  return entries;
}

function createQueryVariations(query: string): string[] {
  const q = query.toLowerCase().trim();
  const variations = new Set([
    q,
    q.replace(/ /g, "-"),
    q.replace(/ /g, "_"),
    q.replace(/-/g, " "),
    q.replace(/_/g, " "),
    q.replace(/-/g, ""),
    q.replace(/_/g, ""),
  ]);
  return [...variations].filter(Boolean);
}

function categorizeUrl(url: string): string | null {
  const u = url.toLowerCase();
  if (/\/blog\/|\/posts\/|\/articles\//.test(u)) return "blog";
  if (/\/docs\/|\/documentation\/|\/reference\//.test(u)) return "docs";
  if (/\/guides?\/|\/how-to\//.test(u)) return "guides";
  if (/\/templates?\/|\/starters\//.test(u)) return "templates";
  if (/\/plugins?\/|\/extensions?\/|\/exchange\//.test(u)) return "plugins";
  if (/\/learn\/|\/tutorials?\//.test(u)) return "learn";
  if (/\/resources\/|\/whitepapers\/|\/ebooks\//.test(u)) return "resources";
  if (/\/customers\/|\/case-stud|\/success-stor/.test(u)) return "customer_stories";
  if (/\/pricing/.test(u)) return "pricing";
  if (/\/changelog|\/releases\//.test(u)) return "changelog";
  return null;
}

// ─── Tools ────────────────────────────────────────────────────

export const sitemapLookup = createTool({
  id: "sitemap_lookup",
  description:
    "Look up a website's sitemap and search for content matching a query. " +
    "Fetches the sitemap (handling indexes automatically), then performs " +
    "thorough matching including partial matches and content categorization.",
  inputSchema: z.object({
    siteUrl: z
      .string()
      .describe(
        'Website URL or sitemap URL. Bare domains accepted (e.g. "sanity.io")'
      ),
    query: z.string().describe("Search term to look for in the sitemap URLs"),
  }),
  execute: async ({ context: { siteUrl, query } }) => {
    siteUrl = normalizeUrl(siteUrl);
    const candidates = deriveSitemapUrls(siteUrl);
    let allUrls: SitemapEntry[] = [];
    let sitemapsFound = 0;

    for (const candidate of candidates) {
      const urls = await fetchSitemapUrls(candidate);
      if (urls.length) {
        sitemapsFound++;
        allUrls.push(...urls);
      }
    }

    if (!allUrls.length) {
      return `Could not fetch sitemap for ${siteUrl}. Tried: ${candidates.join(", ")}. The site may not have a publicly accessible sitemap.`;
    }

    // Deduplicate
    const seen = new Set<string>();
    allUrls = allUrls.filter((e) => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    const queryLower = query.toLowerCase().trim();
    const queryTerms = queryLower.replace(/[-_]/g, " ").split(/\s+/);
    const queryVariations = createQueryVariations(query);

    const base = new URL(siteUrl).origin + "/";
    const exact: SitemapEntry[] = [];
    const strong: SitemapEntry[] = [];
    const partial: SitemapEntry[] = [];

    for (const entry of allUrls) {
      const urlPath = entry.url.toLowerCase().replace(base.toLowerCase(), "");
      if (urlPath.includes(queryLower) || urlPath.includes(queryLower.replace(/ /g, "-"))) {
        exact.push(entry);
      } else if (queryTerms.filter((t) => t.length > 2).every((t) => urlPath.includes(t))) {
        strong.push(entry);
      } else if (queryVariations.some((v) => v.length > 3 && urlPath.includes(v))) {
        partial.push(entry);
      } else if (queryTerms.some((t) => t.length > 4 && urlPath.includes(t))) {
        partial.push(entry);
      }
    }

    // Categories
    const categories: Record<string, number> = {};
    for (const entry of allUrls) {
      const cat = categorizeUrl(entry.url);
      if (cat) categories[cat] = (categories[cat] ?? 0) + 1;
    }

    let result = `
SITEMAP ANALYSIS: ${siteUrl}
${"=".repeat(50)}

Total URLs indexed: ${allUrls.length}
Sitemaps found: ${sitemapsFound}
`;
    if (Object.keys(categories).length) {
      result += "\nContent by category:\n";
      for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
        result += `- ${cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${count}\n`;
      }
    }

    result += `
SEARCH RESULTS FOR: "${query}"
${"=".repeat(35)}

EXACT MATCHES (${exact.length}):
`;
    if (exact.length) {
      for (const e of exact.slice(0, 15)) result += `  ✓ ${e.url}\n`;
    } else {
      result += "  None found\n";
    }

    result += `\nSTRONG MATCHES (${strong.length}):\n`;
    if (strong.length) {
      for (const e of strong.slice(0, 15)) result += `  ~ ${e.url}\n`;
    } else {
      result += "  None found\n";
    }

    result += `\nPARTIAL/RELATED MATCHES (${partial.length}):\n`;
    if (partial.length) {
      for (const e of partial.slice(0, 20)) result += `  ? ${e.url}\n`;
    } else {
      result += "  None found\n";
    }

    const totalMatches = exact.length + strong.length;
    if (totalMatches === 0) {
      result += `\n⚠️  POTENTIAL CONTENT GAP: No strong content found for '${query}'\n`;
    } else if (totalMatches < 3) {
      result += `\n📝 LIMITED COVERAGE: Only ${totalMatches} pages found for '${query}'\n`;
    } else {
      result += `\n✅ GOOD COVERAGE: ${totalMatches} relevant pages found for '${query}'\n`;
    }

    return result;
  },
});

export const contentAudit = createTool({
  id: "content_audit",
  description:
    "Perform a content audit on any website by scanning its sitemap. " +
    "Categorises URLs by content type and freshness (based on lastmod dates).",
  inputSchema: z.object({
    siteUrl: z
      .string()
      .describe("Website URL or sitemap URL to audit"),
    query: z
      .string()
      .optional()
      .describe("Optional filter — only show URLs containing this term"),
  }),
  execute: async ({ context: { siteUrl, query } }) => {
    siteUrl = normalizeUrl(siteUrl);
    const candidates = deriveSitemapUrls(siteUrl);
    let allUrls: SitemapEntry[] = [];
    let sitemapsFound = 0;

    for (const candidate of candidates) {
      const urls = await fetchSitemapUrls(candidate);
      if (urls.length) {
        sitemapsFound++;
        allUrls.push(...urls);
      }
    }

    if (!allUrls.length) {
      return `Could not fetch sitemap for ${siteUrl}. Tried: ${candidates.join(", ")}.`;
    }

    // Deduplicate
    const seen = new Set<string>();
    allUrls = allUrls.filter((e) => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    let matchingUrls = allUrls;
    if (query?.trim()) {
      const variations = createQueryVariations(query);
      matchingUrls = allUrls.filter((e) =>
        variations.some((v) => e.url.toLowerCase().includes(v))
      );
    }

    matchingUrls.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""));

    const now = Date.now();
    const fresh: SitemapEntry[] = [];
    const moderate: SitemapEntry[] = [];
    const stale: SitemapEntry[] = [];
    const unknown: SitemapEntry[] = [];

    for (const entry of matchingUrls) {
      if (entry.lastmod) {
        try {
          const ageDays = (now - new Date(entry.lastmod).getTime()) / 86_400_000;
          if (ageDays < 90) fresh.push(entry);
          else if (ageDays < 365) moderate.push(entry);
          else stale.push(entry);
        } catch {
          unknown.push(entry);
        }
      } else {
        unknown.push(entry);
      }
    }

    const filterLabel = query?.trim() ? ` (filtered by "${query}")` : "";
    let result = `
CONTENT AUDIT: ${siteUrl}${filterLabel}
${"=".repeat(50)}

Total URLs scanned: ${allUrls.length}
Matching URLs: ${matchingUrls.length}
Sitemaps found: ${sitemapsFound}

FRESHNESS BREAKDOWN:

FRESH (< 3 months): ${fresh.length}
`;
    for (const e of fresh.slice(0, 15)) {
      const d = e.lastmod?.slice(0, 10) ?? "N/A";
      result += `  ✓ [${d}] ${e.url}\n`;
    }
    if (fresh.length > 15) result += `  ... and ${fresh.length - 15} more\n`;

    result += `\nMODERATE (3-12 months): ${moderate.length}\n`;
    for (const e of moderate.slice(0, 15)) {
      const d = e.lastmod?.slice(0, 10) ?? "N/A";
      result += `  ~ [${d}] ${e.url}\n`;
    }

    result += `\nSTALE (> 12 months): ${stale.length}\n`;
    for (const e of stale.slice(0, 15)) {
      const d = e.lastmod?.slice(0, 10) ?? "N/A";
      result += `  ⚠ [${d}] ${e.url}\n`;
    }

    result += `\nUNKNOWN DATE: ${unknown.length}\n`;
    for (const e of unknown.slice(0, 10)) result += `  ? ${e.url}\n`;

    const totalDated = fresh.length + moderate.length + stale.length;
    if (totalDated > 0) {
      const stalePct = Math.round((stale.length / totalDated) * 100);
      result += `\n📊 FRESHNESS SCORE: ${stalePct}% of dated content is stale (>12 months).\n`;
    }

    return result;
  },
});
