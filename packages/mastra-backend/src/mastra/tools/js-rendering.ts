/**
 * JS Rendering Audit Tool
 *
 * Compares the raw HTML source of a page (no JavaScript) with the fully
 * rendered DOM (with JavaScript) to assess what content is client-side
 * rendered.  Useful for SEO/AEO analysis — search-engine crawlers and
 * AI assistants that don't execute JS will miss client-rendered content.
 *
 * Requires: playwright (chromium)
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as cheerio from "cheerio";

// ── Helpers ─────────────────────────────────────────────────────

interface PageSnapshot {
  /** Total text length (whitespace-normalised) */
  textLength: number;
  /** Word count */
  wordCount: number;
  /** All visible text, trimmed */
  visibleText: string;
  /** Heading texts by level */
  headings: Record<string, string[]>;
  /** Total heading count */
  headingCount: number;
  /** Number of <img> tags */
  imageCount: number;
  /** Number of <a> tags */
  linkCount: number;
  /** Internal link hrefs */
  internalLinks: string[];
  /** External link hrefs */
  externalLinks: string[];
  /** Number of <script> tags */
  scriptCount: number;
  /** Structured data (JSON-LD) */
  jsonLdCount: number;
  /** Meta title */
  metaTitle: string;
  /** Meta description */
  metaDescription: string;
  /** Canonical URL */
  canonical: string;
  /** Open Graph title */
  ogTitle: string;
  /** Elements with key selectors */
  selectorCounts: Record<string, number>;
}

function snapshotFromCheerio(html: string, baseUrl: string): PageSnapshot {
  const $ = cheerio.load(html);

  // Remove scripts/styles for text extraction
  const $text = cheerio.load(html);
  $text("script, style, noscript").remove();

  const visibleText = $text("body").text().replace(/\s+/g, " ").trim();
  const wordCount = visibleText ? visibleText.split(/\s+/).length : 0;

  const headings: Record<string, string[]> = {};
  let headingCount = 0;
  for (let level = 1; level <= 6; level++) {
    const key = `h${level}`;
    headings[key] = [];
    $(key).each((_, el) => {
      const t = $(el).text().trim();
      if (t) {
        headings[key].push(t);
        headingCount++;
      }
    });
  }

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    parsedBase = new URL("https://example.com");
  }

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname === parsedBase.hostname) {
        internalLinks.push(resolved.pathname);
      } else {
        externalLinks.push(resolved.href);
      }
    } catch {
      // skip malformed
    }
  });

  const selectorCounts: Record<string, number> = {};
  for (const sel of ["main", "article", "section", "nav", "footer", "header", "aside", "form", "table", "iframe", "video", "canvas"]) {
    const count = $(sel).length;
    if (count > 0) selectorCounts[sel] = count;
  }

  return {
    textLength: visibleText.length,
    wordCount,
    visibleText,
    headings,
    headingCount,
    imageCount: $("img").length,
    linkCount: $("a[href]").length,
    internalLinks: [...new Set(internalLinks)].slice(0, 50),
    externalLinks: [...new Set(externalLinks)].slice(0, 50),
    scriptCount: $("script").length,
    jsonLdCount: $('script[type="application/ld+json"]').length,
    metaTitle: $("title").first().text().trim(),
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || "",
    canonical: $('link[rel="canonical"]').attr("href") || "",
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim() || "",
    selectorCounts,
  };
}

function diffText(source: string, rendered: string): string[] {
  // Find sentences/phrases present in rendered but not in source
  const sourceNorm = source.toLowerCase();
  // Split rendered text into chunks of ~80 chars at sentence boundaries
  const sentences = rendered
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 15);

  const jsOnly: string[] = [];
  for (const sentence of sentences) {
    const needle = sentence.toLowerCase().trim();
    if (needle.length < 15) continue;
    // Check if this sentence (or a significant portion) appears in source
    if (!sourceNorm.includes(needle.slice(0, Math.min(needle.length, 60)))) {
      jsOnly.push(sentence.trim());
    }
  }
  return [...new Set(jsOnly)].slice(0, 30);
}

