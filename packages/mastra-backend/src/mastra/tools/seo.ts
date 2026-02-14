/**
 * SEO tools — SEMrush and SerpAPI.
 * Port of apps/api/app/tools/seo.py
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { type CredentialConfig, resolveCredentialValue } from "../../sanity.js";

// ─── SEMrush ──────────────────────────────────────────────────

export const semrushKeywordOverview = createTool({
  id: "semrush_keyword_overview",
  description:
    "Look up keyword overview data from SEMrush API including search volume, " +
    "keyword difficulty, CPC, and competition.",
  inputSchema: z.object({
    keyword: z.string().describe("Keyword to look up"),
    credentialJson: z.string().describe("JSON-encoded credential document"),
    database: z.string().default("us").describe("SEMrush database (e.g. us, uk)"),
  }),
  execute: async ({ context: { keyword, credentialJson, database } }) => {
    try {
      const credential: CredentialConfig = JSON.parse(credentialJson);
      const apiKey = resolveCredentialValue(credential, "semrushApiKey");

      const params = new URLSearchParams({
        type: "phrase_all",
        key: apiKey,
        phrase: keyword,
        export_columns: "Ph,Nq,Kd,Cp,Co,Nr",
        database,
      });

      const resp = await fetch(
        `https://api.semrush.com/?${params.toString()}`,
        { signal: AbortSignal.timeout(30_000) }
      );

      if (!resp.ok) {
        return `SEMrush API error: ${resp.status} ${await resp.text()}`;
      }

      const text = await resp.text();
      const lines = text.trim().split("\n");

      if (lines.length < 2) {
        return `No SEMrush data found for keyword "${keyword}"`;
      }

      const headers = lines[0].split(";");
      const values = lines[1].split(";");

      let result = `
SEMRUSH KEYWORD OVERVIEW
========================
Keyword: "${keyword}"
Database: ${database}

`;
      const colNames: Record<string, string> = {
        Ph: "Keyword",
        Nq: "Search Volume",
        Kd: "Keyword Difficulty",
        Cp: "CPC ($)",
        Co: "Competition",
        Nr: "Results Count",
      };
      for (let i = 0; i < headers.length; i++) {
        const name = colNames[headers[i]] ?? headers[i];
        result += `${name}: ${values[i] ?? "N/A"}\n`;
      }

      return result;
    } catch (e: any) {
      return `SEMrush error: ${e.message}`;
    }
  },
});

// ─── SerpAPI (Google SERP results) ────────────────────────────

export const serpGoogleSearch = createTool({
  id: "serp_google_search",
  description:
    "Search Google via SerpAPI and return structured SERP results " +
    "including organic listings, featured snippets, and People Also Ask.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    credentialJson: z.string().describe("JSON-encoded credential document"),
    num: z.number().default(10).describe("Number of results"),
  }),
  execute: async ({ context: { query, credentialJson, num } }) => {
    try {
      const credential: CredentialConfig = JSON.parse(credentialJson);
      const apiKey = resolveCredentialValue(credential, "serpApiKey");

      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        num: String(num),
        engine: "google",
      });

      const resp = await fetch(
        `https://serpapi.com/search.json?${params.toString()}`,
        { signal: AbortSignal.timeout(30_000) }
      );

      if (!resp.ok) {
        return `SerpAPI error: ${resp.status}`;
      }

      const data: any = await resp.json();
      let result = `
GOOGLE SERP RESULTS
====================
Query: "${query}"

`;
      // Featured snippet
      if (data.answer_box) {
        result += `FEATURED SNIPPET:\n`;
        result += `  Type: ${data.answer_box.type ?? "unknown"}\n`;
        result += `  Answer: ${data.answer_box.snippet ?? data.answer_box.answer ?? ""}\n`;
        result += `  Source: ${data.answer_box.link ?? ""}\n\n`;
      }

      // Organic results
      const organic = data.organic_results ?? [];
      result += `ORGANIC RESULTS (${organic.length}):\n`;
      for (const r of organic.slice(0, num)) {
        result += `\n  #${r.position}: ${r.title}\n`;
        result += `  URL: ${r.link}\n`;
        result += `  Snippet: ${(r.snippet ?? "").slice(0, 200)}\n`;
      }

      // People also ask
      const paa = data.related_questions ?? [];
      if (paa.length) {
        result += `\nPEOPLE ALSO ASK (${paa.length}):\n`;
        for (const q of paa) {
          result += `  - ${q.question}\n`;
        }
      }

      return result;
    } catch (e: any) {
      return `SerpAPI error: ${e.message}`;
    }
  },
});
