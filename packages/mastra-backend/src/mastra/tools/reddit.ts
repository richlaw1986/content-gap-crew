/**
 * Reddit discussion lookup tool.
 * Port of apps/api/app/tools/reddit.py
 *
 * Uses the Reddit OAuth API (same as PRAW) for reliable results.
 * Falls back to the public JSON API if no credentials are available.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { type CredentialConfig, resolveCredentialValue } from "../../sanity.js";

const RELEVANT_SUBREDDITS = [
  "webdev", "programming", "technology", "learnprogramming",
  "Wordpress", "frontend", "backend", "smallbusiness",
  "Entrepreneur", "content_marketing", "SEO", "Marketing",
  "FullStack", "nocode", "sideproject", "javascript",
  "reactjs", "nextjs", "jamstack", "headlessCMS", "cms",
  "MachineLearning", "artificial", "ChatGPT", "LocalLLaMA",
];

interface RedditPost {
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  permalink: string;
  created: string;
  selftext: string;
}

/**
 * Strip search-engine operators the LLM may have added.
 * The query should be plain topic keywords, not a Google-style search.
 */
function sanitizeQuery(raw: string): string {
  return raw
    .replace(/site:\S+/gi, "")       // site:reddit.com etc.
    .replace(/inurl:\S+/gi, "")      // inurl:reddit
    .replace(/intitle:\S+/gi, "")    // intitle:...
    .replace(/"reddit"/gi, "")       // literal "reddit"
    .replace(/\breddit\b/gi, "")     // bare word "reddit"
    .replace(/\breddit\.com\b/gi, "") // reddit.com
    .replace(/\s{2,}/g, " ")         // collapse multiple spaces
    .trim();
}

/**
 * Get an OAuth access token from Reddit using client credentials.
 */
async function getRedditToken(clientId: string, clientSecret: string, userAgent: string): Promise<string | null> {
  try {
    const resp = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "User-Agent": userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      console.warn(`[reddit] OAuth token request failed: ${resp.status}`);
      return null;
    }

    const data: any = await resp.json();
    return data.access_token ?? null;
  } catch (e: any) {
    console.warn(`[reddit] OAuth error: ${e.message}`);
    return null;
  }
}

/**
 * Search a subreddit using the OAuth API (oauth.reddit.com).
 */
async function searchSubreddit(
  sub: string,
  query: string,
  token: string,
  userAgent: string
): Promise<any[]> {
  const url = `https://oauth.reddit.com/r/${sub}/search?q=${encodeURIComponent(query)}&restrict_sr=1&limit=10&sort=relevance&t=year`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const data: any = await resp.json();
  return data?.data?.children ?? [];
}

/**
 * Fallback: search via the public JSON API (no auth, may be rate-limited).
 */
