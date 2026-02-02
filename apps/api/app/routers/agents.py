"""Agent management endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("")
async def list_agents(request: Request) -> list[dict[str, Any]]:
    """List all agents."""
    sanity = request.app.state.sanity
    return await sanity.list_agents()


@router.get("/{agent_id}")
async def get_agent(agent_id: str, request: Request) -> dict[str, Any]:
    """Get an agent by ID with full details."""
    sanity = request.app.state.sanity
    agent = await sanity.get_agent(agent_id)
    
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")
    
    return agent.model_dump(by_alias=True)
