"""Google Ads Keyword Planner tool."""

import os
import tempfile
from typing import Any

from crewai.tools import tool

from app.tools.base import CredentialError, resolve_credential_value


def get_google_ads_client(credential: dict[str, Any]):
    """Get a Google Ads client with credentials.
    
    Args:
        credential: Credential document with type='google_ads'
        
    Returns:
        GoogleAdsClient instance
        
    Raises:
        CredentialError: If credentials are missing or invalid
    """
    try:
        from google.ads.googleads.client import GoogleAdsClient
    except ImportError:
        raise CredentialError(
            "google-ads package not installed. Run: pip install google-ads"
        )
    
    storage_method = credential.get("storageMethod", "env")
    
    def resolve(field: str) -> str:
        value = credential.get(field)
        if not value:
            raise CredentialError(f"Missing {field} in credential")
        if storage_method == "env":
            env_value = os.environ.get(value)
            if not env_value:
                raise CredentialError(
                    f"Environment variable '{value}' not set for {field}"
                )
            return env_value
        return value
    
    # Build config dict
    config = {
        "developer_token": resolve("googleAdsDeveloperToken"),
        "client_id": resolve("googleAdsClientId"),
        "client_secret": resolve("googleAdsClientSecret"),
        "refresh_token": resolve("googleAdsRefreshToken"),
        "login_customer_id": resolve("googleAdsCustomerId").replace("-", ""),
        "use_proto_plus": True,
    }
    
    # GoogleAdsClient.load_from_dict expects a specific format
    # We need to write a temp YAML file or use load_from_dict
    try:
        return GoogleAdsClient.load_from_dict(config)
    except Exception as e:
        # Try writing a temp YAML file as fallback
        yaml_content = f"""developer_token: {config['developer_token']}
client_id: {config['client_id']}
client_secret: {config['client_secret']}
refresh_token: {config['refresh_token']}
login_customer_id: {config['login_customer_id']}
use_proto_plus: True
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            temp_path = f.name
        
        try:
            return GoogleAdsClient.load_from_storage(temp_path)
        finally:
            os.unlink(temp_path)


@tool
def google_ads_keyword_ideas(query: str, credential: dict[str, Any]) -> str:
    """
    Fetch keyword ideas and search volume from Google Ads Keyword Planner API.
    Returns keyword suggestions with volume, competition, and bid estimates.
    
    Args:
        query: Seed keyword to generate ideas from
        credential: Google Ads credential document
        
    Returns:
        Keyword ideas with search volume, competition, and bid estimates
        
    Raises:
        CredentialError: If credentials are missing or invalid
    """
    client = get_google_ads_client(credential)
    
    storage_method = credential.get("storageMethod", "env")
    customer_id_field = credential.get("googleAdsCustomerId")
    
    if storage_method == "env":
        customer_id = os.environ.get(customer_id_field, "").replace("-", "")
    else:
        customer_id = customer_id_field.replace("-", "") if customer_id_field else ""
    
    if not customer_id:
        raise CredentialError("Could not resolve Google Ads customer ID")
    
    try:
        keyword_plan_idea_service = client.get_service("KeywordPlanIdeaService")
        
        request = client.get_type("GenerateKeywordIdeasRequest")
        request.customer_id = customer_id
        request.language = "languageConstants/1000"  # English
        request.geo_target_constants = ["geoTargetConstants/2840"]  # United States
        request.include_adult_keywords = False
        request.keyword_plan_network = client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH
        
        request.keyword_seed.keywords.append(query)
        
        keyword_ideas = keyword_plan_idea_service.generate_keyword_ideas(request=request)
        
        result = f"""
GOOGLE ADS KEYWORD PLANNER DATA
===============================
Seed keyword: "{query}"

Keyword Ideas:
"""
        
        ideas_list = list(keyword_ideas)[:30]
        
        for idea in ideas_list:
            keyword = idea.text
            metrics = idea.keyword_idea_metrics
            
            avg_searches = metrics.avg_monthly_searches if metrics.avg_monthly_searches else 0
            competition = metrics.competition.name if metrics.competition else "UNKNOWN"
            low_bid = metrics.low_top_of_page_bid_micros / 1_000_000 if metrics.low_top_of_page_bid_micros else 0
            high_bid = metrics.high_top_of_page_bid_micros / 1_000_000 if metrics.high_top_of_page_bid_micros else 0
            
            result += f"""
Keyword: {keyword}
  Avg Monthly Searches: {avg_searches:,}
  Competition: {competition}
  Top of Page Bid: ${low_bid:.2f} - ${high_bid:.2f}
"""
        
        return result
        
    except Exception as e:
        raise CredentialError(f"Error fetching keyword data: {str(e)}")