async function searchSubredditPublic(sub: string, query: string): Promise<any[]> {
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&limit=5&sort=relevance&t=year`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "SanityContentGapBot/1.0 (TypeScript)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const data: any = await resp.json();
  return data?.data?.children ?? [];
}

export const redditDiscussionLookup = createTool({
  id: "reddit_discussion_lookup",
  description:
    "Find relevant Reddit discussions about a topic. " +
    "Searches popular subreddits for posts and comments. " +
    "IMPORTANT: Pass only plain topic keywords (e.g. 'headless CMS comparison'). " +
    "Do NOT add 'reddit', 'site:reddit.com', or any search operators — the tool already searches Reddit.",
  inputSchema: z.object({
    query: z.string().describe("Plain topic keywords to search for (no search operators)"),
    credentialJson: z
      .string()
      .describe("JSON-encoded Reddit credential (auto-injected, do not set)"),
  }),
  execute: async ({ context: { query: rawQuery, credentialJson } }) => {
    const query = sanitizeQuery(rawQuery);
    if (!query) {
      return `Reddit search error: query was empty after sanitization (original: "${rawQuery}")`;
    }

    const allPosts: RedditPost[] = [];
    const seenPermalinks = new Set<string>();

    // Try to get OAuth credentials
    let token: string | null = null;
    let userAgent = "SanityContentGapBot/1.0 (TypeScript)";
    let useOAuth = false;

    if (credentialJson) {
      try {
        const cred: CredentialConfig = JSON.parse(credentialJson);
        const clientId = resolveCredentialValue(cred, "redditClientId");
        const clientSecret = resolveCredentialValue(cred, "redditClientSecret");
        userAgent = resolveCredentialValue(cred, "redditUserAgent") || userAgent;

        if (clientId && clientSecret) {
          token = await getRedditToken(clientId, clientSecret, userAgent);
          if (token) {
            useOAuth = true;
            console.log(`[reddit] Using OAuth API (authenticated)`);
          }
        }
      } catch {
        // Fall through to public API
      }
    }

    if (!useOAuth) {
      console.log(`[reddit] Using public JSON API (may be rate-limited)`);
    }

    // Search subreddits
    const subredditsToSearch = RELEVANT_SUBREDDITS.slice(0, useOAuth ? 15 : 8);

    for (const sub of subredditsToSearch) {
      try {
        const children = useOAuth
          ? await searchSubreddit(sub, query, token!, userAgent)
          : await searchSubredditPublic(sub, query);

        for (const child of children) {
          const d = child.data;
          if (!d?.permalink || seenPermalinks.has(d.permalink)) continue;
          seenPermalinks.add(d.permalink);

          allPosts.push({
            title: d.title ?? "",
            subreddit: d.subreddit ?? sub,
            score: d.score ?? 0,
            numComments: d.num_comments ?? 0,
            permalink: `https://reddit.com${d.permalink}`,
            created: d.created_utc
              ? new Date(d.created_utc * 1000).toISOString().slice(0, 10)
              : "unknown",
            selftext: (d.selftext ?? "").slice(0, 500),
          });
        }

        // Rate limiting — shorter delay with OAuth
        await new Promise((r) => setTimeout(r, useOAuth ? 500 : 1200));
      } catch {
        continue;
      }
    }

    // Also search r/all for broader coverage (OAuth only)
    if (useOAuth && token) {
      try {
        const allChildren = await searchSubreddit("all", query, token, userAgent);
        for (const child of allChildren) {
          const d = child.data;
          if (!d?.permalink || seenPermalinks.has(d.permalink)) continue;
          seenPermalinks.add(d.permalink);

          allPosts.push({
            title: d.title ?? "",
            subreddit: d.subreddit ?? "all",
            score: d.score ?? 0,
            numComments: d.num_comments ?? 0,
            permalink: `https://reddit.com${d.permalink}`,
            created: d.created_utc
              ? new Date(d.created_utc * 1000).toISOString().slice(0, 10)
              : "unknown",
            selftext: (d.selftext ?? "").slice(0, 500),
          });
        }
      } catch {
        // Non-fatal
      }
    }

    if (!allPosts.length) {
      return `No Reddit discussions found for '${query}'${!useOAuth ? " (note: unauthenticated — Reddit may be rate-limiting. Add Reddit credentials for better results)" : ""}`;
    }

    // Sort by engagement
    allPosts.sort((a, b) => b.score + b.numComments - (a.score + a.numComments));

    let result = `
REDDIT DISCUSSIONS
==================
Search query: "${query}"
Total relevant posts found: ${allPosts.length}
${useOAuth ? "(Authenticated via Reddit API)" : "(Public API — may have limited results)"}

Top Discussions by Engagement:
`;

    for (const post of allPosts.slice(0, 15)) {
      result += `
Title: ${post.title}
  Subreddit: r/${post.subreddit}
  Score: ${post.score} | Comments: ${post.numComments} | Date: ${post.created}
  URL: ${post.permalink}
`;
      if (post.selftext) {
        result += `  Preview: ${post.selftext.slice(0, 200).replace(/\n/g, " ")}...\n`;
      }
    }

    // Extract questions
    const questions = allPosts.filter((p) => p.title.includes("?")).map((p) => p.title);
    if (questions.length) {
      result += "\nCommon Questions Asked:\n";
      for (const q of questions.slice(0, 10)) result += `  - ${q}\n`;
    }

    return result;
  },
});
