/**
 * Tool registry — all tools available to Mastra agents.
 */

// Web tools
export {
  fetchWebpageContent,
  fetchAndCompareUrls,
  topGoogleSearchPages,
  topAeoPages,
  competitorContentGaps,
} from "./web.js";

// Sitemap tools
export { sitemapLookup, contentAudit } from "./sitemap.js";

// SEO tools
export { semrushKeywordOverview, serpGoogleSearch } from "./seo.js";

// OpenAI tools
export { openaiQueryFanout } from "./openai-tools.js";

// Reddit
export { redditDiscussionLookup } from "./reddit.js";

// BigQuery (requires @google-cloud/bigquery for full support)
export {
  bigqueryDescribeTable,
  bigqueryLlmVisits,
  bigqueryCustomQuery,
} from "./bigquery.js";

// Google Search Console (requires googleapis for full support)
export { gscPerformanceLookup } from "./gsc.js";

// Google Ads (requires google-ads-api for full support)
export { googleAdsKeywordIdeas } from "./google-ads.js";

// JS Rendering Audit (requires playwright + chromium)
export { jsRenderingAudit } from "./js-rendering.js";

// Collect all tools into a flat array for easy agent assignment
import { fetchWebpageContent, fetchAndCompareUrls, topGoogleSearchPages, topAeoPages, competitorContentGaps } from "./web.js";
import { sitemapLookup, contentAudit } from "./sitemap.js";
import { semrushKeywordOverview, serpGoogleSearch } from "./seo.js";
import { openaiQueryFanout } from "./openai-tools.js";
import { redditDiscussionLookup } from "./reddit.js";
import { bigqueryDescribeTable, bigqueryLlmVisits, bigqueryCustomQuery } from "./bigquery.js";
import { gscPerformanceLookup } from "./gsc.js";
import { googleAdsKeywordIdeas } from "./google-ads.js";
import { jsRenderingAudit } from "./js-rendering.js";

export const ALL_TOOLS = {
  fetch_webpage_content: fetchWebpageContent,
  fetch_and_compare_urls: fetchAndCompareUrls,
  top_google_search_pages: topGoogleSearchPages,
  top_aeo_pages: topAeoPages,
  competitor_content_gaps: competitorContentGaps,
  sitemap_lookup: sitemapLookup,
  content_audit: contentAudit,
  semrush_keyword_overview: semrushKeywordOverview,
  serp_google_search: serpGoogleSearch,
  openai_query_fanout: openaiQueryFanout,
  reddit_discussion_lookup: redditDiscussionLookup,
  bigquery_describe_table: bigqueryDescribeTable,
  bigquery_llm_visits: bigqueryLlmVisits,
  bigquery_custom_query: bigqueryCustomQuery,
  gsc_performance_lookup: gscPerformanceLookup,
  google_ads_keyword_ideas: googleAdsKeywordIdeas,
  js_rendering_audit: jsRenderingAudit,
} as const;

export type ToolName = keyof typeof ALL_TOOLS;
