/**
 * Google Ads Keyword Planner tool.
 *
 * Uses the Google Ads REST API v18 directly — no npm package needed.
 * Requires a google_ads credential with:
 *   developerToken, clientId, clientSecret, refreshToken, customerId
 *
 * The credential is pre-injected by the runner via `resolveAgentTools`,
 * so the LLM only needs to provide the `query` parameter.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { type CredentialConfig, resolveCredentialValue } from "../../sanity.js";

const GOOGLE_ADS_API_VERSION = "v19";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Exchange a refresh token for a short-lived access token.
 */
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }

  const data: any = await resp.json();
  if (!data.access_token) {
    throw new Error(`No access_token in token response: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Call the Google Ads generateKeywordIdeas REST endpoint.
 */
async function generateKeywordIdeas(
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId: string,
  query: string
): Promise<any> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordIdeas`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "login-customer-id": loginCustomerId || customerId,
    "Content-Type": "application/json",
  };

  const body = {
    keywordSeed: {
      keywords: [query],
    },
    language: "languageConstants/1000", // English
    geoTargetConstants: ["geoTargetConstants/2840"], // United States
    keywordPlanNetwork: "GOOGLE_SEARCH",
  };

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    // Strip HTML for cleaner error messages
    const clean = text.includes("<!DOCTYPE")
      ? `HTTP ${resp.status} — the Google Ads API may not be enabled in your GCP project. ` +
        `Enable it at: https://console.cloud.google.com/apis/library/googleads.googleapis.com ` +
        `(URL tried: ${url})`
      : `${resp.status}: ${text.slice(0, 500)}`;
    throw new Error(clean);
  }

  return resp.json();
}

/**
 * Format the API response into a readable string.
 */
function formatResults(query: string, data: any): string {
  const results = data.results ?? [];

  let output = `
GOOGLE ADS KEYWORD PLANNER DATA
===============================
Seed keyword: "${query}"
Language: English
Geo: United States

Keyword Ideas (${results.length}):
`;

  if (results.length === 0) {
    output += "\nNo keyword ideas returned for this query.\n";
    return output;
  }

  // Take top 30
  for (const idea of results.slice(0, 30)) {
    const keyword = idea.text ?? "";
    const metrics = idea.keywordIdeaMetrics ?? {};

    const avgSearches = metrics.avgMonthlySearches ?? 0;
    const competition = metrics.competition ?? "UNKNOWN";
    const lowBid = metrics.lowTopOfPageBidMicros
      ? (Number(metrics.lowTopOfPageBidMicros) / 1_000_000).toFixed(2)
      : "N/A";
    const highBid = metrics.highTopOfPageBidMicros
      ? (Number(metrics.highTopOfPageBidMicros) / 1_000_000).toFixed(2)
      : "N/A";

    output += `
Keyword: ${keyword}
  Avg Monthly Searches: ${Number(avgSearches).toLocaleString()}
  Competition: ${competition}
  Top of Page Bid: $${lowBid} - $${highBid}
`;
  }

  return output;
}

// ─── Mastra tool ──────────────────────────────────────────────

export const googleAdsKeywordIdeas = createTool({
  id: "google_ads_keyword_ideas",
  description:
    "Fetch keyword ideas and search volume from Google Ads Keyword Planner API. " +
    "Returns keyword suggestions with volume, competition, and bid estimates.",
  inputSchema: z.object({
    query: z.string().describe("Seed keyword to generate ideas from"),
    credentialJson: z
      .string()
      .describe("JSON-encoded Google Ads credential (auto-injected, do not set)"),
  }),
  execute: async ({ context: { query, credentialJson } }) => {
    try {
      const credential: CredentialConfig = JSON.parse(credentialJson);

      const developerToken = resolveCredentialValue(credential, "googleAdsDeveloperToken");
      const clientId = resolveCredentialValue(credential, "googleAdsClientId");
      const clientSecret = resolveCredentialValue(credential, "googleAdsClientSecret");
      const refreshToken = resolveCredentialValue(credential, "googleAdsRefreshToken");
      const rawCustomerId = resolveCredentialValue(credential, "googleAdsCustomerId");
      const customerId = rawCustomerId.replace(/-/g, "").trim();

      if (!customerId || !/^\d+$/.test(customerId)) {
        return `Google Ads error: Invalid customer ID "${rawCustomerId}". Expected a numeric ID like "123-456-7890" or "1234567890".`;
      }

      console.log(`[google_ads] Query: "${query}", Customer ID: ${customerId.slice(0, 4)}...`);

      // Get a fresh access token
      const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

      // Call the Keyword Planner API
      const data = await generateKeywordIdeas(
        accessToken,
        developerToken,
        customerId,
        customerId, // login_customer_id same as customer_id by default
        query
      );

      return formatResults(query, data);
    } catch (e: any) {
      return `Google Ads error: ${e.message}`;
    }
  },
});
