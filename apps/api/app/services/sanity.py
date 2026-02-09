"""Sanity CMS client for fetching crew configurations."""

from typing import Any

import httpx

from app.config import get_settings
from app.logging_config import get_logger, log_groq_query
from app.models import Agent, Crew, InputField, Run, RunInputs, Tool

logger = get_logger(__name__)

LLM_MODELS = {
    "gpt-5.3-codex",
    "gpt-5.2",
    "gpt-5.2-mini",
    "gpt-5.2-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o1-mini",
    "claude-opus-4.6",
    "claude-opus-4.5",
    "claude-sonnet-4",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
}


class SanityClient:
    """Real Sanity client for production use."""

    def __init__(self, project_id: str, dataset: str, api_token: str):
        self.project_id = project_id
        self.dataset = dataset
        self.api_token = api_token
        self.base_url = f"https://{project_id}.api.sanity.io/v2021-10-21/data/query/{dataset}"
        self._client: httpx.AsyncClient | None = None

    @property
    def configured(self) -> bool:
        return bool(self.project_id and self.api_token)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=30.0
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _query(self, groq: str, params: dict[str, Any] | None = None) -> Any:
        """Execute a GROQ query against Sanity."""
        import json as json_module
        log_groq_query(logger, groq, params)
        
        client = await self._get_client()
        query_params = {"query": groq}
        if params:
            for key, value in params.items():
                # Sanity expects JSON-encoded parameter values
                query_params[f"${key}"] = json_module.dumps(value)

        response = await client.get(self.base_url, params=query_params)
        response.raise_for_status()
        result = response.json()
        return result.get("result")

    async def list_crews(self) -> list[dict[str, Any]]:
        query = """*[_type == "crew"] {
            _id,
            name,
            slug,
            description,
            "agentCount": count(agents),
            "taskCount": count(tasks)
        }"""
        return await self._query(query) or []

    async def list_agents(self) -> list[dict[str, Any]]:
        query = """*[_type == "agent"] {
            _id,
            name,
            role,
            llmModel,
            "toolCount": count(tools)
        }"""
        return await self._query(query) or []

    async def list_agents_full(self) -> list[dict[str, Any]]:
        query = """*[_type == "agent"] {
            _id,
            name,
            role,
            goal,
            backstory,
            llmModel,
            tools[]->{
                _id,
                name,
                description,
                credentialTypes
            }
        }"""
        return await self._query(query) or []

    async def get_agent(self, agent_id: str) -> Agent | None:
        query = """*[_type == "agent" && _id == $id][0] {
            _id,
            name,
            role,
            goal,
            backstory,
            llmModel,
            tools[]->
        }"""
        result = await self._query(query, {"id": agent_id})
        if result:
            return Agent(**result)
        return None

    async def get_crew(self, crew_id: str) -> Crew | None:
        query = """*[_type == "crew" && _id == $id][0] {
            _id,
            name,
            displayName,
            slug,
            description,
            inputSchema,
            agents[]->{
                _id,
                name,
                role,
                goal,
                backstory,
                llmModel,
                tools[]->
            },
            tasks[]->{
                _id,
                name,
                description,
                expectedOutput,
                agent->
            }
        }"""
        result = await self._query(query, {"id": crew_id})
        if result:
            return Crew(**result)
        return None

    async def get_crew_full(self, crew_id: str) -> dict[str, Any] | None:
        """Get full crew config with all expanded references for CrewRunner."""
        query = """*[_type == "crew" && _id == $id][0] {
            _id,
            name,
            slug,
            description,
            agents[]->{
                _id,
                name,
                role,
                goal,
                backstory,
                llmModel,
                tools[]->{
                    _id,
                    name,
                    functionName,
                    credentialTypes
                }
            },
            tasks[]->{
                _id,
                name,
                description,
                expectedOutput,
                agent->{_id, name}
            },
            credentials[]->{
                _id,
                name,
                type,
                storageMethod,
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
                googleAdsLoginCustomerId,
                redditClientId,
                redditClientSecret,
                redditUserAgent
            }
        }"""
        return await self._query(query, {"id": crew_id})

    async def list_runs(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        if status:
            query = """*[_type == "run" && status == $status] | order(_createdAt desc) [0...$limit] {
                _id,
                status,
                crew->{_id, name, slug},
                inputs,
                _createdAt
            }"""
            return await self._query(query, {"status": status, "limit": limit}) or []
        else:
            query = """*[_type == "run"] | order(_createdAt desc) [0...$limit] {
                _id,
                status,
                crew->{_id, name, slug},
                inputs,
                _createdAt
            }"""
            return await self._query(query, {"limit": limit}) or []

    async def get_run(self, run_id: str) -> Run | None:
        query = """*[_type == "run" && _id == $id][0] {
            _id,
            status,
            crew->{_id, name, slug},
            inputs,
            output,
            plannedCrew,
            taskResults,
            startedAt,
            completedAt,
            error
        }"""
        result = await self._query(query, {"id": run_id})
        if result:
            return Run(**result)
        return None

    async def get_planner(self) -> dict[str, Any] | None:
        query = """*[_type == "crewPlanner" && enabled == true][0] {
            _id,
            name,
            model,
            systemPrompt,
            maxAgents,
            process,
            usePlannerByDefault
        }"""
        return await self._query(query)

    async def get_memory_policy(self) -> dict[str, Any] | None:
        query = """*[_type == "memoryPolicy" && enabled == true][0] {
            _id,
            name,
            agent->{
                _id,
                name,
                role,
                backstory
            }
        }"""
        return await self._query(query)

    async def search_skills(
        self,
        query: str | None = None,
        tags: list[str] | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        filters = ['_type == "skill"', "enabled == true"]
        if query:
            filters.append(
                'name match $q || description match $q || $q in tags'
            )
        if tags:
            filters.append('count(tags[@ in $tags]) > 0')

        groq = f"""*[{ ' && '.join(filters) }] | order(_updatedAt desc) [0...$limit] {{
            _id,
            name,
            description,
            steps,
            tags,
            toolsRequired,
            inputSchema,
            outputSchema
        }}"""

        params = {"limit": limit}
        if query:
            params["q"] = f"*{query}*"
        if tags:
            params["tags"] = tags

        return await self._query(groq, params) or []

    async def list_mcp_servers(self) -> list[dict[str, Any]]:
        query = """*[_type == "mcpServer" && enabled == true] {
            _id,
            name,
            displayName,
            description,
            transport,
            tools
        }"""
        return await self._query(query) or []

    async def create_run(self, crew_id: str, inputs: dict[str, Any], triggered_by: str | None = None) -> str:
        """Create a new run document in Sanity."""
        # For now, generate a local ID - real implementation would use mutations API
        import uuid
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        logger.info(f"Created run {run_id} for crew {crew_id}")
        return run_id

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        """Update run status in Sanity."""
        logger.info(f"Updating run {run_id} status to {status}")
        # Real implementation would use mutations API


class StubSanityClient:
    """Stub client for development without Sanity credentials."""

    @property
    def configured(self) -> bool:
        return True

    async def close(self) -> None:
        pass

    async def list_crews(self) -> list[dict[str, Any]]:
        return [{
            "_id": "crew-content-gap",
            "name": "Content Gap Discovery Crew",
            "slug": "content-gap-discovery",
            "description": "Analyzes content gaps for SEO and AEO",
            "agentCount": 5,
            "taskCount": 5,
        }]

    async def list_agents(self) -> list[dict[str, Any]]:
        return [
            {"_id": "agent-1", "name": "data_analyst", "role": "Data Analyst", "llmModel": "gpt-5.2", "toolCount": 11},
            {"_id": "agent-2", "name": "product_marketer", "role": "Product Marketing Manager", "llmModel": "gpt-5.2", "toolCount": 8},
            {"_id": "agent-3", "name": "seo_specialist", "role": "SEO & AEO Specialist", "llmModel": "gpt-5.2", "toolCount": 11},
            {"_id": "agent-4", "name": "work_reviewer", "role": "Content Gap Validator", "llmModel": "gpt-5.2", "toolCount": 5},
            {"_id": "agent-5", "name": "narrative_governor", "role": "Narrative Governor", "llmModel": "gpt-5.2", "toolCount": 0},
        ]

    async def list_agents_full(self) -> list[dict[str, Any]]:
        return [
            {
                "_id": "agent-1",
                "name": "data_analyst",
                "role": "Data Analyst",
                "goal": "Analyze content gaps",
                "backstory": "Expert analyst",
                "llmModel": "gpt-5.2",
                "tools": [],
            },
            {
                "_id": "agent-2",
                "name": "product_marketer",
                "role": "Product Marketing Manager",
                "goal": "Analyze content gaps",
                "backstory": "Expert marketer",
                "llmModel": "gpt-5.2",
                "tools": [],
            },
        ]

    async def get_agent(self, agent_id: str) -> Agent | None:
        agents = await self.list_agents()
        for a in agents:
            if a["_id"] == agent_id:
                return Agent(
                    _id=a["_id"],
                    name=a["name"],
                    role=a["role"],
                    goal="Analyze content gaps",
                    backstory="Expert analyst",
                )
        return None

    async def get_crew(self, crew_id: str) -> Crew | None:
        return Crew(
            _id=crew_id,
            name="Content Gap Discovery Crew",
            displayName="Content Gap Analysis",
            slug="content-gap-discovery",
            description="Analyzes content gaps",
            inputSchema=[
                InputField(
                    name="topic",
                    label="Analysis Topic",
                    type="string",
                    required=True,
                    placeholder="e.g., headless CMS for enterprise",
                    helpText="The topic or niche to analyze",
                ),
                InputField(
                    name="competitors",
                    label="Competitor URLs",
                    type="array",
                    required=False,
                    placeholder="https://example.com",
                    helpText="URLs of competitor sites to analyze",
                ),
                InputField(
                    name="focusAreas",
                    label="Focus Areas",
                    type="array",
                    required=False,
                    placeholder="e.g., enterprise, developer experience",
                    helpText="Specific areas to focus the analysis on",
                ),
            ],
        )

    async def list_runs(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        return []

    async def get_run(self, run_id: str) -> Run | None:
        return Run(
            _id=run_id,
            crew="crew-content-gap",
            status="pending",
            inputs=RunInputs(topic="AI content management"),
        )

    async def get_planner(self) -> dict[str, Any] | None:
        return {
            "_id": "crew-planner-default",
            "name": "Default Crew Planner",
            "model": "gpt-5.2",
            "systemPrompt": "Return a JSON plan with agents, tasks, process, and inputSchema.",
            "maxAgents": 6,
            "process": "sequential",
            "usePlannerByDefault": True,
        }

    async def get_memory_policy(self) -> dict[str, Any] | None:
        return {
            "_id": "memory-policy-default",
            "name": "Default Memory Policy",
            "agent": {
                "_id": "agent-narrative-governor",
                "name": "Narrative Governor",
                "role": "Content Strategy Director",
                "backstory": (
                    "Summarize prior outputs and remove non-salient details. "
                    "Preserve key decisions, assumptions, and open questions."
                ),
            },
        }

    async def search_skills(
        self,
        query: str | None = None,
        tags: list[str] | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        return [
            {
                "_id": "skill-eeat-audit",
                "name": "EEAT Audit",
                "description": "Assess content quality using EEAT.",
                "steps": [
                    "Identify author and credentials",
                    "Check first-hand experience signals",
                    "Verify sources and citations",
                    "Score trustworthiness",
                    "Summarize findings and recommendations",
                ],
                "tags": ["seo", "eeat", "content-quality", "trust"],
                "toolsRequired": ["fetch_webpage_content", "sanity_sitemap_lookup"],
                "inputSchema": [
                    {"name": "url", "label": "URL", "type": "string", "required": True},
                ],
                "outputSchema": "EEAT score and recommendations",
            }
        ]

    async def list_mcp_servers(self) -> list[dict[str, Any]]:
        return [
            {
                "_id": "mcp-demo",
                "name": "demo_mcp",
                "displayName": "Demo MCP",
                "description": "Example MCP server",
                "transport": "http",
                "tools": ["demo_tool"],
            }
        ]

    async def create_run(self, crew_id: str, inputs: dict[str, Any], triggered_by: str | None = None) -> str:
        import uuid
        return f"run-{uuid.uuid4().hex[:12]}"

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        pass


def get_sanity_client() -> SanityClient | StubSanityClient:
    """Get the Sanity client.
    
    Returns real client if Sanity credentials are configured,
    otherwise returns stub client for development.
    """
    settings = get_settings()
    
    if settings.sanity_project_id and settings.sanity_api_token:
        logger.info("Using real Sanity client")
        return SanityClient(
            project_id=settings.sanity_project_id,
            dataset=settings.sanity_dataset,
            api_token=settings.sanity_api_token
        )
    else:
        logger.info("Using stub Sanity client (no credentials configured)")
        return StubSanityClient()
