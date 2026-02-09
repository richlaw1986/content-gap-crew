"""Run management and execution endpoints."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.models.sanity import Agent, Crew, InputField, Task
from app.services.crew_planner import plan_crew
from app.services.crew_runner import CrewRunner
from app.services.input_validator import InputValidationError, validate_inputs

router = APIRouter()


# ============================================================
# Request/Response Models
# ============================================================

class CreateRunRequest(BaseModel):
    """Request to create a new run with dynamic inputs."""
    
    crew_id: str | None = None
    objective: str | None = None
    inputs: dict[str, Any]  # Dynamic inputs validated against crew's inputSchema


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
    """Create a new crew run with dynamic inputs.
    
    Creates a run document in Sanity with status 'pending'.
    Inputs are validated against the crew's inputSchema.
    Use the returned run_id to start streaming via GET /runs/{id}/stream.
    
    Request body:
    {
        "crew_id": "crew-content-gap",
        "inputs": {
            "topic": "headless CMS",
            "competitors": ["https://contentful.com"],
            "focusAreas": ["enterprise"]
        }
    }
    """
    sanity = request.app.state.sanity
    
    if body.crew_id:
        # Verify crew exists and get full details including inputSchema
        crew = await sanity.get_crew(body.crew_id)
        if not crew:
            raise HTTPException(status_code=404, detail=f"Crew not found: {body.crew_id}")
        
        # Validate inputs against crew's inputSchema
        try:
            validated_inputs = validate_inputs(crew, body.inputs)
        except InputValidationError as e:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Input validation failed",
                    "errors": e.errors,
                }
            )
        
        # Create run document with validated inputs
        run_id = await sanity.create_run(
            crew_id=body.crew_id,
            inputs=validated_inputs,
            triggered_by="api",  # TODO: Get from auth context
        )
        
        return {
            "id": run_id,
            "status": "pending",
            "crew": {
                "id": crew.id,
                "name": crew.display_name or crew.name,
                "slug": crew.slug,
            },
            "inputs": validated_inputs,
        }

    planner = await sanity.get_planner()
    if not planner:
        raise HTTPException(status_code=500, detail="No enabled crew planner found")

    memory_policy = await sanity.get_memory_policy()
    if not memory_policy:
        raise HTTPException(status_code=500, detail="No enabled memory policy found")

    if not planner.get("usePlannerByDefault", True):
        raise HTTPException(
            status_code=422,
            detail="Planner is disabled by default. Provide crew_id to run a crew.",
        )

    if not body.objective:
        raise HTTPException(status_code=422, detail="objective is required when crew_id is not provided")

    agents = await sanity.list_agents_full()
    plan = await plan_crew(body.objective, body.inputs, agents, planner)

    planned_agents = [Agent(**a) for a in agents if a.get("_id") in plan.agents]
    memory_agent_ref = memory_policy.get("agent") or {}
    memory_agent_id = None
    memory_prompt = None
    if isinstance(memory_agent_ref, dict):
        memory_agent_id = memory_agent_ref.get("_id") or memory_agent_ref.get("_ref")
        memory_prompt = memory_agent_ref.get("backstory")

    if not memory_prompt:
        memory_prompt = (
            "Summarize prior outputs and remove non-salient details. "
            "Preserve key decisions, assumptions, and open questions."
        )

    planned_tasks: list[Task] = []
    order = 1
    for task in plan.tasks:
        if memory_agent_id:
            summary_task_id = f"task-memory-{order}"
            planned_tasks.append(
                Task(
                    _id=summary_task_id,
                    name="Memory Summary",
                    description=f"{memory_prompt}\n\nSummarize context for: {task.name}",
                    expectedOutput="Concise summary of relevant context for the next task.",
                    agent={"_id": memory_agent_id},
                    order=order,
                )
            )
            order += 1

            planned_tasks.append(
                Task(
                    _id=f"task-{order}-{task.name}".replace(" ", "-").lower(),
                    name=task.name,
                    description=task.description,
                    expectedOutput=task.expected_output,
                    agent={"_id": task.agent_id},
                    contextTasks=[{"_id": summary_task_id}],
                    order=order,
                )
            )
            order += 1
        else:
            planned_tasks.append(
                Task(
                    _id=f"task-{order}-{task.name}".replace(" ", "-").lower(),
                    name=task.name,
                    description=task.description,
                    expectedOutput=task.expected_output,
                    agent={"_id": task.agent_id},
                    order=order,
                )
            )
            order += 1

    planned_input_schema = [InputField(**field) for field in plan.input_schema]

    planned_crew = Crew(
        _id="crew-planned",
        name="Planned Crew",
        displayName="Planned Crew",
        description=body.objective,
        agents=planned_agents,
        tasks=planned_tasks,
        inputSchema=planned_input_schema,
        process=plan.process,
        memory=False,
        credentials=[],
    )

    try:
        validated_inputs = (
            validate_inputs(planned_crew, body.inputs)
            if planned_input_schema
            else body.inputs
        )
    except InputValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Input validation failed",
                "errors": e.errors,
            }
        )

    run_id = await sanity.create_run(
        crew_id=planned_crew.id,
        inputs=validated_inputs,
        triggered_by="planner",
    )

    request.app.state.planned_runs[run_id] = {
        "crew": planned_crew,
        "planner": planner,
        "plan": plan,
        "inputs": validated_inputs,
        "memory_policy": memory_policy,
    }

    return {
        "id": run_id,
        "status": "pending",
        "crew": {
            "id": planned_crew.id,
            "name": planned_crew.display_name or planned_crew.name,
            "slug": None,
        },
        "inputs": validated_inputs,
        "plan": plan.model_dump(),
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
        
        planned_run = request.app.state.planned_runs.get(run_id)
        if planned_run:
            await sanity.update_run_status(
                run_id,
                "running",
                startedAt=datetime.now(timezone.utc).isoformat(),
            )

            runner = CrewRunner(planned_run["crew"], memory_policy=planned_run["memory_policy"])
            try:
                async for event in runner.run_with_streaming(planned_run["inputs"]):
                    if event.get("event") == "complete":
                        await sanity.update_run_status(
                            run_id,
                            "completed",
                            completedAt=datetime.now(timezone.utc).isoformat(),
                            output=event.get("finalOutput", ""),
                        )
                        yield complete_event(run_id, event.get("finalOutput", ""))
                        return
                    if event.get("event") == "error":
                        await sanity.update_run_status(
                            run_id,
                            "failed",
                            error={"message": event.get("message", "Unknown error")},
                        )
                        yield error_event(event.get("message", "Unknown error"))
                        return

                    yield {
                        "event": event.get("event", "agent_message"),
                        "data": json.dumps(event),
                    }
            finally:
                request.app.state.planned_runs.pop(run_id, None)

            return

        # TODO: Integrate with CrewAI execution for stored crews
        # For now, emit mock events to test the SSE infrastructure
        
        # Update status to running
        await sanity.update_run_status(
            run_id,
            "running",
            startedAt=datetime.now(timezone.utc).isoformat(),
        )
        
        # Mock execution flow for testing
        agents = ["Data Analyst", "Product Marketer", "SEO Specialist", "Work Reviewer", "Narrative Governor"]
        
        # Get topic from dynamic inputs (fallback for backwards compat)
        run_inputs = run.inputs.model_dump() if hasattr(run.inputs, 'model_dump') else dict(run.inputs)
        topic = run_inputs.get("topic", "unknown topic")
        
        for agent in agents:
            # Thinking
            yield agent_message_event(
                agent=agent,
                message_type="thinking",
                content=f"Analyzing content gaps for topic: {topic}...",
            )
            await asyncio.sleep(0.5)
            
            # Tool call (for agents that have tools)
            if agent != "Narrative Governor":
                yield agent_message_event(
                    agent=agent,
                    message_type="tool_call",
                    content="Searching sitemap...",
                    tool="sanity_sitemap_lookup",
                    args={"query": topic},
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
        final_output = f"""# Content Gap Analysis: {topic}

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
