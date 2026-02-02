"""
BigQuery tools for LLM visit data analysis.

These tools require BigQuery credentials.
"""

import os
from typing import Any

from app.tools.base import ToolError, require_credentials


@require_credentials("bigquery")
async def bigquery_describe_table(
    table_name: str,
    credentials: dict[str, Any],
) -> str:
    """
    Describe the schema of a BigQuery table to understand its structure before querying.
    
    Available tables:
    - 'sanity_llm_visits': Sanity.io LLM visit logs
    - 'enterprisecms_llm_logs': enterprisecms.org visit logs
    - 'headlesscms_llm_logs': headlesscms.guides visit logs
    
    Returns column names, types, and sample data to help construct effective queries.
    """
    try:
        from google.cloud import bigquery
    except ImportError:
        raise ToolError("google-cloud-bigquery package required. Install with: pip install google-cloud-bigquery")
    
    bq_creds = credentials["bigquery"]
    tables = bq_creds.get("tables", {})
    
    # Map friendly names to full table IDs
    if table_name in tables:
        full_table_id = tables[table_name]
    elif table_name in tables.values():
        full_table_id = table_name
    else:
        available = "\n".join(f"- '{k}' -> {v}" for k, v in tables.items())
        return f"ERROR: Unknown table '{table_name}'.\nAvailable tables:\n{available}"
    
    try:
        # Set credentials
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = bq_creds["credentials_file"]
        client = bigquery.Client()
        
        table = client.get_table(full_table_id)
        
        result = f"""
BIGQUERY TABLE SCHEMA
=====================
Table: {full_table_id}
Created: {table.created}
Modified: {table.modified}
Rows: {table.num_rows:,} (approximate)
Size: {table.num_bytes / (1024*1024):.2f} MB

COLUMNS:
"""
        for field in table.schema:
            result += f"  - {field.name}: {field.field_type}"
            if field.mode == "REPEATED":
                result += " (ARRAY)"
            if field.description:
                result += f" -- {field.description}"
            result += "\n"
        
        # Get sample data
        sample_query = f"SELECT * FROM `{full_table_id}` LIMIT 5"
        sample_df = client.query(sample_query).to_dataframe()
        
        result += f"\nSAMPLE DATA (first 5 rows):\n"
        result += sample_df.to_string(max_colwidth=50)
        
        # Get date range if there's a timestamp column
        date_columns = [
            f.name for f in table.schema 
            if "date" in f.name.lower() or "time" in f.name.lower() or "timestamp" in f.name.lower()
        ]
        if date_columns:
            date_col = date_columns[0]
            range_query = f"SELECT MIN({date_col}) as min_date, MAX({date_col}) as max_date FROM `{full_table_id}`"
            range_df = client.query(range_query).to_dataframe()
            result += f"\n\nDATE RANGE ({date_col}): {range_df['min_date'].iloc[0]} to {range_df['max_date'].iloc[0]}"
        
        return result
    
    except Exception as e:
        raise ToolError(f"Error describing table: {str(e)}")


