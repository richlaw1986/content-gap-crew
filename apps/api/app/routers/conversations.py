"""Conversation endpoints — WebSocket-based bidirectional messaging.

A conversation is a persistent thread where users and agents communicate.
Each conversation can spawn multiple crew runs, and agents can ask the user
questions mid-task.

WebSocket protocol:
  Client → Server messages (JSON):
    { "type": "user_message", "content": "..." }
    { "type": "answer",       "content": "...", "questionId": "..." }

  Server → Client messages (JSON):
    { "type": "agent_message",  "sender": "...", "content": "...", "timestamp": "..." }
    { "type": "question",       "sender": "...", "content": "...", "questionId": "...", "timestamp": "..." }
    { "type": "tool_call",      "sender": "...", "tool": "...", "args": {...}, "timestamp": "..." }
    { "type": "tool_result",    "sender": "...", "tool": "...", "result": "...", "timestamp": "..." }
    { "type": "thinking",       "sender": "...", "content": "...", "timestamp": "..." }
    { "type": "system",         "content": "...", "timestamp": "..." }
    { "type": "complete",       "runId": "...", "output": "...", "timestamp": "..." }
    { "type": "error",          "message": "...", "timestamp": "..." }
    { "type": "status",         "status": "...", "runId": "...", "timestamp": "..." }
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.config import get_settings
from app.models.sanity import Agent, Credential, Crew, InputField, Task
from app.services.crew_planner import plan_crew
from app.services.crew_runner import CrewRunner
from app.services.input_validator import InputValidationError, validate_inputs
from app.services.mcp_client import MCPManager

logger = logging.getLogger(__name__)


async def _agent_reply(
    agent_config: dict[str, Any],
    user_message: str,
    recent_messages: list[dict],
) -> tuple[str, str]:
    """Have the lead agent reply to a mid-run user message.

    Uses the agent's own model/role/backstory from Sanity — the same agent
    the user has been talking to.  Returns (agent_name, reply_text).
    """
    from langchain_anthropic import ChatAnthropic
    from langchain_openai import ChatOpenAI

    settings = get_settings()
    name = agent_config.get("name") or agent_config.get("role") or "Agent"
    role = agent_config.get("role", "")
    backstory = agent_config.get("backstory", "")
    model_name = agent_config.get("llmModel") or settings.default_llm_model

    anthropic_models = {"claude-opus-4-20250514", "claude-sonnet-4-20250514",
                        "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022",
                        "claude-3-5-haiku-20241022", "claude-3-opus-20240229"}

    try:
        if model_name in anthropic_models or model_name.startswith("claude-"):
            llm = ChatAnthropic(
                model=model_name,
                temperature=0.7,
                anthropic_api_key=settings.anthropic_api_key,
            )
        else:
            llm = ChatOpenAI(
                model=model_name,
                temperature=0.7,
                api_key=settings.openai_api_key,
            )

        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        system = (
            f"You are {name} ({role}). {backstory}\n\n"
            "You are in a team chat with a user. Your team is currently working "
            "on a task in the background. The user has just sent a quick message.\n\n"
            "CRITICAL RULES FOR THIS REPLY:\n"
            "- This is a CHAT MESSAGE, not a task. Keep it SHORT — 2-4 sentences max.\n"
            "- Acknowledge what they said and give a brief, helpful response.\n"
            "- Do NOT write a full guide, tutorial, or report. The main task output will handle that.\n"
            "- Do NOT ask follow-up questions unless absolutely essential.\n"
            "- Think of this like a quick Slack reply, not a document."
        )

        messages = [SystemMessage(content=system)]

        for msg in recent_messages[-12:]:
            sender = msg.get("sender", "")
            content_text = msg.get("content", "")[:800]
            if sender == "user":
                messages.append(HumanMessage(content=content_text))
            else:
                prefix = f"[{sender}] " if sender != name else ""
                messages.append(AIMessage(content=f"{prefix}{content_text}"))

        messages.append(HumanMessage(content=user_message))

        resp = await llm.ainvoke(messages)
        reply = resp.content.strip() if resp.content else ""
        return name, reply if reply else f"I hear you — let me factor that in."

    except Exception as exc:
        logger.warning(f"Agent reply failed ({name}, {model_name}): {exc}")
        return name, "I hear you — let me factor that in."

router = APIRouter()


async def _generate_run_summary(
    memory_agent_config: dict[str, Any] | None,
    objective: str,
    final_output: str,
    conversation_messages: list[dict],
) -> str | None:
    """Use the Narrative Governor's LLM to generate a concise run summary.

    This summary is persisted to the conversation and used as context for
    follow-up runs — much more concise and relevant than raw messages.
    """
    from langchain_anthropic import ChatAnthropic
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage

    settings = get_settings()

    # Determine which model to use — prefer the memory agent's model,
    # fall back to default
    if memory_agent_config:
        model_name = memory_agent_config.get("llmModel") or settings.default_llm_model
    else:
        model_name = settings.default_llm_model

    try:
        if model_name.startswith("claude-"):
            llm = ChatAnthropic(
                model=model_name,
                temperature=0.3,
                anthropic_api_key=settings.anthropic_api_key,
            )
        else:
            llm = ChatOpenAI(
                model=model_name,
                temperature=0.3,
                api_key=settings.openai_api_key,
            )

        # Build a digest of user messages + key agent outputs from the conversation
        convo_digest_lines = []
        for m in conversation_messages[-20:]:
            sender = m.get("sender", "")
            content = m.get("content", "")
            mtype = m.get("type", "")
            if not content or mtype in ("thinking", "status", "system"):
                continue
            # Truncate individual messages
            content_short = content[:500] if len(content) > 500 else content
            convo_digest_lines.append(f"[{sender}]: {content_short}")

        convo_digest = "\n".join(convo_digest_lines[-15:])

        system_prompt = (
            "You are a conversation memory manager. Your ONLY job is to produce a "
            "concise, factual summary of what happened in this crew run.\n\n"
            "RULES:\n"
            "- Summarize in 150-250 words max.\n"
            "- Include: the user's objective, key decisions/findings, the final "
            "deliverable type, any important constraints or follow-up items.\n"
            "- Do NOT include meta-commentary, workflow instructions, or tool calls.\n"
            "- Do NOT include the full content of the deliverable — just what it covers.\n"
            "- Write in past tense ('The team produced...', 'The user asked for...').\n"
            "- This summary will be used as context for follow-up requests in the "
            "same conversation, so focus on facts that would help a new crew continue the work."
        )

        user_prompt = (
            f"## User's Objective\n{objective}\n\n"
            f"## Conversation Messages\n{convo_digest}\n\n"
            f"## Final Output (first 1500 chars)\n{final_output[:1500]}\n\n"
            "Produce a concise run summary."
        )

        messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
        resp = await llm.ainvoke(messages)
        summary = resp.content.strip() if resp.content else None
        return summary

    except Exception as exc:
        logger.warning(f"Failed to generate run summary: {exc}")
        return None


# ── REST endpoints for conversation CRUD ───────────────────────

class CreateConversationRequest(BaseModel):
    title: str | None = None


@router.get("")
async def list_conversations(request: Request, limit: int = 50) -> list[dict[str, Any]]:
    """List conversations, most recent first."""
    sanity = request.app.state.sanity
    return await sanity.list_conversations(limit=limit)


@router.post("")
async def create_conversation(body: CreateConversationRequest, request: Request) -> dict[str, Any]:
    """Create a new conversation."""
    sanity = request.app.state.sanity
    conv_id = await sanity.create_conversation(title=body.title or "New Conversation")
    return {"id": conv_id, "status": "active", "title": body.title or "New Conversation"}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request) -> dict[str, Any]:
    """Get a conversation by ID, including messages."""
    sanity = request.app.state.sanity
    conv = await sanity.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


# ── WebSocket endpoint ─────────────────────────────────────────

# Event types that are live-only (streamed via WS but not persisted / replayed).
# "system" covers the "Crew assembled: ..." event from crew_runner.
_ephemeral_ws_types = {"thinking", "tool_call", "tool_result", "status", "system"}

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _msg_key() -> str:
    return uuid.uuid4().hex[:12]


@router.websocket("/{conversation_id}/ws")
async def conversation_ws(websocket: WebSocket, conversation_id: str):
    """Bidirectional WebSocket for a conversation.

    The client sends user messages / answers.  The server streams back agent
    activity, questions, tool calls, and completion events.
    """
    await websocket.accept()

    app = websocket.app
    sanity = app.state.sanity

    # Ensure conversation exists
    conv = await sanity.get_conversation(conversation_id)
    if not conv:
        await websocket.send_json({"type": "error", "message": "Conversation not found", "timestamp": _now()})
        await websocket.close(code=4004)
        return

    # ── Replay existing messages so the client sees full history ────
    # Skip ephemeral status messages (thinking, tool_call, tool_result)
    # — they were live events, not conversation content worth replaying.
    existing_messages = conv.get("messages") or []
    for m in existing_messages:
        content = m.get("content", "")
        if not content:
            continue
        sender = m.get("sender", "system")
        msg_type = m.get("type", "message")
        if msg_type in _ephemeral_ws_types:
            continue

        # Map Sanity storage types to the WS protocol types the frontend expects
        if msg_type == "message" and sender == "user":
            ws_type = "user_message"
        elif msg_type == "message":
            ws_type = "agent_message"
        else:
            ws_type = msg_type

        try:
            await websocket.send_json({
                "type": ws_type,
                "sender": sender,
                "content": content,
                "timestamp": m.get("timestamp", _now()),
                "replayed": True,
            })
        except Exception:
            break  # client disconnected during replay

    # Per-connection state
    pending_questions: dict[str, asyncio.Future] = {}  # questionId → Future[str]
    run_task: asyncio.Task | None = None
    lead_agent_config: dict[str, Any] | None = None  # first agent in the active crew

    async def send(msg: dict):
        """Send a JSON message to the client, ignoring errors if closed."""
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    # Helper: build a set of memory-agent names for filtering output
    def _build_memory_names(policy: dict[str, Any] | None) -> set[str]:
        names: set[str] = set()
        if not policy:
            return names
        ref = policy.get("agent") or {}
        if isinstance(ref, dict):
            for key in ("name", "role"):
                val = ref.get(key)
                if val:
                    names.add(val)
                    names.add(val.lower())
        return names

    def _is_memory_sender(label: str, mem_names: set[str]) -> bool:
        if not label or not mem_names:
            return False
        ll = label.lower()
        if ll in mem_names or label in mem_names:
            return True
        for n in mem_names:
            if n in ll or ll in n:
                return True
        return False

    async def _build_conversation_context() -> str:
        """Build context for continuity across runs.

        Strategy:
        1. If a Narrative Governor run summary exists, use it — it's concise
           and specifically designed for cross-run context.
        2. Append any user messages that came AFTER the summary (i.e. the
           new follow-up message hasn't been summarized yet).
        3. Fall back to raw message extraction if no summary is available.
        """
        conv = await sanity.get_conversation(conversation_id)
        if not conv:
            return ""

        run_summary = conv.get("lastRunSummary", "")
        msgs = conv.get("messages", [])

        if run_summary:
            # The summary covers everything up to the last completed run.
            # Append any user messages that arrived after the summary was
            # generated (typically the new follow-up question).
            post_summary_user_msgs = []
            # Walk backwards from the end to find recent user messages
            # after the last "Run completed" system message
            found_completion = False
            for m in reversed(msgs):
                sender = m.get("sender", "")
                mtype = m.get("type", "")
                content = m.get("content", "")
                if mtype == "system" and "Run completed" in (content or ""):
                    found_completion = True
                    break
                if sender == "user" and content:
                    post_summary_user_msgs.append(f"[user]: {content}")

            parts = [f"PREVIOUS RUN SUMMARY:\n{run_summary}"]
            if post_summary_user_msgs:
                post_summary_user_msgs.reverse()
                parts.append("RECENT USER MESSAGES:\n" + "\n".join(post_summary_user_msgs))
            return "\n\n".join(parts)

        # Fallback: no summary yet — extract from raw messages
        if not msgs:
            return ""

        significant = []
        for m in msgs:
            mtype = m.get("type", "")
            sender = m.get("sender", "")
            content = m.get("content", "")
            if not content or mtype in ("thinking", "status", "system", "question"):
                continue
            if sender == "user" or mtype in ("message", "agent_message"):
                if len(content) > 2000:
                    content = content[:2000] + "\n... [truncated]"
                significant.append(f"[{sender}]: {content}")

        if not significant:
            return ""

        recent = significant[-8:]
        return "\n\n".join(recent)

    async def _run_crew(objective: str, user_inputs: dict[str, Any]):
        """Plan and execute a crew run inside the conversation."""
        try:
            await _run_crew_inner(objective, user_inputs)
        except Exception as fatal:
            logger.error(f"Crew run failed: {fatal}", exc_info=True)
            try:
                await send({
                    "type": "error",
                    "message": f"Something went wrong: {fatal}",
                    "timestamp": _now(),
                })
                await sanity.update_conversation_status(conversation_id, "active")
            except Exception:
                pass  # websocket may already be closed

    async def _run_crew_inner(objective: str, user_inputs: dict[str, Any]):
        """Inner implementation — errors bubble up to _run_crew wrapper."""
        nonlocal pending_questions

        planner = await sanity.get_planner()
        memory_policy = await sanity.get_memory_policy()

        if not planner:
            await send({"type": "error", "message": "No crew planner configured", "timestamp": _now()})
            return

        all_agents = await sanity.list_agents_full()

        # Filter out memory agent from planner candidates
        memory_agent_id = None
        if memory_policy:
            mem_ref = memory_policy.get("agent") or {}
            if isinstance(mem_ref, dict):
                memory_agent_id = mem_ref.get("_id") or mem_ref.get("_ref")
        agents = [a for a in all_agents if a.get("_id") != memory_agent_id]

        # ── Build conversation context for continuity ─────────
        conversation_context = await _build_conversation_context()

        # If there's prior conversation, prepend it to the objective so
        # both the planner and agents know what happened before.
        enriched_objective = objective
        if conversation_context:
            enriched_objective = (
                f"CONVERSATION HISTORY (previous messages in this thread):\n"
                f"{conversation_context}\n\n"
                f"---\n\n"
                f"NEW USER REQUEST:\n{objective}"
            )

        # ── Planning phase ──────────────────────────────────
        await send({"type": "system", "content": "Planning your workflow...", "timestamp": _now()})

        try:
            plan = await plan_crew(enriched_objective, user_inputs, agents, planner)
        except Exception as exc:
            await send({"type": "error", "message": f"Planning failed: {exc}", "timestamp": _now()})
            return

        # ── Clarifying questions (if any) ───────────────────
        all_questions = list(plan.questions or [])

        if all_questions:
            combined_q = "\n- ".join(all_questions)
            q_id = _msg_key()
            await send({
                "type": "question",
                "sender": "Planner",
                "content": f"Clarifying questions:\n- {combined_q}",
                "questionId": q_id,
                "timestamp": _now(),
            })
            await sanity.append_message(conversation_id, {
                "_key": _msg_key(),
                "sender": "planner",
                "type": "question",
                "content": f"Clarifying questions:\n- {combined_q}",
                "timestamp": _now(),
            })
            await sanity.update_conversation_status(conversation_id, "awaiting_input")

            # Wait for the user's answer (delivered via the WS receive loop)
            future: asyncio.Future[str] = asyncio.get_event_loop().create_future()
            pending_questions[q_id] = future
            try:
                answer = await asyncio.wait_for(future, timeout=600)  # 10 min
            except asyncio.TimeoutError:
                await send({"type": "error", "message": "Timed out waiting for answer", "timestamp": _now()})
                return
            finally:
                pending_questions.pop(q_id, None)

            # Enrich objective with user's answers to clarifying questions
            enriched_objective = f"{enriched_objective}\n\nAdditional context from user:\n{answer}"
            user_inputs["clarification"] = answer
            await sanity.update_conversation_status(conversation_id, "active")

        # ── Resolve agents / build crew ─────────────────────
        def _resolve(raw_id: str) -> str | None:
            for a in agents:
                if a.get("_id") == raw_id:
                    return raw_id
            norm = raw_id.lower().replace("-", " ").replace("_", " ")
            for a in agents:
                aid = a.get("_id", "")
                if norm in aid.lower() or aid.lower() in norm:
                    return aid
                if norm in a.get("name", "").lower() or norm in a.get("role", "").lower():
                    return aid
            return None

        resolved_ids: set[str] = set()
        for raw in plan.agents:
            r = _resolve(raw)
            if r:
                resolved_ids.add(r)

        try:
            planned_agents = [Agent(**a) for a in agents if a.get("_id") in resolved_ids]
        except Exception as agent_err:
            logger.warning(f"Agent validation failed, attempting to sanitize: {agent_err}")
            # Retry with sanitized data — coerce None lists to []
            sanitized = []
            for a in agents:
                if a.get("_id") not in resolved_ids:
                    continue
                for tool in (a.get("tools") or []):
                    if tool.get("credentialTypes") is None:
                        tool["credentialTypes"] = []
                    if tool.get("parameters") is None:
                        tool["parameters"] = []
                try:
                    sanitized.append(Agent(**a))
                except Exception as inner_err:
                    logger.error(f"Skipping agent {a.get('_id')}: {inner_err}")
            planned_agents = sanitized

        if not planned_agents:
            planned_agents = [Agent(**a) for a in agents]
            resolved_ids = {a.get("_id") for a in agents}

        # Store the lead agent config so mid-run messages can go through them
        nonlocal lead_agent_config
        lead_raw = next((a for a in agents if a.get("_id") in resolved_ids), None)
        if lead_raw:
            lead_agent_config = lead_raw

        # Inject memory agent
        if memory_policy and memory_agent_id:
            if all(a.id != memory_agent_id for a in planned_agents):
                mem_data = next((a for a in all_agents if a.get("_id") == memory_agent_id), None)
                if mem_data:
                    try:
                        planned_agents.append(Agent(**mem_data))
                    except Exception as mem_err:
                        logger.warning(f"Could not add memory agent: {mem_err}")

        fallback_id = planned_agents[0].id if planned_agents else None
        planned_tasks: list[Task] = []
        prev_task_id: str | None = None
        for order, task in enumerate(plan.tasks, start=1):
            rid = _resolve(task.agent_id) or fallback_id
            if rid and rid not in resolved_ids:
                ad = next((a for a in agents if a.get("_id") == rid), None)
                if ad:
                    planned_agents.append(Agent(**ad))
                    resolved_ids.add(rid)
            task_id = f"task-{order}-{task.name}".replace(" ", "-").lower()

            # Explicit context chain: each task sees the previous task's output
            context_tasks = [{"_id": prev_task_id}] if prev_task_id else []

            planned_tasks.append(Task(
                _id=task_id,
                name=task.name,
                description=task.description,
                expectedOutput=task.expected_output,
                agent={"_id": rid or fallback_id},
                order=order,
                contextTasks=context_tasks,
            ))
            prev_task_id = task_id

        # ── Fetch credentials from Sanity ─────────────────────
        raw_credentials = await sanity.get_all_credentials()
        crew_credentials = [Credential(**c) for c in raw_credentials]

        planned_crew = Crew(
            _id="crew-planned",
            name="Planned Crew",
            displayName="Planned Crew",
            description=enriched_objective,
            agents=planned_agents,
            tasks=planned_tasks,
            process=plan.process,
            memory=False,
            credentials=crew_credentials,
        )

        # Validate inputs — include the enriched objective with history
        inputs = {**user_inputs, "objective": enriched_objective, "topic": objective}

        # ── Create run document ─────────────────────────────
        run_id = await sanity.create_run(
            crew_id=planned_crew.id,
            inputs=inputs,
            triggered_by="conversation",
            objective=objective,  # Store the original (clean) objective
            status="running",
            conversation_id=conversation_id,
        )
        await sanity.add_run_to_conversation(conversation_id, run_id)
        await send({"type": "status", "status": "running", "runId": run_id, "timestamp": _now()})
        await sanity.update_run_status(run_id, "running", startedAt=_now())

        # ── Connect MCP servers and collect tools ──────────
        mcp_manager = MCPManager()
        mcp_tools: list = []
        try:
            mcp_configs = await sanity.list_mcp_servers()
            if mcp_configs:
                await mcp_manager.connect_servers(mcp_configs)
                mcp_tools = mcp_manager.get_all_tools()
                if mcp_tools:
                    logger.info(f"MCP: {len(mcp_tools)} tools from {len(mcp_manager.connected_servers)} servers")
        except Exception as mcp_exc:
            logger.warning(f"MCP setup failed (non-fatal): {mcp_exc}")

        # ── Execute crew with streaming ─────────────────────
        runner = CrewRunner(
            planned_crew,
            memory_policy=memory_policy or {},
            mcp_tools=mcp_tools,
        )
        mem_names = _build_memory_names(memory_policy)

        try:
            async for event in runner.run_with_streaming(inputs):
                evt_type = event.get("event", "")

                if evt_type == "agent_message":
                    # Safety-net: suppress memory agent messages that
                    # slipped through the crew_runner filter.
                    agent_label = event.get("agent", "")
                    if _is_memory_sender(agent_label, mem_names):
                        continue

                    msg_type = event.get("type", "message")
                    # Preserve tool_call/tool_result types; map thinking; default to agent_message
                    if msg_type in ("tool_call", "tool_result"):
                        ws_type = msg_type
                    elif msg_type == "thinking":
                        ws_type = "thinking"
                    else:
                        ws_type = "agent_message"

                    out = {
                        "type": ws_type,
                        "sender": agent_label or "Agent",
                        "content": event.get("content", ""),
                        "timestamp": event.get("timestamp", _now()),
                    }
                    # Include tool name for tool events
                    if event.get("tool"):
                        out["tool"] = event["tool"]

                    await send(out)
                    # Only persist substantive messages — skip ephemeral
                    # live-only events (thinking, tool_call, tool_result,
                    # system "crew assembled" etc.) which would clutter
                    # history and cause replay duplicates.
                    if ws_type not in _ephemeral_ws_types and msg_type not in _ephemeral_ws_types:
                        await sanity.append_message(conversation_id, {
                            "_key": _msg_key(),
                            "sender": agent_label or "Agent",
                            "type": ws_type,
                            "content": event.get("content", ""),
                            "metadata": {"runId": run_id, **({"tool": event["tool"]} if event.get("tool") else {})},
                            "timestamp": event.get("timestamp", _now()),
                        })

                elif evt_type == "complete":
                    output = event.get("finalOutput", "")
                    await sanity.update_run_status(
                        run_id, "completed",
                        completedAt=_now(),
                        output=output,
                    )
                    await send({
                        "type": "complete",
                        "runId": run_id,
                        "output": output,
                        "timestamp": _now(),
                    })
                    await sanity.append_message(conversation_id, {
                        "_key": _msg_key(),
                        "sender": "system",
                        "type": "system",
                        "content": f"Run completed.",
                        "metadata": {"runId": run_id},
                        "timestamp": _now(),
                    })

                    # ── Generate and persist Narrative Governor run summary ──
                    # This runs async after completion to avoid blocking the
                    # response. The summary is used for follow-up run context.
                    try:
                        mem_agent_cfg = None
                        if memory_policy:
                            mem_agent_ref = memory_policy.get("agent")
                            if isinstance(mem_agent_ref, dict):
                                mem_agent_cfg = mem_agent_ref
                        conv = await sanity.get_conversation(conversation_id)
                        conv_msgs = (conv or {}).get("messages", [])
                        summary = await _generate_run_summary(
                            memory_agent_config=mem_agent_cfg,
                            objective=objective,
                            final_output=output,
                            conversation_messages=conv_msgs,
                        )
                        if summary:
                            await sanity.update_conversation_summary(
                                conversation_id, summary
                            )
                            logger.info(
                                f"Persisted run summary for conversation "
                                f"{conversation_id} ({len(summary)} chars)"
                            )
                    except Exception as summary_exc:
                        logger.warning(
                            f"Non-critical: failed to generate run summary: "
                            f"{summary_exc}"
                        )

                elif evt_type == "error":
                    await sanity.update_run_status(
                        run_id, "failed",
                        error={"message": event.get("message", "Unknown error")},
                    )
                    await send({
                        "type": "error",
                        "message": event.get("message", "Unknown error"),
                        "timestamp": _now(),
                    })

                elif evt_type == "run_started":
                    pass  # already handled

        except Exception as exc:
            await sanity.update_run_status(run_id, "failed", error={"message": str(exc)})
            await send({"type": "error", "message": str(exc), "timestamp": _now()})
        finally:
            # Disconnect MCP servers (terminate subprocesses, etc.)
            await mcp_manager.disconnect_all()

    # ── Main receive loop ──────────────────────────────────────
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send({"type": "error", "message": "Invalid JSON", "timestamp": _now()})
                continue

            msg_type = data.get("type")
            content = data.get("content", "").strip()

            if (msg_type in ("user_message", "answer")) and content:
                # Always persist the user message
                await sanity.append_message(conversation_id, {
                    "_key": _msg_key(),
                    "sender": "user",
                    "type": "answer" if msg_type == "answer" else "message",
                    "content": content,
                    "timestamp": _now(),
                })

                # Update title from the first real message
                if msg_type == "user_message":
                    c = await sanity.get_conversation(conversation_id)
                    if c and (not c.get("title") or c.get("title") == "New Conversation"):
                        short = content[:80] + ("…" if len(content) > 80 else "")
                        await sanity.update_conversation_title(conversation_id, short)

                # Route the message:
                #  1) If there are pending clarifying questions → resolve them
                #  2) If a run is active → just acknowledge (don't queue a new run)
                #  3) No run active → start a new run
                if pending_questions:
                    q_id = data.get("questionId")
                    if q_id and q_id in pending_questions:
                        future = pending_questions[q_id]
                        if not future.done():
                            future.set_result(content)
                    else:
                        # Resolve all pending questions with this answer
                        for qid, future in list(pending_questions.items()):
                            if not future.done():
                                future.set_result(content)
                elif run_task and not run_task.done():
                    # Run in progress — have the lead agent reply directly.
                    # The user message is already persisted above.
                    if lead_agent_config:
                        conv_snapshot = await sanity.get_conversation(conversation_id)
                        recent = (conv_snapshot or {}).get("messages", [])[-12:]
                        agent_name, reply_text = await _agent_reply(
                            lead_agent_config, content, recent,
                        )
                        await send({
                            "type": "agent_message",
                            "sender": agent_name,
                            "content": reply_text,
                            "timestamp": _now(),
                        })
                        await sanity.append_message(conversation_id, {
                            "_key": _msg_key(),
                            "sender": agent_name,
                            "type": "message",
                            "content": reply_text,
                            "timestamp": _now(),
                        })
                else:
                    # No run active — kick one off
                    run_task = asyncio.create_task(
                        _run_crew(content, {"objective": content, "topic": content})
                    )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await send({"type": "error", "message": str(exc), "timestamp": _now()})
        except Exception:
            pass
    finally:
        # Cancel any in-flight run
        if run_task and not run_task.done():
            run_task.cancel()
        # Resolve any pending futures to prevent hangs
        for future in pending_questions.values():
            if not future.done():
                future.cancel()
