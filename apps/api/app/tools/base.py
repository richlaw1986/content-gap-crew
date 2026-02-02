"""Base classes and utilities for CrewAI tools."""

import os
from typing import Any

from pydantic import BaseModel


class CredentialError(Exception):
    """Raised when required credentials are missing or invalid."""
    pass


def resolve_credential_value(credential: dict[str, Any], field: str) -> str:
    """Resolve a credential value based on storage method.
    
    Args:
        credential: Credential document from Sanity
        field: Field name to resolve (e.g., 'anthropicApiKey')
        
    Returns:
        The resolved credential value
        
    Raises:
        CredentialError: If the credential is missing or env var not found
    """
    value = credential.get(field)
    if not value:
        raise CredentialError(f"Missing credential field: {field}")
    
    storage_method = credential.get("storageMethod", "env")
    
    if storage_method == "env":
        # Value is an env var name
        env_value = os.environ.get(value)
        if not env_value:
            raise CredentialError(
                f"Environment variable '{value}' not set for credential field '{field}'"
            )
        return env_value
    elif storage_method == "direct":
        # Value is the actual credential
        return value
    elif storage_method == "external":
        # TODO: Implement external secret manager lookup
        raise CredentialError(f"External secret manager not yet implemented for field '{field}'")
    else:
        raise CredentialError(f"Unknown storage method: {storage_method}")


def require_credentials(
    credentials: list[dict[str, Any]],
    required_types: list[str],
) -> dict[str, dict[str, Any]]:
    """Validate and return required credentials.
    
    Args:
        credentials: List of credential documents from the crew
        required_types: List of credential types needed (e.g., ['bigquery', 'gsc'])
        
    Returns:
        Dict mapping credential type to credential document
        
    Raises:
        CredentialError: If any required credential type is missing
    """
    cred_by_type = {c["type"]: c for c in credentials}
    
    missing = [t for t in required_types if t not in cred_by_type]
    if missing:
        raise CredentialError(f"Missing required credentials: {', '.join(missing)}")
    
    return {t: cred_by_type[t] for t in required_types}
