"""Sanity CMS client for fetching crew configurations."""

from typing import Any

from app.config import get_settings
from app.models import Agent, Crew, Run, RunInputs, Tool


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
            {"_id": "agent-1", "name": "data_analyst", "role": "Data Analyst", "llmTier": "default", "toolCount": 11},
            {"_id": "agent-2", "name": "product_marketer", "role": "Product Marketing Manager", "llmTier": "default", "toolCount": 8},
            {"_id": "agent-3", "name": "seo_specialist", "role": "SEO & AEO Specialist", "llmTier": "default", "toolCount": 11},
            {"_id": "agent-4", "name": "work_reviewer", "role": "Content Gap Validator", "llmTier": "smart", "toolCount": 5},
            {"_id": "agent-5", "name": "narrative_governor", "role": "Narrative Governor", "llmTier": "smart", "toolCount": 0},
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
            slug="content-gap-discovery",
            description="Analyzes content gaps",
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

    async def create_run(self, crew_id: str, inputs: dict[str, Any], triggered_by: str | None = None) -> str:
        import uuid
        return f"run-{uuid.uuid4().hex[:12]}"

    async def update_run_status(self, run_id: str, status: str, **kwargs: Any) -> None:
        pass


def get_sanity_client() -> StubSanityClient:
    """Get the Sanity client (stub for now)."""
    return StubSanityClient()
