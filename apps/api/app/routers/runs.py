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
    data = {
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
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
    """List runs with optional status filter."""
    sanity = request.app.state.sanity
    return await sanity.list_runs(limit=limit, status=status)


@router.post("")
async def create_run(
    body: CreateRunRequest,
    request: Request,
) -> dict[str, Any]:
    """Create a new crew run with dynamic inputs.
    
    Returns either:
    - status "pending" — ready to stream via GET /runs/{id}/stream
    - status "awaiting_input" — planner needs clarification, answer via POST /runs/{id}/continue
    """
    sanity = request.app.state.sanity
    
    # ── Fixed crew path ──────────────────────────────────────
    if body.crew_id:
        crew = await sanity.get_crew(body.crew_id)
        if not crew:
            raise HTTPException(status_code=404, detail=f"Crew not found: {body.crew_id}")
        
        try:
            validated_inputs = validate_inputs(crew, body.inputs)
        except InputValidationError as e:
            raise HTTPException(
                status_code=422,
                detail={"message": "Input validation failed", "errors": e.errors},
            )
        
        run_id = await sanity.create_run(
            crew_id=body.crew_id,
            inputs=validated_inputs,
            triggered_by="api",
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

    # ── Planner path ─────────────────────────────────────────
    planner = await sanity.get_planner()
    if not planner:
        raise HTTPException(status_code=500, detail="No enabled crew planner found")

    memory_policy = await sanity.get_memory_policy()

    if not planner.get("usePlannerByDefault", True):
        raise HTTPException(
            status_code=422,
            detail="Planner is disabled by default. Provide crew_id to run a crew.",
        )

    if not body.objective:
        raise HTTPException(status_code=422, detail="objective is required when crew_id is not provided")

    agents = await sanity.list_agents_full()
    plan = await plan_crew(body.objective, body.inputs, agents, planner)

    # ── Resolve agent IDs (planner may return approximate IDs) ────
    def _resolve_agent_id(raw_id: str) -> str | None:
        """Try exact match, then substring / fuzzy match against _id, name, role."""
        # Exact _id match
        for a in agents:
            if a.get("_id") == raw_id:
                return raw_id
        # Normalised substring match
        norm = raw_id.lower().replace("-", " ").replace("_", " ")
        for a in agents:
            aid = a.get("_id", "")
            aname = a.get("name", "").lower()
            arole = a.get("role", "").lower()
            if norm in aid.lower() or aid.lower() in norm:
                return aid
            if norm in aname or aname in norm:
                return aid
            if norm in arole or arole in norm:
                return aid
        return None

    # Build planned agents – resolve each ID the planner returned
    resolved_agent_ids: set[str] = set()
    for raw in plan.agents:
        resolved = _resolve_agent_id(raw)
        if resolved:
            resolved_agent_ids.add(resolved)

    planned_agents = [Agent(**a) for a in agents if a.get("_id") in resolved_agent_ids]
    if not planned_agents:
        planned_agents = [Agent(**a) for a in agents]
        resolved_agent_ids = {a.get("_id") for a in agents}

    # Ensure memory agent is in the agent list (injection handled in build_crew)
    if memory_policy:
        memory_agent_ref = memory_policy.get("agent") or {}
        if isinstance(memory_agent_ref, dict):
            mem_id = memory_agent_ref.get("_id") or memory_agent_ref.get("_ref")
            if mem_id and all(a.id != mem_id for a in planned_agents):
                memory_agent_data = next((a for a in agents if a.get("_id") == mem_id), None)
                if memory_agent_data:
                    planned_agents.append(Agent(**memory_agent_data))

    # Fallback agent ID (first in list) for tasks whose agent can't be resolved
    fallback_agent_id = planned_agents[0].id if planned_agents else None

    # Build planned tasks — memory injection happens later in build_crew()
    planned_tasks: list[Task] = []
    for order, task in enumerate(plan.tasks, start=1):
        resolved_id = _resolve_agent_id(task.agent_id) or fallback_agent_id
        # Make sure the resolved agent is in the planned set
        if resolved_id and resolved_id not in resolved_agent_ids:
            agent_data = next((a for a in agents if a.get("_id") == resolved_id), None)
            if agent_data:
                planned_agents.append(Agent(**agent_data))
                resolved_agent_ids.add(resolved_id)

        planned_tasks.append(
            Task(
                _id=f"task-{order}-{task.name}".replace(" ", "-").lower(),
                name=task.name,
                description=task.description,
                expectedOutput=task.expected_output,
                agent={"_id": resolved_id or fallback_agent_id},
                order=order,
            )
        )

    # Build input schema from plan
    planned_input_schema = []
    allowed_types = {"string", "text", "number", "boolean", "array", "select"}
    for field in plan.input_schema:
        if not isinstance(field, dict):
            continue
        if "label" not in field:
            field = {**field, "label": field.get("name", "Input")}
        if field.get("type") not in allowed_types:
            field = {**field, "type": "text"}
        planned_input_schema.append(InputField(**field))

    # Check for missing required inputs
    missing_required = []
    for field in planned_input_schema:
        value = body.inputs.get(field.name)
        if field.required and (value is None or value == "" or value == []):
            missing_required.append(field.label or field.name)

    # Assemble planned crew
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
        if planned_input_schema and not missing_required:
            validated_inputs = validate_inputs(planned_crew, body.inputs)
        else:
            validated_inputs = body.inputs
    except InputValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={"message": "Input validation failed", "errors": e.errors},
        )

    # Preserve the primary objective/topic
    if body.objective:
        validated_inputs.setdefault("objective", body.objective)
        validated_inputs.setdefault("topic", body.objective)

    run_id = await sanity.create_run(
        crew_id=planned_crew.id,
        inputs=validated_inputs,
        triggered_by="planner",
    )

    # Store the planned run in memory for the stream handler
    request.app.state.planned_runs[run_id] = {
        "crew": planned_crew,
        "planner": planner,
        "plan": plan,
        "inputs": validated_inputs,
        "memory_policy": memory_policy or {},
        "awaiting_input": False,
    }

    # ── If planner has questions or inputs are missing, pause ──
    all_questions = list(plan.questions or [])
    if missing_required:
        all_questions.extend([f"Please provide: {field}" for field in missing_required])

    if all_questions:
        request.app.state.planned_runs[run_id]["awaiting_input"] = True
        return {
            "id": run_id,
            "status": "awaiting_input",
            "questions": all_questions,
            "crew": {
                "id": planned_crew.id,
                "name": planned_crew.display_name or planned_crew.name,
                "slug": None,
            },
            "inputs": validated_inputs,
        }

    # ── No questions — ready to stream ────────────────────────
    return {
        "id": run_id,
        "status": "pending",
        "crew": {
            "id": planned_crew.id,
            "name": planned_crew.display_name or planned_crew.name,
            "slug": None,
        },
        "inputs": validated_inputs,
    }


@router.get("/{run_id}")
async def get_run(run_id: str, request: Request) -> dict[str, Any]:
    """Get a run by ID."""
    sanity = request.app.state.sanity
    run = await sanity.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return run.model_dump(by_alias=True)


@router.get("/{run_id}/stream")
async def stream_run(run_id: str, request: Request) -> EventSourceResponse:
    """Stream run execution via Server-Sent Events."""
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
        if not planned_run:
            yield error_event("Run is not active. Start a new chat run.")
            return

        # If still waiting for user input, don't execute
        if planned_run.get("awaiting_input"):
            yield agent_message_event(
                agent="System",
                message_type="thinking",
                content="Waiting for your answers before proceeding...",
            )
            return

        # Mark as running
        await sanity.update_run_status(
            run_id,
            "running",
            startedAt=datetime.now(timezone.utc).isoformat(),
        )

        runner = CrewRunner(planned_run["crew"], memory_policy=planned_run.get("memory_policy", {}))
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
        except Exception as exc:
            await sanity.update_run_status(
                run_id,
                "failed",
                error={"message": str(exc)},
            )
            yield error_event(str(exc))
        finally:
            # Clean up — the run is done (success or failure)
            request.app.state.planned_runs.pop(run_id, None)
    
    return EventSourceResponse(event_generator())


@router.post("/{run_id}/continue")
async def continue_run(
    run_id: str,
    body: dict[str, Any],
    request: Request,
) -> dict[str, Any]:
    """Continue a planned run after the user answers clarifying questions.
    
    Merges new inputs, clears the awaiting flag, and resets Sanity status
    so the next GET /stream will execute the crew.
    """
    planned_run = request.app.state.planned_runs.get(run_id)
    if not planned_run:
        raise HTTPException(status_code=404, detail="Run not found or not resumable")

    new_inputs = body.get("inputs", {})
    if not isinstance(new_inputs, dict):
        raise HTTPException(status_code=422, detail="inputs must be an object")

    # Merge clarification into the objective so the crew has full context
    clarification = new_inputs.get("clarification", "")
    if clarification:
        current_objective = planned_run["inputs"].get("objective", "")
        enriched = f"{current_objective}\n\nUser clarification: {clarification}"
        planned_run["inputs"]["objective"] = enriched
        planned_run["inputs"]["topic"] = enriched

    planned_run["inputs"].update(new_inputs)
    planned_run["awaiting_input"] = False

    # Reset Sanity status so the stream handler will execute
    sanity = request.app.state.sanity
    await sanity.update_run_status(run_id, "pending")

    return {"id": run_id, "status": "pending", "inputs": planned_run["inputs"]}
