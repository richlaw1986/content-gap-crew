"""Sanity CMS client for fetching crew configurations."""

import uuid
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
                query_params[f"${key}"] = json_module.dumps(value)

        response = await client.get(self.base_url, params=query_params)
        response.raise_for_status()
        result = response.json()
        return result.get("result")

    async def _mutate(self, mutations: list[dict[str, Any]]) -> Any:
        """Execute mutations against the Sanity mutations API."""
        client = await self._get_client()
        url = f"https://{self.project_id}.api.sanity.io/v2021-10-21/data/mutate/{self.dataset}"
        body = {"mutations": mutations}
        response = await client.post(url, json=body)
        if not response.is_success:
            try:
                err_body = response.json()
            except Exception:
                err_body = response.text
            logger.error(f"Sanity mutation failed ({response.status_code}): {err_body}")
            response.raise_for_status()
        return response.json()

    # ── Crew / Agent queries ──────────────────────────────

    async def list_crews(self) -> list[dict[str, Any]]:
        query = """*[_type == "crew"] {
            _id,
            name,
            slug,
            description,
            "agentCount": count(agents)
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
            _id, name, role, goal, backstory, llmModel, tools[]->
        }"""
        result = await self._query(query, {"id": agent_id})
        return Agent(**result) if result else None

    async def get_crew(self, crew_id: str) -> Crew | None:
        query = """*[_type == "crew" && _id == $id][0] {
            _id, name, displayName, slug, description, inputSchema,
            agents[]->{ _id, name, role, goal, backstory, llmModel, tools[]-> }
        }"""
        result = await self._query(query, {"id": crew_id})
        return Crew(**result) if result else None

    async def get_planner(self) -> dict[str, Any] | None:
        query = """*[_type == "crewPlanner" && enabled == true][0] {
            _id, name, model, systemPrompt, maxAgents, process, usePlannerByDefault
        }"""
        return await self._query(query)

    async def get_memory_policy(self) -> dict[str, Any] | None:
        query = """*[_type == "memoryPolicy" && enabled == true][0] {
            _id, name,
            agent->{ _id, name, role, backstory, llmModel }
        }"""
        return await self._query(query)

    async def search_skills(self, query: str | None = None, tags: list[str] | None = None, limit: int = 10) -> list[dict[str, Any]]:
        filters = ['_type == "skill"', "enabled == true"]
        if query:
            filters.append('name match $q || description match $q || $q in tags')
        if tags:
            filters.append('count(tags[@ in $tags]) > 0')
        groq = f"""*[{' && '.join(filters)}] | order(_updatedAt desc) [0...$limit] {{
            _id, name, description, steps, tags, toolsRequired, inputSchema, outputSchema
        }}"""
        params: dict[str, Any] = {"limit": limit}
        if query:
            params["q"] = f"*{query}*"
        if tags:
            params["tags"] = tags
        return await self._query(groq, params) or []

    async def get_all_credentials(self) -> list[dict[str, Any]]:
        """Fetch all credential documents (with all fields, for tool injection)."""
        query = """*[_type == "credential"] {
            _id, name, type, storageMethod, environment,
            anthropicApiKey,
            openaiApiKey,
            bigqueryCredentialsFile, bigqueryTables,
            gscKeyFile, gscSiteUrl,
            googleAdsDeveloperToken, googleAdsClientId, googleAdsClientSecret,
            googleAdsRefreshToken, googleAdsCustomerId,
            redditClientId, redditClientSecret, redditUserAgent
        }"""
        return await self._query(query) or []

    async def list_mcp_servers(self) -> list[dict[str, Any]]:
        query = """*[_type == "mcpServer" && enabled == true] {
            _id, name, displayName, description, transport,
            command, args, url,
            env[]{ key, value, "fromCredential": fromCredential->{ _id, type, storageMethod, openaiApiKey, anthropicApiKey } },
            tools, timeout
        }"""
        return await self._query(query) or []

    # ── Run CRUD ──────────────────────────────────────────

    async def create_run(
        self,
        crew_id: str | None = None,
        inputs: dict[str, Any] | None = None,
        triggered_by: str | None = None,
        objective: str | None = None,
        questions: list[str] | None = None,
        status: str = "pending",
        planned_crew: dict | None = None,
        conversation_id: str | None = None,
    ) -> str:
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        inputs = inputs or {}

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

        if custom_inputs:
            doc["inputs"]["customInputs"] = custom_inputs
        focus_areas = inputs.get("focusAreas")
        if focus_areas and isinstance(focus_areas, list):
            doc["inputs"]["focusAreas"] = focus_areas
        if objective:
            doc["objective"] = objective
        if questions:
            doc["questions"] = questions
        if crew_id and not crew_id.startswith("crew-planned"):
            doc["crew"] = {"_type": "reference", "_ref": crew_id}
        if conversation_id:
            doc["conversation"] = {"_type": "reference", "_ref": conversation_id}
        if triggered_by:
            doc["metadata"] = {"triggeredBy": triggered_by}
        if planned_crew:
            doc["plannedCrew"] = planned_crew

        try:
            await self._mutate([{"createOrReplace": doc}])
            logger.info(f"Created run {run_id} in Sanity")
        except Exception as e:
            logger.warning(f"Failed to persist run {run_id} to Sanity: {e}")

        return run_id

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        patch: dict[str, Any] = {"status": status}
        for key in ("startedAt", "completedAt", "output", "error", "clarification", "objective"):
            if key in kwargs:
                patch[key] = kwargs[key]

        skeleton: dict[str, Any] = {"_id": run_id, "_type": "run", "status": status}
        try:
            await self._mutate([
                {"createIfNotExists": skeleton},
                {"patch": {"id": run_id, "set": patch}},
            ])
            logger.info(f"Updated run {run_id} status to {status}")
        except Exception as e:
            logger.warning(f"Failed to update run {run_id} in Sanity: {e}")

    async def list_runs(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        fields = """{ _id, status, objective, crew->{_id, name, slug}, inputs, output, startedAt, completedAt, _createdAt }"""
        if status:
            query = f'*[_type == "run" && status == $status] | order(_createdAt desc) [0...$limit] {fields}'
            return await self._query(query, {"status": status, "limit": limit}) or []
        else:
            query = f'*[_type == "run"] | order(_createdAt desc) [0...$limit] {fields}'
            return await self._query(query, {"limit": limit}) or []

    async def get_run(self, run_id: str) -> Run | None:
        query = """*[_type == "run" && _id == $id][0] {
            _id, status, objective, crew->{_id, name, slug}, inputs, output,
            plannedCrew, startedAt, completedAt, error, metadata
        }"""
        result = await self._query(query, {"id": run_id})
        return Run(**result) if result else None

    # ── Conversation CRUD ─────────────────────────────────

    async def create_conversation(self, title: str = "New Conversation") -> str:
        conv_id = f"conv-{uuid.uuid4().hex[:12]}"
        doc = {
            "_id": conv_id,
            "_type": "conversation",
            "title": title,
            "status": "active",
            "messages": [],
            "runs": [],
        }
        try:
            await self._mutate([{"createOrReplace": doc}])
            logger.info(f"Created conversation {conv_id}")
        except Exception as e:
            logger.warning(f"Failed to create conversation {conv_id}: {e}")
        return conv_id

    async def get_conversation(self, conv_id: str) -> dict[str, Any] | None:
        query = """*[_type == "conversation" && _id == $id][0] {
            _id, title, status, messages, runs, activeRunId, metadata, lastRunSummary, _createdAt
        }"""
        return await self._query(query, {"id": conv_id})

    async def list_conversations(self, limit: int = 50) -> list[dict[str, Any]]:
        query = f"""*[_type == "conversation"] | order(_createdAt desc) [0...$limit] {{
            _id, title, status, activeRunId, _createdAt,
            "messageCount": count(messages),
            "runCount": count(runs),
            "lastMessage": messages[-1].content
        }}"""
        return await self._query(query, {"limit": limit}) or []

    async def append_message(self, conv_id: str, message: dict[str, Any]) -> None:
        """Append a message to the conversation's messages array.

        Uses two mutations in one batch:
        1. setIfMissing to ensure the `messages` array exists
        2. insert after the last element
        """
        if "_key" not in message:
            message["_key"] = uuid.uuid4().hex[:12]
        try:
            await self._mutate([
                {
                    "patch": {
                        "id": conv_id,
                        "setIfMissing": {"messages": []},
                    },
                },
                {
                    "patch": {
                        "id": conv_id,
                        "insert": {"after": "messages[-1]", "items": [message]},
                    },
                },
            ])
        except Exception as e:
            logger.warning(f"Failed to append message to {conv_id}: {e}")

    async def update_conversation_status(self, conv_id: str, status: str) -> None:
        try:
            await self._mutate([{"patch": {"id": conv_id, "set": {"status": status}}}])
        except Exception as e:
            logger.warning(f"Failed to update conversation {conv_id} status: {e}")

    async def update_conversation_title(self, conv_id: str, title: str) -> None:
        try:
            await self._mutate([{"patch": {"id": conv_id, "set": {"title": title}}}])
        except Exception as e:
            logger.warning(f"Failed to update conversation {conv_id} title: {e}")

    async def update_conversation_summary(self, conv_id: str, summary: str) -> None:
        """Persist a Narrative Governor run summary for cross-run continuity."""
        try:
            await self._mutate([{"patch": {"id": conv_id, "set": {"lastRunSummary": summary}}}])
        except Exception as e:
            logger.warning(f"Failed to update conversation {conv_id} summary: {e}")

    async def add_run_to_conversation(self, conv_id: str, run_id: str) -> None:
        try:
            await self._mutate([
                {
                    "patch": {
                        "id": conv_id,
                        "set": {"activeRunId": run_id},
                        "setIfMissing": {"runs": []},
                    },
                },
                {
                    "patch": {
                        "id": conv_id,
                        "insert": {
                            "after": "runs[-1]",
                            "items": [{"_type": "reference", "_ref": run_id, "_key": uuid.uuid4().hex[:12]}],
                        },
                    },
                },
            ])
        except Exception as e:
            logger.warning(f"Failed to add run {run_id} to conversation {conv_id}: {e}")


class StubSanityClient:
    """Stub client for development without Sanity credentials."""

    def __init__(self) -> None:
        self._runs: dict[str, dict[str, Any]] = {}
        self._conversations: dict[str, dict[str, Any]] = {}

    @property
    def configured(self) -> bool:
        return True

    async def close(self) -> None:
        pass

    # ── Crew / Agent stubs ────────────────────────────────

    async def list_crews(self) -> list[dict[str, Any]]:
        return [{"_id": "crew-content-gap", "name": "Content Gap Discovery Crew", "slug": "content-gap-discovery", "description": "Analyzes content gaps", "agentCount": 5}]

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
            {"_id": "agent-data-analyst", "name": "Data Analyst", "role": "Senior Data Analyst", "goal": "Analyze data, find patterns, and produce quantitative insights", "backstory": "Expert in data analysis with deep knowledge of SEO metrics, LLM traffic patterns, statistical modelling, and quantitative research. Also serves as a general-purpose analyst for any data-heavy or technical task.", "llmModel": "gpt-5.2", "tools": []},
            {"_id": "agent-product-marketer", "name": "Product Marketer", "role": "Senior Product Marketing Manager", "goal": "Identify content gaps and competitive positioning opportunities", "backstory": "Experienced product marketer who understands how to position technical products. Expert at competitive analysis, messaging, and go-to-market strategy.", "llmModel": "gpt-5.2", "tools": []},
            {"_id": "agent-seo-specialist", "name": "SEO Specialist", "role": "Technical SEO Specialist", "goal": "Optimize content strategy for search visibility and AEO", "backstory": "SEO expert focused on technical optimization and emerging AI search patterns. Understands both traditional SEO and LLM optimization (AEO).", "llmModel": "gpt-5.2", "tools": []},
            {"_id": "agent-work-reviewer", "name": "Work Reviewer", "role": "Quality Assurance Reviewer", "goal": "Review and validate analysis quality, ensure actionable recommendations", "backstory": "Meticulous reviewer who ensures all analysis is accurate, well-supported, and actionable.", "llmModel": "gpt-5.2", "tools": []},
            {"_id": "agent-narrative-governor", "name": "Narrative Governor", "role": "Content Strategy Director", "goal": "Synthesize findings into coherent content strategy", "backstory": "Senior content strategist who excels at turning data into narrative.", "llmModel": "gpt-5.2", "tools": []},
        ]

    async def get_agent(self, agent_id: str) -> Agent | None:
        for a in await self.list_agents_full():
            if a["_id"] == agent_id:
                return Agent(**a)
        return None

    async def get_crew(self, crew_id: str) -> Crew | None:
        return Crew(
            _id=crew_id, name="Content Gap Discovery Crew", displayName="Content Gap Analysis",
            slug="content-gap-discovery", description="Analyzes content gaps",
            inputSchema=[
                InputField(name="topic", label="Analysis Topic", type="string", required=True, placeholder="e.g., headless CMS for enterprise"),
            ],
        )

    async def get_planner(self) -> dict[str, Any] | None:
        return {
            "_id": "crew-planner-default", "name": "Default Crew Planner", "model": "gpt-5.2",
            "systemPrompt": (
                "You are a crew planner for a conversational AI team (like Slack).\n\n"
                "RULE 1 — MATCH COMPLEXITY:\n"
                "SIMPLE question → EXACTLY 1 agent, 1 task. ≤300 words. questions: [].\n"
                "MODERATE/COMPLEX → Use REVIEW LOOP: Task 1 (primary drafts), Task 2 (reviewer gives feedback), "
                "Task 3 (primary revises). 2+ agents, 3+ tasks. Process must be 'sequential'.\n\n"
                "RULE 2 — AGENT SELECTION: match by role/backstory. Technical questions → Technical SEO Specialist. "
                "NEVER include Narrative Governor. For reviewer role, prefer Quality Assurance Reviewer.\n\n"
                "RULE 3 — RESPONSE QUALITY: Include 'Keep your answer concise.' and 'Do not ask follow-up questions.' in task descriptions.\n\n"
                "Return JSON: {agents, tasks [{name, description, expectedOutput, agentId, order}], process: 'sequential', inputSchema: [], questions: []}."
            ),
            "maxAgents": 6, "process": "sequential", "usePlannerByDefault": True,
        }

    async def get_memory_policy(self) -> dict[str, Any] | None:
        return {
            "_id": "memory-policy-default", "name": "Default Memory Policy",
            "agent": {"_id": "agent-narrative-governor", "name": "Narrative Governor", "role": "Content Strategy Director", "backstory": "Summarize prior outputs and remove non-salient details."},
        }

    async def search_skills(self, query: str | None = None, tags: list[str] | None = None, limit: int = 10) -> list[dict[str, Any]]:
        return [{"_id": "skill-eeat-audit", "name": "EEAT Audit", "description": "Assess content quality using EEAT.", "steps": [], "tags": ["seo"], "toolsRequired": [], "inputSchema": [], "outputSchema": "EEAT score"}]

    async def get_all_credentials(self) -> list[dict[str, Any]]:
        return []

    async def list_mcp_servers(self) -> list[dict[str, Any]]:
        return [{"_id": "mcp-demo", "name": "demo_mcp", "displayName": "Demo MCP", "description": "Example MCP server", "transport": "http", "tools": ["demo_tool"]}]

    # ── Run stubs ─────────────────────────────────────────

    async def create_run(self, crew_id: str | None = None, inputs: dict[str, Any] | None = None, triggered_by: str | None = None, objective: str | None = None, questions: list[str] | None = None, status: str = "pending", planned_crew: dict | None = None, conversation_id: str | None = None) -> str:
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        doc: dict[str, Any] = {"_id": run_id, "_type": "run", "_createdAt": now, "status": status, "inputs": inputs or {}, "objective": objective}
        if crew_id:
            doc["crew"] = {"_id": crew_id, "name": crew_id}
        if conversation_id:
            doc["conversation"] = {"_ref": conversation_id}
        self._runs[run_id] = doc
        logger.info(f"Stub: created run {run_id}")
        return run_id

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        doc = self._runs.get(run_id)
        if not doc:
            logger.warning(f"Stub: run {run_id} not found")
            return
        doc["status"] = status
        for key in ("startedAt", "completedAt", "output", "error", "clarification", "objective"):
            if key in kwargs:
                doc[key] = kwargs[key]
        logger.info(f"Stub: updated run {run_id} status to {status}")

    async def list_runs(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        runs = sorted(self._runs.values(), key=lambda r: r.get("_createdAt", ""), reverse=True)
        if status:
            runs = [r for r in runs if r.get("status") == status]
        return runs[:limit]

    async def get_run(self, run_id: str) -> Run | None:
        doc = self._runs.get(run_id)
        return Run(**doc) if doc else None

    # ── Conversation stubs ────────────────────────────────

    async def create_conversation(self, title: str = "New Conversation") -> str:
        conv_id = f"conv-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        self._conversations[conv_id] = {
            "_id": conv_id, "_type": "conversation", "_createdAt": now,
            "title": title, "status": "active", "messages": [], "runs": [],
        }
        logger.info(f"Stub: created conversation {conv_id}")
        return conv_id

    async def get_conversation(self, conv_id: str) -> dict[str, Any] | None:
        return self._conversations.get(conv_id)

    async def list_conversations(self, limit: int = 50) -> list[dict[str, Any]]:
        convos = sorted(self._conversations.values(), key=lambda c: c.get("_createdAt", ""), reverse=True)
        result = []
        for c in convos[:limit]:
            msgs = c.get("messages", [])
            result.append({
                "_id": c["_id"], "title": c.get("title"), "status": c.get("status"),
                "_createdAt": c.get("_createdAt"), "messageCount": len(msgs),
                "runCount": len(c.get("runs", [])),
                "lastMessage": msgs[-1].get("content") if msgs else None,
            })
        return result

    async def append_message(self, conv_id: str, message: dict[str, Any]) -> None:
        conv = self._conversations.get(conv_id)
        if conv:
            conv.setdefault("messages", []).append(message)

    async def update_conversation_status(self, conv_id: str, status: str) -> None:
        conv = self._conversations.get(conv_id)
        if conv:
            conv["status"] = status

    async def update_conversation_title(self, conv_id: str, title: str) -> None:
        conv = self._conversations.get(conv_id)
        if conv:
            conv["title"] = title

    async def update_conversation_summary(self, conv_id: str, summary: str) -> None:
        conv = self._conversations.get(conv_id)
        if conv:
            conv["lastRunSummary"] = summary

    async def add_run_to_conversation(self, conv_id: str, run_id: str) -> None:
        conv = self._conversations.get(conv_id)
        if conv:
            conv.setdefault("runs", []).append(run_id)
            conv["activeRunId"] = run_id


def get_sanity_client() -> SanityClient | StubSanityClient:
    """Get the Sanity client."""
    settings = get_settings()
    if settings.sanity_project_id and settings.sanity_api_token:
        logger.info("Using real Sanity client")
        return SanityClient(project_id=settings.sanity_project_id, dataset=settings.sanity_dataset, api_token=settings.sanity_api_token)
    else:
        logger.info("Using stub Sanity client (no credentials configured)")
        return StubSanityClient()
