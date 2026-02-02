"""Crew management endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("")
async def list_crews(request: Request) -> list[dict[str, Any]]:
    """List all available crews.
    
    Returns summary information for each crew including
    agent and task counts.
    """
    sanity = request.app.state.sanity
    return await sanity.list_crews()


@router.get("/{crew_id}")
async def get_crew(crew_id: str, request: Request) -> dict[str, Any]:
    """Get a crew by ID with full details.
    
    Returns the crew with expanded agents (including tools),
    tasks, and credentials.
    """
    sanity = request.app.state.sanity
    crew = await sanity.get_crew(crew_id)
    
    if not crew:
        raise HTTPException(status_code=404, detail=f"Crew not found: {crew_id}")
    
    return crew.model_dump(by_alias=True)


@router.get("/slug/{slug}")
async def get_crew_by_slug(slug: str, request: Request) -> dict[str, Any]:
    """Get a crew by slug with full details."""
    sanity = request.app.state.sanity
    crew = await sanity.get_crew_by_slug(slug)
    
    if not crew:
        raise HTTPException(status_code=404, detail=f"Crew not found: {slug}")
    
    return crew.model_dump(by_alias=True)