// ── Tool ────────────────────────────────────────────────────────

export const jsRenderingAudit = createTool({
  id: "js_rendering_audit",
  description:
    "Compare a page's raw HTML source (no JavaScript) with its fully rendered " +
    "DOM (with JavaScript) to assess what content is client-side rendered. " +
    "Returns a detailed report of differences: text, headings, images, links, " +
    "and structured data that only appear after JS execution. " +
    "Extremely useful for SEO audits — search engines and AI crawlers that " +
    "don't execute JS will miss client-rendered content.",
  inputSchema: z.object({
    url: z.string().describe("The URL to audit"),
    waitForSelector: z
      .string()
      .optional()
      .describe(
        'Optional CSS selector to wait for before capturing the rendered DOM (e.g. "main", "#content"). ' +
        "Helps ensure dynamic content has loaded."
      ),
    waitMs: z
      .number()
      .optional()
      .describe(
        "Optional extra milliseconds to wait after page load for JS to finish rendering (default: 3000)"
      ),
  }),
  execute: async ({ context: { url, waitForSelector, waitMs } }) => {
    const timeout = waitMs ?? 3000;

    // ── Step 1: Raw HTML (no JS) ─────────────────────────────
    let rawHtml: string;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          Accept: "text/html",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) return `ERROR: HTTP ${resp.status} fetching raw HTML for ${url}`;
      rawHtml = await resp.text();
    } catch (e: any) {
      return `ERROR fetching raw HTML for ${url}: ${e.message}`;
    }

    const sourceSnapshot = snapshotFromCheerio(rawHtml, url);

    // ── Step 2: Rendered DOM (with JS via Playwright) ────────
    let renderedHtml: string;
    let renderedSnapshot: PageSnapshot;

    try {
      // Dynamic import so the tool degrades gracefully if playwright isn't installed
      const { chromium } = await import("playwright");

      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      try {
        const page = await browser.newPage({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });

        // Use "domcontentloaded" instead of "networkidle" — modern sites
        // with analytics/websockets/trackers may never reach network idle.
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

        // Wait for the load event (images etc.) but don't fail if it times out
        await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});

        if (waitForSelector) {
          try {
            await page.waitForSelector(waitForSelector, { timeout: 10_000 });
          } catch {
            // Selector didn't appear — continue with what we have
          }
        }

        // Extra wait for late-loading JS / hydration
        await page.waitForTimeout(Math.max(timeout, 3000));

        renderedHtml = await page.content();
        renderedSnapshot = snapshotFromCheerio(renderedHtml, url);
      } finally {
        await browser.close();
      }
    } catch (e: any) {
      if (e.message?.includes("Cannot find module") || e.code === "ERR_MODULE_NOT_FOUND") {
        return (
          "ERROR: Playwright is not installed. Run:\n" +
          "  npm install playwright\n" +
          "  npx playwright install chromium\n\n" +
          "Raw HTML snapshot (without JS comparison):\n" +
          formatSingleSnapshot(sourceSnapshot, url)
        );
      }
      return `ERROR launching browser for ${url}: ${e.message}`;
    }

    // ── Step 3: Build diff report ────────────────────────────
    return buildReport(url, sourceSnapshot, renderedSnapshot);
  },
});

// ── Report formatters ───────────────────────────────────────────

