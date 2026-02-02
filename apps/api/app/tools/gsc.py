"""Google Search Console performance lookup tool."""

import os
from datetime import datetime, timedelta
from typing import Any

from crewai.tools import tool

from app.tools.base import CredentialError, resolve_credential_value


def get_gsc_service(credential: dict[str, Any]):
    """Get a Google Search Console service with credentials.
    
    Args:
        credential: Credential document with type='gsc'
        
    Returns:
        Tuple of (GSC service, site_url)
        
    Raises:
        CredentialError: If credentials are missing or invalid
    """
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        raise CredentialError(
            "google-auth and google-api-python-client packages not installed. "
            "Run: pip install google-auth google-api-python-client"
        )
    
    storage_method = credential.get("storageMethod", "env")
    key_file = credential.get("gscKeyFile")
    site_url = credential.get("gscSiteUrl")
    
    if not key_file:
        raise CredentialError("Missing gscKeyFile in credential")
    if not site_url:
        raise CredentialError("Missing gscSiteUrl in credential")
    
    if storage_method == "env":
        # key_file is an env var name pointing to the file path
        file_path = os.environ.get(key_file)
        if not file_path:
            raise CredentialError(
                f"Environment variable '{key_file}' not set for GSC credentials"
            )
    else:
        file_path = key_file
    
    if not os.path.exists(file_path):
        raise CredentialError(f"GSC credentials file not found: {file_path}")
    
    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    creds = service_account.Credentials.from_service_account_file(file_path, scopes=scopes)
    
    service = build("searchconsole", "v1", credentials=creds)
    return service, site_url


@tool
def gsc_performance_lookup(query: str, credential: dict[str, Any], days: int = 90) -> str:
    """
    Fetch Google Search Console performance data for queries related to the topic.
    Returns impressions, clicks, CTR, and position data.
    
    Args:
        query: Search term to filter queries by (uses 'contains' matching)
        credential: GSC credential document
        days: Number of days to look back (default 90)
        
    Returns:
        Performance data including clicks, impressions, CTR, and position
        
    Raises:
        CredentialError: If credentials are missing or invalid
    """
    service, site_url = get_gsc_service(credential)
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    request_body = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["query"],
        "dimensionFilterGroups": [{
            "filters": [{
                "dimension": "query",
                "operator": "contains",
                "expression": query,
            }]
        }],
        "rowLimit": 50,
        "startRow": 0,
    }
    
    try:
        response = service.searchanalytics().query(
            siteUrl=site_url,
            body=request_body,
        ).execute()
        
        rows = response.get("rows", [])
        
        if not rows:
            return f"No GSC data found for queries containing '{query}'"
        
        result = f"""
GOOGLE SEARCH CONSOLE DATA
==========================
Site: {site_url}
Date range: {start_date} to {end_date}
Filter: queries containing "{query}"

Top Performing Queries:
"""
        
        for row in rows[:25]:
            query_text = row["keys"][0]
            clicks = row.get("clicks", 0)
            impressions = row.get("impressions", 0)
            ctr = row.get("ctr", 0) * 100
            position = row.get("position", 0)
            
            result += f"""
Query: {query_text}
  Clicks: {clicks} | Impressions: {impressions} | CTR: {ctr:.1f}% | Avg Position: {position:.1f}
"""
        
        total_clicks = sum(r.get("clicks", 0) for r in rows)
        total_impressions = sum(r.get("impressions", 0) for r in rows)
        avg_position = sum(r.get("position", 0) for r in rows) / len(rows) if rows else 0
        
        result += f"""
SUMMARY:
Total clicks: {total_clicks}
Total impressions: {total_impressions}
Average position: {avg_position:.1f}
Queries found: {len(rows)}
"""
        
        return result
        
    except Exception as e:
        raise CredentialError(f"Error fetching GSC data: {str(e)}")
