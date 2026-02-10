"""Sanity CMS client for fetching crew configurations."""

from datetime import datetime, timezone
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
        fields = """{
            _id,
            status,
            objective,
            questions,
            clarification,
            crew->{_id, name, slug},
            inputs,
            output,
            startedAt,
            completedAt,
            _createdAt
        }"""
        if status:
            query = f'*[_type == "run" && status == $status] | order(_createdAt desc) [0...$limit] {fields}'
            return await self._query(query, {"status": status, "limit": limit}) or []
        else:
            query = f'*[_type == "run"] | order(_createdAt desc) [0...$limit] {fields}'
            return await self._query(query, {"limit": limit}) or []

    async def get_run(self, run_id: str) -> Run | None:
        query = """*[_type == "run" && _id == $id][0] {
            _id,
            status,
            objective,
            questions,
            clarification,
            crew->{_id, name, slug},
            inputs,
            output,
            plannedCrew,
            taskResults,
            startedAt,
            completedAt,
            error,
            metadata
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

    async def _mutate(self, mutations: list[dict[str, Any]]) -> Any:
        """Execute mutations against the Sanity mutations API."""
        client = await self._get_client()
        url = f"https://{self.project_id}.api.sanity.io/v2021-10-21/data/mutate/{self.dataset}"
        body = {"mutations": mutations}
        response = await client.post(url, json=body)
        if not response.is_success:
            # Log the actual Sanity error body for debugging
            try:
                err_body = response.json()
            except Exception:
                err_body = response.text
            logger.error(f"Sanity mutation failed ({response.status_code}): {err_body}")
            response.raise_for_status()
        return response.json()

    async def create_run(
        self,
        crew_id: str | None = None,
        inputs: dict[str, Any] | None = None,
        triggered_by: str | None = None,
        objective: str | None = None,
        questions: list[str] | None = None,
        status: str = "pending",
        planned_crew: dict | None = None,
    ) -> str:
        """Create a new run document in Sanity.

        Uses ``createOrReplace`` so that re-creating an ID that already
        exists (e.g. after a retry) will not fail with 409 Conflict.
        """
        import uuid

        run_id = f"run-{uuid.uuid4().hex[:12]}"
        inputs = inputs or {}

        # Build the inputs sub-object to match the Sanity schema
        custom_inputs = [
            {"_key": k, "key": k, "value": str(v)}
            for k, v in inputs.items()
            if k not in ("topic", "objective", "focusAreas")
        ]

        doc: dict[str, Any] = {
            "_id": run_id,
            "_type": "run",
            "status": status,
            "inputs": {
                "topic": inputs.get("topic") or inputs.get("objective") or "",
            },
        }

        # Only include customInputs if there are any (avoids empty array issues)
        if custom_inputs:
            doc["inputs"]["customInputs"] = custom_inputs

        # Only include focusAreas if present
        focus_areas = inputs.get("focusAreas")
        if focus_areas and isinstance(focus_areas, list):
            doc["inputs"]["focusAreas"] = focus_areas

        if objective:
            doc["objective"] = objective
        if questions:
            doc["questions"] = questions

        # Only set crew reference if it points to a real Sanity document
        # (skip synthetic IDs like "crew-planned" that don't exist in Sanity)
        if crew_id and not crew_id.startswith("crew-planned"):
            doc["crew"] = {"_type": "reference", "_ref": crew_id}

        if triggered_by:
            doc["metadata"] = {"triggeredBy": triggered_by}

        if planned_crew:
            doc["plannedCrew"] = planned_crew

        try:
            await self._mutate([{"createOrReplace": doc}])
            logger.info(f"Created run {run_id} in Sanity (crew={crew_id})")
        except Exception as e:
            logger.warning(f"Failed to persist run {run_id} to Sanity: {e}")
            # Still return the ID so the in-memory flow works

        return run_id

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        """Update run status (and optional fields) in Sanity.

        Uses ``createIfNotExists`` followed by a ``patch`` so that the
        update succeeds even if the initial ``create_run`` call failed
        (e.g. network blip).  This avoids 404 errors on the patch.
        """
        patch: dict[str, Any] = {"status": status}

        for key in ("startedAt", "completedAt", "output", "error",
                     "clarification", "objective"):
            if key in kwargs:
                patch[key] = kwargs[key]

        # Ensure the document exists before patching.  If the create was
        # lost we create a minimal skeleton so the patch can land.
        skeleton: dict[str, Any] = {
            "_id": run_id,
            "_type": "run",
            "status": status,
        }

        try:
            await self._mutate([
                {"createIfNotExists": skeleton},
                {"patch": {"id": run_id, "set": patch}},
            ])
            logger.info(f"Updated run {run_id} status to {status}")
        except Exception as e:
            logger.warning(f"Failed to update run {run_id} in Sanity: {e}")


class StubSanityClient:
    """Stub client for development without Sanity credentials."""

    def __init__(self) -> None:
        self._runs: dict[str, dict[str, Any]] = {}

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
            {"_id": "agent-data-analyst", "name": "Data Analyst", "role": "Senior Data Analyst", "llmModel": "gpt-5.2", "toolCount": 2},
            {"_id": "agent-product-marketer", "name": "Product Marketer", "role": "Senior Product Marketing Manager", "llmModel": "gpt-5.2", "toolCount": 3},
            {"_id": "agent-seo-specialist", "name": "SEO Specialist", "role": "Technical SEO Specialist", "llmModel": "gpt-5.2", "toolCount": 3},
            {"_id": "agent-work-reviewer", "name": "Work Reviewer", "role": "Quality Assurance Reviewer", "llmModel": "gpt-5.2", "toolCount": 1},
            {"_id": "agent-narrative-governor", "name": "Narrative Governor", "role": "Content Strategy Director", "llmModel": "gpt-5.2", "toolCount": 0},
        ]

    async def list_agents_full(self) -> list[dict[str, Any]]:
        return [
            {
                "_id": "agent-data-analyst",
                "name": "Data Analyst",
                "role": "Senior Data Analyst",
                "goal": "Analyze data, find patterns, and produce quantitative insights",
                "backstory": (
                    "Expert in data analysis with deep knowledge of SEO metrics, LLM traffic patterns, "
                    "statistical modelling, and quantitative research. Skilled at finding insights in large datasets. "
                    "Also serves as a general-purpose analyst for any data-heavy or technical task."
                ),
                "llmModel": "gpt-5.2",
                "tools": [],
            },
            {
                "_id": "agent-product-marketer",
                "name": "Product Marketer",
                "role": "Senior Product Marketing Manager",
                "goal": "Identify content gaps and competitive positioning opportunities",
                "backstory": (
                    "Experienced product marketer who understands how to position technical products. "
                    "Expert at competitive analysis, messaging, and go-to-market strategy. "
                    "Best suited for content strategy, positioning, and competitive intelligence tasks."
                ),
                "llmModel": "gpt-5.2",
                "tools": [],
            },
            {
                "_id": "agent-seo-specialist",
                "name": "SEO Specialist",
                "role": "Technical SEO Specialist",
                "goal": "Optimize content strategy for search visibility and AEO",
                "backstory": (
                    "SEO expert focused on technical optimization and emerging AI search patterns. "
                    "Understands both traditional SEO and LLM optimization (AEO). "
                    "Best suited for keyword research, search strategy, and content optimization tasks."
                ),
                "llmModel": "gpt-5.2",
                "tools": [],
            },
            {
                "_id": "agent-work-reviewer",
                "name": "Work Reviewer",
                "role": "Quality Assurance Reviewer",
                "goal": "Review and validate analysis quality, ensure actionable recommendations",
                "backstory": (
                    "Meticulous reviewer who ensures all analysis is accurate, well-supported, and actionable. "
                    "Catches gaps and inconsistencies. Best suited as a final review step."
                ),
                "llmModel": "gpt-5.2",
                "tools": [],
            },
            {
                "_id": "agent-narrative-governor",
                "name": "Narrative Governor",
                "role": "Content Strategy Director",
                "goal": "Synthesize findings into coherent content strategy with prioritized recommendations",
                "backstory": (
                    "Senior content strategist who excels at turning data into narrative. "
                    "Creates compelling, actionable content roadmaps. "
                    "Best suited for content strategy synthesis tasks."
                ),
                "llmModel": "gpt-5.2",
                "tools": [],
            },
        ]

    async def get_agent(self, agent_id: str) -> Agent | None:
        agents = await self.list_agents_full()
        for a in agents:
            if a["_id"] == agent_id:
                return Agent(**a)
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
        runs = sorted(
            self._runs.values(),
            key=lambda r: r.get("_createdAt", ""),
            reverse=True,
        )
        if status:
            runs = [r for r in runs if r.get("status") == status]
        return runs[:limit]

    async def get_run(self, run_id: str) -> Run | None:
        doc = self._runs.get(run_id)
        if not doc:
            return None
        return Run(**doc)

    async def get_planner(self) -> dict[str, Any] | None:
        return {
            "_id": "crew-planner-default",
            "name": "Default Crew Planner",
            "model": "gpt-5.2",
            "systemPrompt": (
                "You are a crew planner.\n"
                "You receive: objective, inputs, and a list of agents (each has an _id, role, backstory, and tools).\n\n"
                "AGENT SELECTION RULES:\n"
                "- Pick ONLY agents whose role and backstory directly match the objective. "
                "Fewer, better-matched agents beat more agents.\n"
                "- Match by role, backstory, and tools — NOT by superficial keyword overlap "
                '(e.g. "Product Marketing Manager" is NOT a data scientist even though both relate to "marketing").\n'
                "- If no agent is a strong match for a task, assign the Data Analyst as a general-purpose analyst.\n"
                "- The Narrative Governor should only be included when the objective specifically involves "
                "content strategy or narrative synthesis.\n"
                "- Do NOT include agents just because they exist. Only include agents that will meaningfully "
                "contribute to the objective.\n\n"
                "Return a JSON object with:\n"
                '- agents: array of exact _id values from the agents list (e.g. "agent-data-analyst"). '
                "Use only _id values that appear in the input.\n"
                "- tasks: array of {name, description, expectedOutput, agentId, order}. "
                "agentId MUST be an exact _id from the agents list.\n"
                '- process: "sequential" or "hierarchical"\n'
                "- inputSchema: array of {name,label,type,required,placeholder,helpText,defaultValue,options}\n"
                "- questions: array of clarifying questions to ask the user before running (strings)\n\n"
                "IMPORTANT: Every agentId in tasks must exactly match one of the _id strings in the agents "
                "array you selected. Do not invent IDs. expectedOutput is required for every task. "
                "inputSchema must be an array."
            ),
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

    async def create_run(
        self,
        crew_id: str | None = None,
        inputs: dict[str, Any] | None = None,
        triggered_by: str | None = None,
        objective: str | None = None,
        questions: list[str] | None = None,
        status: str = "pending",
        planned_crew: dict | None = None,
    ) -> str:
        import uuid

        run_id = f"run-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        inputs = inputs or {}
        doc: dict[str, Any] = {
            "_id": run_id,
            "_type": "run",
            "_createdAt": now,
            "status": status,
            "inputs": {
                "topic": inputs.get("topic") or inputs.get("objective") or "",
                "customInputs": [
                    {"key": k, "value": str(v)}
                    for k, v in inputs.items()
                    if k not in ("topic", "objective", "focusAreas")
                ],
            },
        }
        if objective:
            doc["objective"] = objective
        if questions:
            doc["questions"] = questions
        if crew_id:
            doc["crew"] = {"_id": crew_id, "name": crew_id}
        if triggered_by:
            doc["metadata"] = {"triggeredBy": triggered_by}
        if planned_crew:
            doc["plannedCrew"] = planned_crew

        self._runs[run_id] = doc
        logger.info(f"Stub: created run {run_id}")
        return run_id

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        doc = self._runs.get(run_id)
        if not doc:
            logger.warning(f"Stub: run {run_id} not found for update")
            return
        doc["status"] = status
        for key in ("startedAt", "completedAt", "output", "error", "clarification", "objective"):
            if key in kwargs:
                doc[key] = kwargs[key]
        logger.info(f"Stub: updated run {run_id} status to {status}")


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