function pct(a: number, b: number): string {
  if (b === 0) return a === 0 ? "0%" : "+∞";
  const delta = ((b - a) / a) * 100;
  if (delta === 0) return "0%";
  return delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`;
}

function buildReport(
  url: string,
  source: PageSnapshot,
  rendered: PageSnapshot
): string {
  const textDelta = rendered.wordCount - source.wordCount;
  const textPct = pct(source.wordCount, rendered.wordCount);
  const headingDelta = rendered.headingCount - source.headingCount;
  const imageDelta = rendered.imageCount - source.imageCount;
  const linkDelta = rendered.linkCount - source.linkCount;

  const clientRenderedRatio =
    source.wordCount > 0
      ? Math.max(0, ((rendered.wordCount - source.wordCount) / rendered.wordCount) * 100)
      : rendered.wordCount > 0
        ? 100
        : 0;

  let riskLevel: string;
  if (clientRenderedRatio < 5) riskLevel = "✅ LOW — Most content is in the HTML source";
  else if (clientRenderedRatio < 25) riskLevel = "⚠️ MODERATE — Some meaningful content requires JS";
  else if (clientRenderedRatio < 50) riskLevel = "🔶 HIGH — Significant content is client-rendered";
  else riskLevel = "🔴 CRITICAL — Majority of content is client-rendered";

  // Find JS-only text
  const jsOnlySentences = diffText(source.visibleText, rendered.visibleText);

  // Find headings that only appear after JS
  const jsOnlyHeadings: string[] = [];
  for (const level of ["h1", "h2", "h3", "h4"] as const) {
    const sourceSet = new Set(source.headings[level]?.map((h) => h.toLowerCase()) || []);
    for (const h of rendered.headings[level] || []) {
      if (!sourceSet.has(h.toLowerCase())) {
        jsOnlyHeadings.push(`${level.toUpperCase()}: ${h}`);
      }
    }
  }

  // Find elements only present in rendered DOM
  const jsOnlyElements: string[] = [];
  for (const [sel, renderedCount] of Object.entries(rendered.selectorCounts)) {
    const sourceCount = source.selectorCounts[sel] || 0;
    if (renderedCount > sourceCount) {
      jsOnlyElements.push(`<${sel}>: ${sourceCount} → ${renderedCount} (+${renderedCount - sourceCount})`);
    }
  }

  // Links diff
  const sourceInternalSet = new Set(source.internalLinks);
  const jsOnlyInternalLinks = rendered.internalLinks.filter((l) => !sourceInternalSet.has(l));
  const sourceExternalSet = new Set(source.externalLinks);
  const jsOnlyExternalLinks = rendered.externalLinks.filter((l) => !sourceExternalSet.has(l));

  // Meta / structured data changes
  const metaChanges: string[] = [];
  if (source.metaTitle !== rendered.metaTitle) {
    metaChanges.push(`Title: "${source.metaTitle}" → "${rendered.metaTitle}"`);
  }
  if (source.metaDescription !== rendered.metaDescription) {
    metaChanges.push(`Description changed after JS`);
  }
  if (source.canonical !== rendered.canonical) {
    metaChanges.push(`Canonical: "${source.canonical}" → "${rendered.canonical}"`);
  }
  if (source.ogTitle !== rendered.ogTitle) {
    metaChanges.push(`OG Title: "${source.ogTitle}" → "${rendered.ogTitle}"`);
  }
  if (rendered.jsonLdCount !== source.jsonLdCount) {
    metaChanges.push(`JSON-LD blocks: ${source.jsonLdCount} → ${rendered.jsonLdCount}`);
  }

  let report = `
JS RENDERING AUDIT
==================
URL: ${url}
Risk Level: ${riskLevel}
Client-Rendered Content: ${clientRenderedRatio.toFixed(1)}% of visible text

─── CONTENT COMPARISON ───────────────────────────────
                      Source (no JS)    Rendered (with JS)    Delta
Word count:           ${String(source.wordCount).padEnd(18)}${String(rendered.wordCount).padEnd(22)}${textDelta >= 0 ? "+" : ""}${textDelta} (${textPct})
Text length:          ${String(source.textLength).padEnd(18)}${String(rendered.textLength).padEnd(22)}${rendered.textLength - source.textLength >= 0 ? "+" : ""}${rendered.textLength - source.textLength}
Headings:             ${String(source.headingCount).padEnd(18)}${String(rendered.headingCount).padEnd(22)}${headingDelta >= 0 ? "+" : ""}${headingDelta}
Images:               ${String(source.imageCount).padEnd(18)}${String(rendered.imageCount).padEnd(22)}${imageDelta >= 0 ? "+" : ""}${imageDelta}
Links:                ${String(source.linkCount).padEnd(18)}${String(rendered.linkCount).padEnd(22)}${linkDelta >= 0 ? "+" : ""}${linkDelta}
Scripts:              ${String(source.scriptCount).padEnd(18)}${rendered.scriptCount}
JSON-LD:              ${String(source.jsonLdCount).padEnd(18)}${rendered.jsonLdCount}
`;

  if (metaChanges.length) {
    report += `
─── META / SEO TAG CHANGES (JS-modified) ────────────
${metaChanges.map((c) => `  ⚠ ${c}`).join("\n")}
`;
  } else {
    report += `\n─── META / SEO TAGS ──────────────────────────────────\n  ✅ No changes after JS execution\n`;
  }

  if (jsOnlyHeadings.length) {
    report += `
─── JS-ONLY HEADINGS (not in source HTML) ───────────
${jsOnlyHeadings.map((h) => `  + ${h}`).join("\n")}
`;
  }

  if (jsOnlyElements.length) {
    report += `
─── ELEMENT COUNT CHANGES ───────────────────────────
${jsOnlyElements.map((e) => `  ${e}`).join("\n")}
`;
  }

  if (jsOnlyInternalLinks.length) {
    report += `
─── JS-ONLY INTERNAL LINKS (${jsOnlyInternalLinks.length}) ─────────────
${jsOnlyInternalLinks.slice(0, 20).map((l) => `  + ${l}`).join("\n")}
${jsOnlyInternalLinks.length > 20 ? `  ... and ${jsOnlyInternalLinks.length - 20} more` : ""}
`;
  }

  if (jsOnlyExternalLinks.length) {
    report += `
─── JS-ONLY EXTERNAL LINKS (${jsOnlyExternalLinks.length}) ─────────────
${jsOnlyExternalLinks.slice(0, 15).map((l) => `  + ${l}`).join("\n")}
${jsOnlyExternalLinks.length > 15 ? `  ... and ${jsOnlyExternalLinks.length - 15} more` : ""}
`;
  }

  if (jsOnlySentences.length) {
    report += `
─── SAMPLE JS-ONLY TEXT (not in source HTML) ────────
${jsOnlySentences.slice(0, 15).map((s) => `  "${s.slice(0, 120)}${s.length > 120 ? "..." : ""}"`).join("\n")}
${jsOnlySentences.length > 15 ? `  ... and ${jsOnlySentences.length - 15} more` : ""}
`;
  }

  report += `
─── SEO RECOMMENDATIONS ─────────────────────────────
`;
  if (clientRenderedRatio < 5) {
    report += `  ✅ This page is well-optimised for non-JS crawlers.\n`;
    report += `  ✅ Search engines and AI assistants will see almost all content.\n`;
  } else {
    if (jsOnlyHeadings.length) {
      report += `  ⚠ ${jsOnlyHeadings.length} heading(s) only appear with JS — search engines may miss them.\n`;
    }
    if (imageDelta > 3) {
      report += `  ⚠ ${imageDelta} images are lazy-loaded/JS-rendered — use <noscript> fallbacks or SSR.\n`;
    }
    if (clientRenderedRatio > 25) {
      report += `  🔶 Consider server-side rendering (SSR) or static generation for this page.\n`;
      report += `  🔶 Google can render JS but with delays; other crawlers/AI bots often cannot.\n`;
    }
    if (metaChanges.length) {
      report += `  ⚠ Meta tags change after JS — ensure initial HTML has correct SEO tags.\n`;
    }
    if (jsOnlyInternalLinks.length > 10) {
      report += `  ⚠ ${jsOnlyInternalLinks.length} internal links only appear with JS — crawl discovery may be impacted.\n`;
    }
  }

  return report;
}

function formatSingleSnapshot(snap: PageSnapshot, url: string): string {
  return `
RAW HTML SNAPSHOT (no JS)
=========================
URL: ${url}
Word count: ${snap.wordCount}
Headings: ${snap.headingCount}
Images: ${snap.imageCount}
Links: ${snap.linkCount}
JSON-LD blocks: ${snap.jsonLdCount}
Title: ${snap.metaTitle}
Description: ${snap.metaDescription.slice(0, 200)}
Canonical: ${snap.canonical}
`;
}
