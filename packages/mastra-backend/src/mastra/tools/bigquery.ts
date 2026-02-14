/**
 * BigQuery tools for LLM visit data analysis.
 * Port of apps/api/app/tools/bigquery.py
 *
 * NOTE: This uses the Google Cloud BigQuery REST API directly via fetch
 * rather than the Python google-cloud-bigquery SDK. For full BigQuery
 * support, you may want to install @google-cloud/bigquery.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// ─── Helper: resolve BigQuery access ──────────────────────────

// For the TypeScript port, we use the BigQuery REST API via
// Google service account access tokens. The heavy lifting
// (DataFrame-style formatting) is replaced with JSON output.

interface BqCredential {
  bigqueryCredentialsFile?: string;
  storageMethod?: string;
  bigqueryTables?: Array<{ alias: string; fullTableId: string }>;
}

function resolveTable(cred: BqCredential, alias: string): string {
  const tables = cred.bigqueryTables ?? [];
  const match = tables.find((t) => t.alias === alias);
  if (match) return match.fullTableId;
  const available = tables.map((t) => t.alias);
  throw new Error(
    `No table mapping for alias '${alias}'. Available: ${available.join(", ")}`
  );
}

async function runBigQuery(
  sql: string,
  credentialJson: string
): Promise<{ columns: string[]; rows: unknown[][]; rowCount: number }> {
  // This is a placeholder — in production you'd either:
  // 1. Use @google-cloud/bigquery npm package
  // 2. Use the BigQuery REST API with a service account JWT
  // For now, we return a helpful error message directing setup.
  throw new Error(
    "BigQuery TypeScript integration requires @google-cloud/bigquery. " +
      "Install it and update this tool to use the Node.js BigQuery client. " +
      "The SQL query would be:\n" +
      sql
  );
}

// ─── Tools ────────────────────────────────────────────────────

export const bigqueryDescribeTable = createTool({
  id: "bigquery_describe_table",
  description:
    "Describe the schema of a BigQuery table to understand its structure before querying.",
  inputSchema: z.object({
    tableName: z.string().describe("Table alias (e.g. 'sanity_llm_visits') or full table ID"),
    credentialJson: z.string().describe("JSON-encoded BigQuery credential"),
  }),
  execute: async ({ context: { tableName, credentialJson } }) => {
    try {
      const credential: BqCredential = JSON.parse(credentialJson);
      const tables = credential.bigqueryTables ?? [];
      const mapping = Object.fromEntries(
        tables.map((t) => [t.alias, t.fullTableId])
      );

      const fullTableId =
        mapping[tableName] ??
        (Object.values(mapping).includes(tableName) ? tableName : null);

      if (!fullTableId) {
        return `Unknown table '${tableName}'. Available: ${Object.keys(mapping).join(", ")}`;
      }

      const sql = `SELECT * FROM \`${fullTableId}\` LIMIT 5`;
      const result = await runBigQuery(sql, credentialJson);
      return `Table: ${fullTableId}\nColumns: ${result.columns.join(", ")}\nRows: ${result.rowCount}`;
    } catch (e: any) {
      return `BigQuery error: ${e.message}`;
    }
  },
});

export const bigqueryLlmVisits = createTool({
  id: "bigquery_llm_visits",
  description:
    "Query BigQuery for LLM visit data across properties. " +
    "Supports: top_pages, top_pages_sanity, trending, by_bot, content_gaps.",
  inputSchema: z.object({
    queryType: z
      .enum([
        "top_pages",
        "top_pages_sanity",
        "top_pages_enterprisecms",
        "top_pages_headlesscms",
        "trending",
        "by_bot",
        "content_gaps",
      ])
      .describe("Type of query"),
    credentialJson: z.string().describe("JSON-encoded BigQuery credential"),
    days: z.number().default(30).describe("Number of days to look back"),
    limit: z.number().default(100).describe("Number of results to return"),
  }),
  execute: async ({ context: { queryType, credentialJson, days, limit } }) => {
    try {
      const credential: BqCredential = JSON.parse(credentialJson);
      let sanityTable: string, enterpriseTable: string, headlessTable: string;

      try {
        sanityTable = resolveTable(credential, "sanity_llm_visits");
        enterpriseTable = resolveTable(credential, "enterprisecms_llm_logs");
        headlessTable = resolveTable(credential, "headlesscms_llm_logs");
      } catch {
        sanityTable = "data-platform-302218.searchconsole.llm-visits2";
        enterpriseTable = "indexing-api-471516.enterprisecms.llm-logs";
        headlessTable = "indexing-api-471516.headlesscms.llm-logs";
      }

      const queries: Record<string, string> = {
        top_pages_sanity: `SELECT page_path, COUNT(*) as visits, COUNT(DISTINCT DATE(timestamp)) as days_with_visits FROM \`${sanityTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY page_path ORDER BY visits DESC LIMIT ${limit}`,
        top_pages_enterprisecms: `SELECT page_path, COUNT(*) as visits FROM \`${enterpriseTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY page_path ORDER BY visits DESC LIMIT ${limit}`,
        top_pages_headlesscms: `SELECT page_path, COUNT(*) as visits FROM \`${headlessTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY page_path ORDER BY visits DESC LIMIT ${limit}`,
        top_pages: `WITH all_visits AS (SELECT 'sanity.io' as site, page_path, timestamp FROM \`${sanityTable}\` UNION ALL SELECT 'enterprisecms.org' as site, page_path, timestamp FROM \`${enterpriseTable}\` UNION ALL SELECT 'headlesscms.guides' as site, page_path, timestamp FROM \`${headlessTable}\`) SELECT site, page_path, COUNT(*) as visits FROM all_visits WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY site, page_path ORDER BY visits DESC LIMIT ${limit}`,
        by_bot: `SELECT CASE WHEN LOWER(user_agent) LIKE '%chatgpt%' OR LOWER(user_agent) LIKE '%openai%' THEN 'ChatGPT/OpenAI' WHEN LOWER(user_agent) LIKE '%claude%' OR LOWER(user_agent) LIKE '%anthropic%' THEN 'Claude/Anthropic' WHEN LOWER(user_agent) LIKE '%perplexity%' THEN 'Perplexity' ELSE 'Other LLM' END as bot_type, COUNT(*) as visits FROM \`${sanityTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY bot_type ORDER BY visits DESC`,
        trending: `WITH weekly_visits AS (SELECT page_path, COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)) as recent_week, COUNTIF(timestamp < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)) as previous_period FROM \`${sanityTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY page_path) SELECT page_path, recent_week, previous_period FROM weekly_visits WHERE recent_week > 5 ORDER BY recent_week DESC LIMIT ${limit}`,
        content_gaps: `WITH competitor_topics AS (SELECT REGEXP_EXTRACT(page_path, r'/([^/]+)/?$') as topic_slug, page_path, COUNT(*) as visits FROM \`${enterpriseTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY) GROUP BY topic_slug, page_path HAVING visits > 3), sanity_topics AS (SELECT DISTINCT REGEXP_EXTRACT(page_path, r'/([^/]+)/?$') as topic_slug FROM \`${sanityTable}\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)) SELECT c.topic_slug, c.page_path as competitor_page, c.visits FROM competitor_topics c LEFT JOIN sanity_topics s ON LOWER(c.topic_slug) = LOWER(s.topic_slug) WHERE s.topic_slug IS NULL ORDER BY c.visits DESC LIMIT ${limit}`,
      };

      const sql = queries[queryType];
      if (!sql) return `Unknown query type: ${queryType}`;

      const result = await runBigQuery(sql, credentialJson);
      return `BigQuery LLM Visits (${queryType}, last ${days} days): ${result.rowCount} rows\n\n${JSON.stringify(result.rows, null, 2)}`;
    } catch (e: any) {
      return `BigQuery error: ${e.message}`;
    }
  },
});

export const bigqueryCustomQuery = createTool({
  id: "bigquery_custom_query",
  description:
    "Run a custom SQL query against BigQuery LLM visit tables. SELECT only.",
  inputSchema: z.object({
    sql: z.string().describe("SQL query (SELECT only)"),
    credentialJson: z.string().describe("JSON-encoded BigQuery credential"),
  }),
  execute: async ({ context: { sql, credentialJson } }) => {
    const forbidden = ["drop", "delete", "truncate", "update", "insert", "create", "alter"];
    if (forbidden.some((w) => sql.toLowerCase().includes(w))) {
      return "Only SELECT queries are allowed for safety.";
    }

    if (!sql.toLowerCase().includes("limit")) {
      sql = sql.replace(/;?\s*$/, " LIMIT 1000");
    }

    try {
      const result = await runBigQuery(sql, credentialJson);
      return `Custom query result: ${result.rowCount} rows\n${JSON.stringify(result.rows, null, 2)}`;
    } catch (e: any) {
      return `BigQuery error: ${e.message}`;
    }
  },
});
