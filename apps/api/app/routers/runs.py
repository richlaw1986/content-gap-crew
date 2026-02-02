"""Run management and execution endpoints."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

router = APIRouter()


# ============================================================
# Request/Response Models
# ============================================================

class CreateRunRequest(BaseModel):
    """Request to create a new run."""
    
    crew_id: str
    topic: str
    focus_areas: list[str] = []
    custom_inputs: dict[str, str] = {}


class RunSummary(BaseModel):
    """Summary of a run for list views."""
    
    id: str
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    crew_name: str | None = None
    topic: str | None = None
    task_count: int = 0


# ============================================================
# SSE Event Types
# ============================================================

class SSEEvent(BaseModel):
    """Base SSE event."""
    
    event: str
    data: dict[str, Any]

    def to_sse(self) -> dict[str, str]:
        """Convert to SSE format."""
        return {
            "event": self.event,
            "data": json.dumps(self.data),
        }


def agent_message_event(
    agent: str,
    message_type: str,
    content: str,
    tool: str | None = None,
    args: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Create an agent message SSE event."""
    data = {
        "agent": agent,
        "type": message_type,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if tool:
        data["tool"] = tool
    if args:
        data["args"] = args
    
    return {
        "event": "agent_message" if message_type == "thinking" else message_type,
        "data": json.dumps(data),
    }


def complete_event(run_id: str, final_output: str) -> dict[str, str]:
    """Create a completion SSE event."""
    return {
        "event": "complete",
        "data": json.dumps({
            "runId": run_id,
            "finalOutput": final_output,
        }),
    }


def error_event(message: str, task_name: str | None = None) -> dict[str, str]:
    """Create an error SSE event."""
    data = {"message": message}
    if task_name:
        data["taskName"] = task_name
    return {
        "event": "error",
        "data": json.dumps(data),
    }


# ============================================================
# Endpoints
# ============================================================

@router.get("")
async def list_runs(
    request: Request,
    limit: int = 50,
    status: str | None = None,
) -> list[dict[str, Any]]:
    """List runs with optional status filter.
    
    Args:
        limit: Maximum number of runs to return (default: 50)
        status: Filter by status (pending, running, completed, failed)
    """
    sanity = request.app.state.sanity
    return await sanity.list_runs(limit=limit, status=status)


@router.post("")
async def create_run(
    body: CreateRunRequest,
    request: Request,
) -> dict[str, Any]:
    """Create a new crew run.
    
    Creates a run document in Sanity with status 'pending'.
    Use the returned run_id to start streaming via GET /runs/{id}/stream.
    """
    sanity = request.app.state.sanity
    
    # Verify crew exists
    crew = await sanity.get_crew(body.crew_id)
    if not crew:
        raise HTTPException(status_code=404, detail=f"Crew not found: {body.crew_id}")
    
    # Create run document
    inputs = {
        "topic": body.topic,
        "focusAreas": body.focus_areas,
        "customInputs": [
            {"key": k, "value": v} for k, v in body.custom_inputs.items()
        ],
    }
    
    run_id = await sanity.create_run(
        crew_id=body.crew_id,
        inputs=inputs,
        triggered_by="api",  # TODO: Get from auth context
    )
    
    return {
        "id": run_id,
        "status": "pending",
        "crew": {
            "id": crew.id,
            "name": crew.name,
            "slug": crew.slug,
        },
        "inputs": inputs,
    }


@router.get("/{run_id}")
async def get_run(run_id: str, request: Request) -> dict[str, Any]:
    """Get a run by ID.
    
    Returns the full run document including task results and output.
    """
    sanity = request.app.state.sanity
    run = await sanity.get_run(run_id)
    
    if not run:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    
    return run.model_dump(by_alias=True)


@router.get("/{run_id}/stream")
async def stream_run(run_id: str, request: Request) -> EventSourceResponse:
    """Stream run execution via Server-Sent Events.
    
    Event types:
    - agent_message: Agent thinking/reasoning
    - tool_call: Agent invoking a tool
    - tool_result: Tool execution result
    - complete: Run finished successfully
    - error: Run failed
    
    The stream will:
    1. Start the crew execution if status is 'pending'
    2. Stream all agent activity in real-time
    3. Close with 'complete' or 'error' event
    """
    sanity = request.app.state.sanity
    run = await sanity.get_run(run_id)
    
    if not run:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    
    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        """Generate SSE events for the run."""
        
        # If run is already complete, just return the result
        if run.status == "completed":
            yield complete_event(run_id, run.output or "")
            return
        
        if run.status == "failed":
            yield error_event(
                run.error.message if run.error else "Unknown error",
                run.error.task_name if run.error else None,
            )
            return
        
        if run.status == "cancelled":
            yield error_event("Run was cancelled")
            return
        
        # TODO: Integrate with CrewAI execution
        # For now, emit mock events to test the SSE infrastructure
        
        # Update status to running
        await sanity.update_run_status(
            run_id,
            "running",
            startedAt=datetime.now(timezone.utc).isoformat(),
        )
        
        # Mock execution flow for testing
        agents = ["Data Analyst", "Product Marketer", "SEO Specialist", "Work Reviewer", "Narrative Governor"]
        
        for agent in agents:
            # Thinking
            yield agent_message_event(
                agent=agent,
                message_type="thinking",
                content=f"Analyzing content gaps for topic: {run.inputs.topic}...",
            )
            await asyncio.sleep(0.5)
            
            # Tool call (for agents that have tools)
            if agent != "Narrative Governor":
                yield agent_message_event(
                    agent=agent,
                    message_type="tool_call",
                    content="Searching sitemap...",
                    tool="sanity_sitemap_lookup",
                    args={"query": run.inputs.topic},
                )
                await asyncio.sleep(0.3)
                
                yield agent_message_event(
                    agent=agent,
                    message_type="tool_result",
                    content="Found 15 related pages in sitemap.",
                    tool="sanity_sitemap_lookup",
                )
                await asyncio.sleep(0.3)
            
            # Output
            yield agent_message_event(
                agent=agent,
                message_type="output",
                content=f"Completed analysis phase for {agent}.",
            )
            await asyncio.sleep(0.2)
        
        # Final output
        final_output = f"""# Content Gap Analysis: {run.inputs.topic}

## Executive Summary
Analysis complete. Found 5 high-priority content gaps.

## Top Recommendations
1. Create "Top 10 AI Tools for Content Management" article
2. Add comparison page: Sanity vs Contentful for AI workflows
3. Develop tutorial: "Building RAG with Sanity"

(This is mock output - real CrewAI integration pending)
"""
        
        # Update run as completed
        await sanity.update_run_status(
            run_id,
            "completed",
            completedAt=datetime.now(timezone.utc).isoformat(),
            output=final_output,
        )
        
        yield complete_event(run_id, final_output)
    
    return EventSourceResponse(event_generator())
