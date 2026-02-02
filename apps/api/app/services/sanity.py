"""Sanity CMS client for fetching crew configurations."""

import os
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.models import Agent, Credential, Crew, Run, Task, Tool


class SanityClient:
    """Client for interacting with Sanity CMS.
    
    Fetches crew configurations, agents, tools, and credentials.
    Creates and updates run documents.
    """

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.base_url = (
            f"https://{self.settings.sanity_project_id}.api.sanity.io"
            f"/v{self.settings.sanity_api_version}/data"
        )
        self._client: httpx.AsyncClient | None = None

    @property
    def configured(self) -> bool:
        """Check if Sanity is properly configured."""
        return self.settings.sanity_configured

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            headers = {}
            if self.settings.sanity_token:
                headers["Authorization"] = f"Bearer {self.settings.sanity_token}"
            self._client = httpx.AsyncClient(headers=headers, timeout=30.0)
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def query(self, groq: str, params: dict[str, Any] | None = None) -> Any:
        """Execute a GROQ query against Sanity.
        
        Args:
            groq: GROQ query string
            params: Optional query parameters
            
        Returns:
            Query result
            
        Raises:
            httpx.HTTPError: If the request fails
            ValueError: If Sanity is not configured
        """
        if not self.configured:
            raise ValueError("Sanity is not configured. Set SANITY_PROJECT_ID and SANITY_TOKEN.")

        client = await self._get_client()
        url = f"{self.base_url}/query/{self.settings.sanity_dataset}"
        
        request_params = {"query": groq}
        if params:
            for key, value in params.items():
                request_params[f"${key}"] = value

        response = await client.get(url, params=request_params)
        response.raise_for_status()
        
        data = response.json()
        return data.get("result")

    async def mutate(self, mutations: list[dict[str, Any]]) -> dict[str, Any]:
        """Execute mutations against Sanity.
        
        Args:
            mutations: List of mutation objects
            
        Returns:
            Mutation result
        """
        if not self.configured:
            raise ValueError("Sanity is not configured.")

        client = await self._get_client()
        url = f"{self.base_url}/mutate/{self.settings.sanity_dataset}"
        
        response = await client.post(url, json={"mutations": mutations})
        response.raise_for_status()
        
        return response.json()

    # ================================================================
    # Crew Operations
    # ================================================================

    async def get_crew(self, crew_id: str) -> Crew | None:
        """Fetch a crew with all expanded references.
        
        Expands: agents (with tools), tasks (with context), credentials
        """
        groq = """
        *[_type == "crew" && _id == $id][0] {
            _id,
            name,
            slug,
            description,
            process,
            memoryEnabled,
            verbose,
            agents[]-> {
                _id,
                name,
                role,
                goal,
                backstory,
                llmTier,
                verbose,
                allowDelegation,
                tools[]-> {
                    _id,
                    name,
                    displayName,
                    description,
                    credentialTypes,
                    parameters,
                    enabled,
                    category
                }
            },
            tasks[]-> {
                _id,
                name,
                description,
                expectedOutput,
                order,
                agent-> { _id, name, role },
                contextTasks[]-> { _id, name }
            },
            credentials[]-> {
                _id,
                name,
                type,
                storageMethod,
                environment,
                anthropicApiKey,
                openaiApiKey,
                bigqueryCredentialsFile,
                bigqueryTables,
                gscKeyFile,
                gscSiteUrl,
                googleAdsDeveloperToken,
                googleAdsClientId,
                googleAdsClientSecret,
                googleAdsRefreshToken,
                googleAdsCustomerId,
                redditClientId,
                redditClientSecret,
                redditUserAgent
            }
        }
        """
        result = await self.query(groq, {"id": crew_id})
        if not result:
            return None
        return Crew.model_validate(result)

    async def get_crew_by_slug(self, slug: str) -> Crew | None:
        """Fetch a crew by slug."""
        groq = """
        *[_type == "crew" && slug.current == $slug][0] {
            _id,
            name,
            "slug": slug.current,
            description,
            process,
            memoryEnabled,
            verbose,
            agents[]-> {
                _id,
                name,
                role,
                goal,
                backstory,
                llmTier,
                verbose,
                allowDelegation,
                tools[]-> {
                    _id,
                    name,
                    displayName,
                    description,
                    credentialTypes,
                    parameters,
                    enabled,
                    category
                }
            },
            tasks[]-> {
                _id,
                name,
                description,
                expectedOutput,
                order,
                agent-> { _id, name, role },
                contextTasks[]-> { _id, name }
            },
            credentials[]-> {
                _id,
                name,
                type,
                storageMethod,
                environment,
                anthropicApiKey,
                openaiApiKey,
                bigqueryCredentialsFile,
                bigqueryTables,
                gscKeyFile,
                gscSiteUrl,
                googleAdsDeveloperToken,
                googleAdsClientId,
                googleAdsClientSecret,
                googleAdsRefreshToken,
                googleAdsCustomerId,
                redditClientId,
                redditClientSecret,
                redditUserAgent
            }
        }
        """
        result = await self.query(groq, {"slug": slug})
        if not result:
            return None
        return Crew.model_validate(result)

    async def list_crews(self) -> list[dict[str, Any]]:
        """List all crews (summary only)."""
        groq = """
        *[_type == "crew"] | order(name asc) {
            _id,
            name,
            "slug": slug.current,
            description,
            "agentCount": count(agents),
            "taskCount": count(tasks)
        }
        """
        return await self.query(groq) or []

    # ================================================================
    # Agent Operations
    # ================================================================

    async def get_agent(self, agent_id: str) -> Agent | None:
        """Fetch an agent with expanded tools."""
        groq = """
        *[_type == "agent" && _id == $id][0] {
            _id,
            name,
            role,
            goal,
            backstory,
            llmTier,
            verbose,
            allowDelegation,
            tools[]-> {
                _id,
                name,
                displayName,
                description,
                credentialTypes,
                parameters,
                enabled,
                category
            }
        }
        """
        result = await self.query(groq, {"id": agent_id})
        if not result:
            return None
        return Agent.model_validate(result)

    async def list_agents(self) -> list[dict[str, Any]]:
        """List all agents (summary only)."""
        groq = """
        *[_type == "agent"] | order(name asc) {
            _id,
            name,
            role,
            llmTier,
            "toolCount": count(tools)
        }
        """
        return await self.query(groq) or []

    # ================================================================
    # Tool Operations
    # ================================================================

    async def list_tools(self, enabled_only: bool = True) -> list[Tool]:
        """List all tools."""
        filter_clause = ' && enabled == true' if enabled_only else ''
        groq = f"""
        *[_type == "tool"{filter_clause}] | order(name asc) {{
            _id,
            name,
            displayName,
            description,
            credentialTypes,
            parameters,
            enabled,
            category
        }}
        """
        results = await self.query(groq) or []
        return [Tool.model_validate(r) for r in results]

    # ================================================================
    # Run Operations
    # ================================================================

    async def create_run(
        self,
        crew_id: str,
        inputs: dict[str, Any],
        triggered_by: str | None = None,
    ) -> str:
        """Create a new run document.
        
        Returns:
            The created run's document ID
        """
        import uuid
        
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        
        mutations = [{
            "create": {
                "_id": run_id,
                "_type": "run",
                "crew": {"_type": "reference", "_ref": crew_id},
                "status": "pending",
                "inputs": inputs,
                "metadata": {
                    "triggeredBy": triggered_by,
                },
                "taskResults": [],
            }
        }]
        
        await self.mutate(mutations)
        return run_id

    async def update_run_status(
        self,
        run_id: str,
        status: str,
        **kwargs: Any,
    ) -> None:
        """Update a run's status and optional fields."""
        set_fields: dict[str, Any] = {"status": status}
        set_fields.update(kwargs)
        
        mutations = [{
            "patch": {
                "id": run_id,
                "set": set_fields,
            }
        }]
        
        await self.mutate(mutations)

    async def append_task_result(
        self,
        run_id: str,
        task_result: dict[str, Any],
    ) -> None:
        """Append a task result to a run."""
        mutations = [{
            "patch": {
                "id": run_id,
                "insert": {
                    "after": "taskResults[-1]",
                    "items": [task_result],
                },
            }
        }]
        
        await self.mutate(mutations)

    async def get_run(self, run_id: str) -> Run | None:
        """Fetch a run with crew reference."""
        groq = """
        *[_type == "run" && _id == $id][0] {
            _id,
            "crew": crew._ref,
            status,
            startedAt,
            completedAt,
            inputs,
            output,
            taskResults,
            error,
            metadata
        }
        """
        result = await self.query(groq, {"id": run_id})
        if not result:
            return None
        return Run.model_validate(result)

    async def list_runs(
        self,
        limit: int = 50,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        """List runs with optional status filter."""
        filter_clause = f' && status == "{status}"' if status else ''
        groq = f"""
        *[_type == "run"{filter_clause}] | order(_createdAt desc)[0...{limit}] {{
            _id,
            status,
            startedAt,
            completedAt,
            "crewName": crew->name,
            "topic": inputs.topic,
            "taskCount": count(taskResults)
        }}
        """
        return await self.query(groq) or []


# ================================================================
# Stub Client for Development
# ================================================================

class StubSanityClient(SanityClient):
    """Stub client for development without Sanity credentials.
    
    Returns mock data matching the schema structure.
    """

    def __init__(self):
        # Don't call super().__init__() to avoid settings validation
        pass

    @property
    def configured(self) -> bool:
        return True  # Stub is always "configured"

    async def query(self, groq: str, params: dict[str, Any] | None = None) -> Any:
        # Return empty results for queries
        return []

    async def mutate(self, mutations: list[dict[str, Any]]) -> dict[str, Any]:
        return {"transactionId": "stub-transaction", "results": []}

    async def list_crews(self) -> list[dict[str, Any]]:
        """Return mock crew list."""
        return [
            {
                "_id": "crew-content-gap",
                "name": "Content Gap Discovery Crew",
                "slug": "content-gap-discovery",
                "description": "Analyzes content gaps for SEO and AEO opportunities",
                "agentCount": 5,
                "taskCount": 5,
            }
        ]

    async def list_agents(self) -> list[dict[str, Any]]:
        """Return mock agent list."""
        return [
            {"_id": "agent-1", "name": "data_analyst", "role": "Data Analyst", "llmTier": "default", "toolCount": 11},
            {"_id": "agent-2", "name": "product_marketer", "role": "Product Marketing Manager", "llmTier": "default", "toolCount": 8},
            {"_id": "agent-3", "name": "seo_specialist", "role": "SEO & AEO Content Specialist", "llmTier": "default", "toolCount": 11},
            {"_id": "agent-4", "name": "work_reviewer", "role": "Content Gap Validator", "llmTier": "smart", "toolCount": 5},
            {"_id": "agent-5", "name": "narrative_governor", "role": "Narrative Governor", "llmTier": "smart", "toolCount": 0},
        ]

    async def list_runs(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        """Return empty run list."""
        return []

    async def close(self) -> None:
        pass


def get_sanity_client() -> SanityClient:
    """Get the appropriate Sanity client based on configuration."""
    settings = get_settings()
    if settings.sanity_configured:
        return SanityClient(settings)
    else:
        # Use stub client for development
        return StubSanityClient()