@require_credentials("bigquery")
async def bigquery_llm_visits(
    query_type: str,
    credentials: dict[str, Any],
    days: int = 30,
    limit: int = 100,
) -> str:
    """
    Query BigQuery for LLM visit data across Sanity-owned properties.
    
    query_type options:
    - 'top_pages': Most visited pages by LLM bots
    - 'top_pages_sanity': Top pages on sanity.io visited by LLMs
    - 'top_pages_enterprisecms': Top pages on enterprisecms.org
    - 'top_pages_headlesscms': Top pages on headlesscms.guides
    - 'trending': Pages with increasing LLM traffic
    - 'by_bot': Breakdown by LLM bot type (ChatGPT, Claude, Perplexity, etc.)
    - 'content_gaps': Pages competitors have that get LLM traffic but Sanity doesn't
    
    days: Number of days to look back (default 30)
    limit: Number of results to return (default 100)
    """
    try:
        from google.cloud import bigquery
    except ImportError:
        raise ToolError("google-cloud-bigquery package required")
    
    bq_creds = credentials["bigquery"]
    tables = bq_creds.get("tables", {})
    
    # Get table names
    sanity_table = tables.get("sanity_llm_visits", "")
    enterprise_table = tables.get("enterprisecms_llm_logs", "")
    headless_table = tables.get("headlesscms_llm_logs", "")
    
    if not sanity_table:
        raise ToolError("BigQuery tables not configured in credentials")
    
    try:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = bq_creds["credentials_file"]
        client = bigquery.Client()
        
        # Build query based on type
        if query_type == "top_pages_sanity":
            query = f"""
            SELECT
                page_path,
                COUNT(*) as visits,
                COUNT(DISTINCT DATE(timestamp)) as days_with_visits
            FROM `{sanity_table}`
            WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
            GROUP BY page_path
            ORDER BY visits DESC
            LIMIT {limit}
            """
        
        elif query_type == "top_pages_enterprisecms":
            query = f"""
            SELECT
                page_path,
                COUNT(*) as visits,
                COUNT(DISTINCT DATE(timestamp)) as days_with_visits
            FROM `{enterprise_table}`
            WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
            GROUP BY page_path
            ORDER BY visits DESC
            LIMIT {limit}
            """
        
        elif query_type == "top_pages_headlesscms":
            query = f"""
            SELECT
                page_path,
                COUNT(*) as visits,
                COUNT(DISTINCT DATE(timestamp)) as days_with_visits
            FROM `{headless_table}`
            WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
            GROUP BY page_path
            ORDER BY visits DESC
            LIMIT {limit}
            """
        
        elif query_type == "top_pages":
            query = f"""
            WITH all_visits AS (
                SELECT 'sanity.io' as site, page_path, timestamp FROM `{sanity_table}`
                UNION ALL
                SELECT 'enterprisecms.org' as site, page_path, timestamp FROM `{enterprise_table}`
                UNION ALL
                SELECT 'headlesscms.guides' as site, page_path, timestamp FROM `{headless_table}`
            )
            SELECT
                site,
                page_path,
                COUNT(*) as visits
            FROM all_visits
            WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
            GROUP BY site, page_path
            ORDER BY visits DESC
            LIMIT {limit}
            """
        
        elif query_type == "by_bot":
            query = f"""
            SELECT
                CASE
                    WHEN LOWER(user_agent) LIKE '%chatgpt%' OR LOWER(user_agent) LIKE '%openai%' THEN 'ChatGPT/OpenAI'
                    WHEN LOWER(user_agent) LIKE '%claude%' OR LOWER(user_agent) LIKE '%anthropic%' THEN 'Claude/Anthropic'
                    WHEN LOWER(user_agent) LIKE '%perplexity%' THEN 'Perplexity'
                    WHEN LOWER(user_agent) LIKE '%google%' OR LOWER(user_agent) LIKE '%bard%' THEN 'Google/Bard'
                    WHEN LOWER(user_agent) LIKE '%bing%' OR LOWER(user_agent) LIKE '%copilot%' THEN 'Bing/Copilot'
                    ELSE 'Other LLM'
                END as bot_type,
                COUNT(*) as visits,
                COUNT(DISTINCT page_path) as unique_pages
            FROM `{sanity_table}`
            WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
            GROUP BY bot_type
            ORDER BY visits DESC
            """
        
        elif query_type == "trending":
            weeks_back = max(2, days // 7)
            query = f"""
            WITH weekly_visits AS (
                SELECT
                    page_path,
                    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)) as recent_week,
                    COUNTIF(timestamp < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                        AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)) as previous_period
                FROM `{sanity_table}`
                WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
                GROUP BY page_path
            )
            SELECT
                page_path,
                recent_week,
                previous_period,
                SAFE_DIVIDE(recent_week, NULLIF(previous_period / {weeks_back - 1}, 0)) as growth_rate
            FROM weekly_visits
            WHERE recent_week > 5
            ORDER BY growth_rate DESC
            LIMIT {limit}
            """
        
        elif query_type == "content_gaps":
            query = f"""
            WITH competitor_topics AS (
                SELECT
                    REGEXP_EXTRACT(page_path, r'/([^/]+)/?$') as topic_slug,
                    page_path,
                    COUNT(*) as visits
                FROM `{enterprise_table}`
                WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
                GROUP BY topic_slug, page_path
                HAVING visits > 3
            ),
            sanity_topics AS (
                SELECT DISTINCT
                    REGEXP_EXTRACT(page_path, r'/([^/]+)/?$') as topic_slug
                FROM `{sanity_table}`
                WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
            )
            SELECT
                c.topic_slug,
                c.page_path as competitor_page,
                c.visits,
                'Missing on Sanity.io' as gap_type
            FROM competitor_topics c
            LEFT JOIN sanity_topics s ON LOWER(c.topic_slug) = LOWER(s.topic_slug)
            WHERE s.topic_slug IS NULL
            ORDER BY c.visits DESC
            LIMIT {limit}
            """
        
        else:
            return f"""ERROR: Unknown query_type '{query_type}'.
Available types:
- 'top_pages': All sites combined
- 'top_pages_sanity': Sanity.io only
- 'top_pages_enterprisecms': enterprisecms.org only
- 'top_pages_headlesscms': headlesscms.guides only
- 'trending': Pages with growing LLM traffic
- 'by_bot': Breakdown by LLM bot type
- 'content_gaps': Topics competitors have that Sanity doesn't"""
        
        df = client.query(query).to_dataframe()
        
        result = f"""
BIGQUERY LLM VISITS ANALYSIS
============================
Query type: {query_type}
Time period: Last {days} days
Results: {len(df)} rows

DATA:
{df.to_string(max_colwidth=80)}
"""
        
        # Add summary stats
        if "visits" in df.columns:
            result += f"\n\nSUMMARY:"
            result += f"\n- Total visits: {df['visits'].sum():,}"
            result += f"\n- Average per page: {df['visits'].mean():.1f}"
            result += f"\n- Median: {df['visits'].median():.1f}"
        
        return result
    
    except Exception as e:
        raise ToolError(f"Error querying BigQuery: {str(e)}")


@require_credentials("bigquery")
async def bigquery_custom_query(
    sql: str,
    credentials: dict[str, Any],
) -> str:
    """
    Run a custom SQL query against BigQuery LLM visit tables.
    
    IMPORTANT: Use backticks around table names with hyphens.
    Example: SELECT * FROM `data-platform-302218.searchconsole.llm-visits2` LIMIT 10
    
    Use bigquery_describe_table first to understand the schema.
    """
    try:
        from google.cloud import bigquery
    except ImportError:
        raise ToolError("google-cloud-bigquery package required")
    
    bq_creds = credentials["bigquery"]
    
    # Safety checks
    sql_lower = sql.lower()
    dangerous_keywords = ["drop", "delete", "truncate", "update", "insert", "create", "alter"]
    if any(word in sql_lower for word in dangerous_keywords):
        raise ToolError("Only SELECT queries are allowed for safety.")
    
    try:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = bq_creds["credentials_file"]
        client = bigquery.Client()
        
        # Add LIMIT if not present
        if "limit" not in sql_lower:
            sql = sql.rstrip(";") + " LIMIT 1000"
        
        df = client.query(sql).to_dataframe()
        
        result = f"""
BIGQUERY CUSTOM QUERY RESULTS
=============================
Query: {sql[:200]}{'...' if len(sql) > 200 else ''}
Rows returned: {len(df)}

DATA:
{df.to_string(max_colwidth=80)}
"""
        return result
    
    except Exception as e:
        raise ToolError(f"Error executing query: {str(e)}")
