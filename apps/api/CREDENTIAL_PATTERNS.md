# Credential Injection Patterns

Reference for porting tools from the source CrewAI script to FastAPI.

## General Pattern

All credentials from Sanity have a `storageMethod` field:
- `'env'` — field value is an env var name to look up
- `'direct'` — field value is the actual credential
- `'external'` — field value is a reference to external secret manager

```python
def resolve_value(credential: dict, field: str) -> str:
    """Resolve credential value based on storage method."""
    value = credential.get(field)
    if not value:
        raise ValueError(f"Missing required field: {field}")
    
    if credential['storageMethod'] == 'env':
        env_value = os.environ.get(value)
        if not env_value:
            raise ValueError(f"Environment variable not set: {value}")
        return env_value
    elif credential['storageMethod'] == 'external':
        # TODO: Implement external secret manager lookup
        raise NotImplementedError("External secret manager not yet implemented")
    else:
        return value  # direct value
```

## BigQuery

**Schema fields:**
- `bigqueryCredentialsFile` — path to service account JSON
- `bigqueryTables[]` — array of `{alias, fullTableId}`

**Client initialization:**
```python
from google.cloud import bigquery
from google.oauth2 import service_account

def get_bigquery_client(credential: dict) -> bigquery.Client:
    creds_file = resolve_value(credential, 'bigqueryCredentialsFile')
    
    if credential['storageMethod'] == 'env':
        # If env, the resolved value is the path
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_file
        return bigquery.Client()
    else:
        # Direct path to credentials file
        creds = service_account.Credentials.from_service_account_file(creds_file)
        return bigquery.Client(credentials=creds)

def resolve_table(credential: dict, alias: str) -> str:
    """Map table alias to full BigQuery table ID."""
    for table in credential.get('bigqueryTables', []):
        if table['alias'] == alias:
            return table['fullTableId']
    raise ValueError(f"No table mapping for alias: {alias}")
```

**Source script table aliases:**
- `sanity_llm_visits` → `data-platform-302218.searchconsole.llm-visits2`
- `enterprisecms_llm_logs` → `indexing-api-471516.enterprisecms.llm-logs`
- `headlesscms_llm_logs` → `indexing-api-471516.headlesscms.llm-logs`

## Google Search Console (GSC)

**Schema fields:**
- `gscKeyFile` — path to service account JSON
- `gscSiteUrl` — site URL (e.g., `https://www.sanity.io/`)

**Client initialization:**
```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

GSC_SCOPE = ["https://www.googleapis.com/auth/webmasters.readonly"]

def get_gsc_service(credential: dict):
    key_file = resolve_value(credential, 'gscKeyFile')
    site_url = credential.get('gscSiteUrl')
    
    if not site_url:
        raise ValueError("Missing gscSiteUrl in credential")
    
    creds = service_account.Credentials.from_service_account_file(
        key_file,
        scopes=GSC_SCOPE
    )
    service = build('webmasters', 'v3', credentials=creds)
    return service, site_url
```

## Google Ads

**Schema fields:**
- `googleAdsDeveloperToken`
- `googleAdsClientId`
- `googleAdsClientSecret`
- `googleAdsRefreshToken`
- `googleAdsCustomerId`

**Client initialization:**
```python
from google.ads.googleads.client import GoogleAdsClient

def get_google_ads_client(credential: dict) -> GoogleAdsClient:
    config = {
        'developer_token': resolve_value(credential, 'googleAdsDeveloperToken'),
        'client_id': resolve_value(credential, 'googleAdsClientId'),
        'client_secret': resolve_value(credential, 'googleAdsClientSecret'),
        'refresh_token': resolve_value(credential, 'googleAdsRefreshToken'),
        'login_customer_id': resolve_value(credential, 'googleAdsCustomerId'),
    }
    return GoogleAdsClient.load_from_dict(config)
```

## OpenAI

**Schema fields:**
- `openaiApiKey`

```python
from openai import OpenAI

def get_openai_client(credential: dict) -> OpenAI:
    api_key = resolve_value(credential, 'openaiApiKey')
    return OpenAI(api_key=api_key)
```

## Reddit

**Schema fields:**
- `redditClientId`
- `redditClientSecret`
- `redditUserAgent`

```python
import praw

def get_reddit_client(credential: dict) -> praw.Reddit:
    return praw.Reddit(
        client_id=resolve_value(credential, 'redditClientId'),
        client_secret=resolve_value(credential, 'redditClientSecret'),
        user_agent=resolve_value(credential, 'redditUserAgent'),
    )
```

## Anthropic

**Schema fields:**
- `anthropicApiKey`

```python
from anthropic import Anthropic

def get_anthropic_client(credential: dict) -> Anthropic:
    api_key = resolve_value(credential, 'anthropicApiKey')
    return Anthropic(api_key=api_key)
```

## Fail-Fast Validation

Before executing a tool, validate all required credentials are present:

```python
def validate_credentials(tool: dict, credentials: list[dict]) -> dict[str, dict]:
    """
    Validate that all required credentials for a tool are available.
    Returns a dict mapping credential type to credential document.
    Raises ValueError if any required credential is missing.
    """
    required_types = tool.get('credentialTypes', [])
    cred_by_type = {c['type']: c for c in credentials}
    
    missing = [t for t in required_types if t not in cred_by_type]
    if missing:
        raise ValueError(f"Missing required credentials for tool '{tool['name']}': {missing}")
    
    return {t: cred_by_type[t] for t in required_types}
```
