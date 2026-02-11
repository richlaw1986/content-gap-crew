"""CrewAI crew runner with dynamic assembly and streaming."""

import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Callable

from crewai import Agent, Crew, Process, Task

from app.config import get_settings
from app.models import Crew as CrewModel
from app.tools import TOOL_REGISTRY, CredentialError


class CrewRunner:
    """Runs CrewAI crews with dynamic assembly from Sanity configs."""

    def __init__(
        self,
        crew_config: CrewModel,
        memory_policy: dict[str, Any] | None = None,
        mcp_tools: list | None = None,
    ):
        """Initialize the runner with a crew configuration.
        
        Args:
            crew_config: Crew document from Sanity with expanded agents/tasks/credentials
            memory_policy: Optional memory policy dict
            mcp_tools: Optional list of MCP tool functions to attach to all agents
        """
        self.config = crew_config
        self.settings = get_settings()
        self._credentials_by_type: dict[str, dict[str, Any]] = {}
        self._memory_policy = memory_policy or {}
        self._mcp_tools: list = mcp_tools or []
        self._setup_credentials()

    def _setup_credentials(self) -> None:
        """Index credentials by type for quick lookup."""
        for cred in self.config.credentials:
            cred_dict = cred.model_dump(by_alias=True)
            self._credentials_by_type[cred.type] = cred_dict

    def _get_llm(self, model_name: str | None):
        """Get the LLM instance for a given model name."""
        from langchain_anthropic import ChatAnthropic
        from langchain_openai import ChatOpenAI

        model = model_name or self.settings.default_llm_model

        anthropic_prefixes = ("claude-",)
        anthropic_models = {
            "claude-opus-4-20250514",
            "claude-sonnet-4-20250514",
            "claude-3-7-sonnet-20250219",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
        }

        if model in anthropic_models or model.startswith(anthropic_prefixes):
            return ChatAnthropic(
                model=model,
                temperature=0.7,
                anthropic_api_key=self.settings.anthropic_api_key,
            )

        return ChatOpenAI(
            model=model,
            temperature=0.7,
            api_key=self.settings.openai_api_key,
        )

    def _build_tool(self, tool_config: dict[str, Any]) -> Any:
        """Build a tool instance with injected credentials.
        
        Args:
            tool_config: Tool document from Sanity
            
        Returns:
            Tool function with credentials partially applied if needed
            
        Raises:
            CredentialError: If required credentials are missing
        """
        tool_name = tool_config.get("name")
        if tool_name not in TOOL_REGISTRY:
            raise ValueError(f"Unknown tool: {tool_name}")
        
        tool_func = TOOL_REGISTRY[tool_name]
        credential_types = tool_config.get("credentialTypes", [])
        
        if not credential_types:
            # No credentials needed
            return tool_func
        
        # Check that we have all required credentials
        missing = [t for t in credential_types if t not in self._credentials_by_type]
        if missing:
            raise CredentialError(
                f"Tool '{tool_name}' requires credentials: {missing}. "
                f"Available: {list(self._credentials_by_type.keys())}"
            )
        
        # For tools that need credentials, we'll need to wrap them
        # CrewAI tools are called with just the tool arguments, so we need
        # to inject credentials via a wrapper
        
        # Get the primary credential (first one in the list)
        primary_cred_type = credential_types[0]
        credential = self._credentials_by_type[primary_cred_type]
        
        # Create a wrapper that injects the credential
        from functools import partial
        return partial(tool_func, credential=credential)

    def _build_agent(self, agent_config: dict[str, Any]) -> Agent:
        """Build a CrewAI Agent from Sanity config.
        
        Args:
            agent_config: Agent document from Sanity with expanded tools
            
        Returns:
            CrewAI Agent instance
        """
        # Build tools for this agent
        tools = []
        for tool_config in agent_config.get("tools", []):
            if tool_config.get("enabled", True):
                try:
                    tool = self._build_tool(tool_config)
                    tools.append(tool)
                except (CredentialError, ValueError) as e:
                    # Log but continue - agent can work with fewer tools
                    print(f"Warning: Could not build tool {tool_config.get('name')}: {e}")

        # Attach MCP tools (available to all agents)
        if self._mcp_tools:
            tools.extend(self._mcp_tools)
        
        llm_model = agent_config.get("llmModel") or agent_config.get("llmTier")

        # Strip the SKILL_INSTRUCTION boilerplate from backstories — tools
        # are already provided explicitly via the tools= list.  Leaving it
        # in causes agents to hallucinate tool calls they can't make.
        backstory = agent_config.get("backstory", "")
        _skill_prefix = (
            "Before starting any task, use the search_skills tool to find "
            "relevant skills. If you are unsure what tools are available, "
            "call list_available_tools first. If a skill is found, follow "
            "its steps and explicitly show compliance in your output."
        )
        if backstory.startswith(_skill_prefix):
            backstory = backstory[len(_skill_prefix):].strip()

        return Agent(
            role=agent_config.get("role", ""),
            goal=agent_config.get("goal", ""),
            backstory=backstory,
            tools=tools,
            llm=self._get_llm(llm_model),
            verbose=agent_config.get("verbose", True),
            allow_delegation=agent_config.get("allowDelegation", False),
        )

    def _build_task(
        self,
        task_config: dict[str, Any],
        agents_by_id: dict[str, Agent],
        agents_list: list[Agent],
        tasks_by_id: dict[str, Task],
    ) -> Task:
        """Build a CrewAI Task from Sanity config.
        
        Args:
            task_config: Task document from Sanity
            agents_by_id: Map of agent IDs to Agent instances
            agents_list: Flat list of agents (for fallback)
            tasks_by_id: Map of task IDs to Task instances (for context)
            
        Returns:
            CrewAI Task instance
        """
        # Get the assigned agent
        agent_ref = task_config.get("agent", {})
        agent_id = agent_ref.get("_id") if isinstance(agent_ref, dict) else None
        agent = agents_by_id.get(agent_id) if agent_id else None

        # Fallback: try substring match on ID, then use first agent
        if agent is None and agent_id and agents_by_id:
            norm = agent_id.lower()
            for aid, ag in agents_by_id.items():
                if norm in aid.lower() or aid.lower() in norm:
                    agent = ag
                    break

        if agent is None and agents_list:
            agent = agents_list[0]
        
        # Get context tasks
        context = []
        for ctx_ref in task_config.get("contextTasks", []):
            ctx_id = ctx_ref.get("_id") if isinstance(ctx_ref, dict) else None
            if ctx_id and ctx_id in tasks_by_id:
                context.append(tasks_by_id[ctx_id])
        
        return Task(
            description=task_config.get("description", ""),
            expected_output=task_config.get("expectedOutput", ""),
            agent=agent,
            context=context if context else None,
        )

    def _inject_memory_tasks(
        self,
        tasks: list[dict[str, Any]],
        memory_agent_id: str | None,
        memory_prompt: str | None,
        objective: str = "",
    ) -> list[dict[str, Any]]:
        """Insert a memory-summary task before each real task (except the first).

        The first real task has no prior outputs to summarise, so we skip it.

        For simple plans (≤ 2 tasks) memory injection is skipped entirely —
        there is not enough output to benefit from compression, and the extra
        task actively confuses the pipeline.
        """
        if not memory_agent_id:
            return tasks

        sorted_tasks = sorted(tasks, key=lambda t: t.get("order", 0))

        # Skip memory injection for simple plans — it adds overhead and
        # the Narrative Governor has nothing useful to compress.
        if len(sorted_tasks) <= 2:
            return sorted_tasks

        prompt = memory_prompt or (
            "You are the memory governor. Your ONLY job is to produce a "
            "short, factual summary of prior task outputs for the next agent. "
            "Do NOT call any tools — you have none. Do NOT add instructions, "
            "meta-commentary, or workflow rules. Just summarize the salient "
            "facts, decisions, assumptions, and open questions from earlier "
            "outputs in a concise paragraph."
        )

        # Include the user's objective so the Governor knows what matters
        if objective:
            prompt += (
                f"\n\nThe user's original objective is: \"{objective}\"\n"
                "Keep your summary focused on what is relevant to this objective."
            )

        injected: list[dict[str, Any]] = []
        order = 1
        prev_real_task_id: str | None = None

        for idx, task in enumerate(sorted_tasks):
            task_id = task.get("_id", f"task-{idx}")

            # Skip memory summary before the very first real task
            if idx > 0 and prev_real_task_id:
                summary_id = f"task-memory-{order}"
                injected.append(
                    {
                        "_id": summary_id,
                        "name": "Memory Summary",
                        "description": (
                            f"{prompt}\n\nSummarize context for: "
                            f"{task.get('name') or 'next task'}"
                        ),
                        "expectedOutput": (
                            "Concise summary of relevant context for the next task."
                        ),
                        "agent": {"_id": memory_agent_id},
                        "order": order,
                        # KEY FIX: give the memory task access to the
                        # previous real task's output so it actually has
                        # something to summarize.
                        "contextTasks": [{"_id": prev_real_task_id}],
                    }
                )
                order += 1

                task_with_context = {**task}
                existing_context = task_with_context.get("contextTasks", [])
                task_with_context["contextTasks"] = existing_context + [
                    {"_id": summary_id}
                ]
                task_with_context["order"] = order
                injected.append(task_with_context)
            else:
                # First task — just add it as-is
                task_copy = {**task, "order": order}
                injected.append(task_copy)

            prev_real_task_id = task_id
            order += 1

        return injected

    def build_crew(self, objective: str = "") -> Crew:
        """Build the complete CrewAI Crew from config.
        
        Args:
            objective: The user's original objective — passed to memory
                       tasks so the Narrative Governor knows what matters.
        
        Returns:
            CrewAI Crew instance ready to execute
        """
        # Build agents
        agents_by_id: dict[str, Agent] = {}
        agents_list: list[Agent] = []
        
        for agent_config in self.config.agents:
            agent_dict = agent_config.model_dump(by_alias=True)
            agent = self._build_agent(agent_dict)
            agents_by_id[agent_config.id] = agent
            agents_list.append(agent)
        
        # Build tasks (need to handle context dependencies)
        tasks_by_id: dict[str, Task] = {}
        tasks_list: list[Task] = []
        
        # Sort tasks by order
        memory_agent_ref = self._memory_policy.get("agent") or {}
        memory_agent_id = None
        if isinstance(memory_agent_ref, dict):
            memory_agent_id = memory_agent_ref.get("_id") or memory_agent_ref.get("_ref")
        # NOTE: we intentionally do NOT use the agent's backstory as the
        # memory prompt — the backstory is the agent's persona, not a task
        # instruction.  The _inject_memory_tasks default is purpose-built.
        memory_prompt = None

        raw_tasks = [t.model_dump(by_alias=True) for t in self.config.tasks]
        injected_tasks = self._inject_memory_tasks(
            raw_tasks,
            memory_agent_id,
            memory_prompt,
            objective=objective,
        )
        sorted_tasks = sorted(injected_tasks, key=lambda t: t.get("order", 0))
        
        for task_config in sorted_tasks:
            task_dict = task_config
            task = self._build_task(task_dict, agents_by_id, agents_list, tasks_by_id)
            task_id = task_dict.get("_id")
            if task_id:
                tasks_by_id[task_id] = task
            tasks_list.append(task)
        
        # Determine process type
        process = Process.sequential
        if self.config.process == "hierarchical":
            process = Process.hierarchical
        
        return Crew(
            agents=agents_list,
            tasks=tasks_list,
            process=process,
            memory=self.config.memory_enabled,
            verbose=self.config.verbose,
        )

    async def run_with_streaming(
        self,
        inputs: dict[str, Any],
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run the crew with streaming events.
        
        Args:
            inputs: Input variables for the crew
            on_event: Optional callback for each event
            
        Yields:
            Event dicts with type, agent, content, etc.
        """
        objective = inputs.get("objective") or inputs.get("topic") or ""
        crew = self.build_crew(objective=objective)
        
        # CrewAI doesn't have native async streaming, so we run it
        # in a thread and stream stdout/stderr lines as events.
        
        # Emit start event
        start_event = {
            "event": "run_started",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "crew": self.config.name,
            "inputs": inputs,
        }
        if on_event:
            on_event(start_event)
        yield start_event
        
        # Run the crew (this is blocking, so we run in executor)
        loop = asyncio.get_event_loop()
        
        try:
            # Determine the memory agent identifiers so we can exclude it
            # from user-visible output.  CrewAI stdout uses the agent *role*
            # in some places and the *name* in others, so we track both.
            memory_agent_names: set[str] = set()
            if self._memory_policy:
                mem_ref = self._memory_policy.get("agent") or {}
                if isinstance(mem_ref, dict):
                    for key in ("role", "name"):
                        val = mem_ref.get(key)
                        if val:
                            memory_agent_names.add(val)
                            memory_agent_names.add(val.lower())

            def _is_memory_agent(label: str | None) -> bool:
                if not label or not memory_agent_names:
                    return False
                ll = label.lower()
                if ll in memory_agent_names or label in memory_agent_names:
                    return True
                # Substring match — resilient to CrewAI name mangling
                for name in memory_agent_names:
                    if name in ll or ll in name:
                        return True
                return False

            # Build agent ID → display name and role → display name mappings
            # We add MANY variations because CrewAI slugifies roles internally
            # (e.g. "Senior Data Analyst" → "data_analyst" or "senior_data_analyst").
            agent_name_by_id: dict[str, str] = {}
            agent_name_by_role: dict[str, str] = {}

            def _add_role_variation(key: str, display: str):
                """Add a key and its normalized variants to the lookup map."""
                if not key:
                    return
                for variant in (
                    key.lower(),
                    key.lower().replace(" ", "_"),
                    key.lower().replace("_", " "),
                    key.lower().replace("-", " "),
                    key.lower().replace("-", "_"),
                ):
                    if variant and variant not in agent_name_by_role:
                        agent_name_by_role[variant] = display

            for ag in self.config.agents:
                ad = ag.model_dump(by_alias=True)
                aid = ad.get("_id", "")
                role = ad.get("role", "")
                name = ad.get("name", "")
                display = name or role or "Agent"
                agent_name_by_id[aid] = display
                # Add the role and name in all common variations
                _add_role_variation(role, display)
                _add_role_variation(name, display)
                # Also add the Sanity _id (e.g. "agent-data-analyst")
                if aid:
                    _add_role_variation(aid, display)
                    # Strip "agent-" prefix too (CrewAI might use it)
                    if aid.startswith("agent-"):
                        _add_role_variation(aid[6:], display)

            # Emit "crew assembled" event listing the team
            visible_agents = [
                ag for ag in crew.agents
                if not _is_memory_agent(ag.role)
            ]
            def _normalize(s: str) -> str:
                """Normalize agent labels for matching (underscores, hyphens → spaces)."""
                return s.lower().replace("_", " ").replace("-", " ").strip()

            def _display_name(raw_label: str | None) -> str:
                """Resolve a stdout agent label to its display name."""
                if not raw_label:
                    return "Agent"
                norm = _normalize(raw_label)
                # Try exact role match (normalized)
                for role_key, name in agent_name_by_role.items():
                    if _normalize(role_key) == norm:
                        return name
                # Substring match (normalized)
                for role_key, name in agent_name_by_role.items():
                    nk = _normalize(role_key)
                    if nk in norm or norm in nk:
                        return name
                return raw_label  # fall back to raw label

            if visible_agents:
                agent_names = [_display_name(ag.role) for ag in visible_agents]
                assembled_event = {
                    "event": "agent_message",
                    "type": "system",
                    "agent": "system",
                    "content": f"Crew assembled: {', '.join(agent_names)}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if on_event:
                    on_event(assembled_event)
                yield assembled_event

            # Stream stdout/stderr from CrewAI in real-time
            import io
            import threading
            from contextlib import redirect_stdout, redirect_stderr

            stream_queue: asyncio.Queue[str] = asyncio.Queue()
            stream_done = threading.Event()
            last_agent: str | None = None

            class StreamToQueue(io.TextIOBase):
                def __init__(self, loop: asyncio.AbstractEventLoop):
                    self._loop = loop
                    self._buffer = ""

                def write(self, s: str) -> int:
                    self._buffer += s
                    while "\n" in self._buffer:
                        line, self._buffer = self._buffer.split("\n", 1)
                        self._loop.call_soon_threadsafe(stream_queue.put_nowait, line)
                    return len(s)

                def flush(self) -> None:
                    if self._buffer:
                        self._loop.call_soon_threadsafe(stream_queue.put_nowait, self._buffer)
                        self._buffer = ""

            def run_kickoff():
                stream = StreamToQueue(loop)
                try:
                    with redirect_stdout(stream), redirect_stderr(stream):
                        return crew.kickoff(inputs=inputs)
                finally:
                    stream.flush()
                    stream_done.set()

            kickoff_future = loop.run_in_executor(None, run_kickoff)

            import re

            ansi_re = re.compile(r"\x1b\[[0-9;]*m")
            box_re = re.compile(r"^[\s╭╮╰╯┌┐└┘─│┃┼═]+$")
            # Lines agents emit when they hallucinate tool calls — never useful to the user
            noise_re = re.compile(
                r"^(Calling\s+(search_skills|list_available_tools|search_skills\b|list_available_tools\b))"
                r"|^(I don't have access to|I need to call|Let me (check|search|call))",
                re.IGNORECASE,
            )
            capturing_final = False
            final_lines: list[str] = []
            emitted_hashes: set[int] = set()  # dedup identical Final Answer blocks
            task_index = 0  # track which task we're on
            # Build a list of task info for workflow stage messages
            # Use self.config.tasks (the source config), sorted by order
            _raw_tasks = sorted(
                [t.model_dump(by_alias=True) for t in self.config.tasks],
                key=lambda t: t.get("order", 0),
            )
            task_info_list = [
                {
                    "name": t.get("name", f"Task {i+1}"),
                    "agent_id": (t.get("agent") or {}).get("_id", ""),
                }
                for i, t in enumerate(_raw_tasks)
                # Skip memory tasks from the stage display
                if t.get("name") != "Memory Summary"
            ]

            while not kickoff_future.done() or not stream_queue.empty():
                try:
                    line = await asyncio.wait_for(stream_queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue

                text = ansi_re.sub("", line).strip()
                if not text:
                    continue

                if "Agent:" in text:
                    parts = text.split("Agent:", 1)
                    agent_name = parts[1].strip() if len(parts) > 1 else None
                    if agent_name:
                        last_agent = agent_name

                # Emit workflow stage message when a new task starts
                if "Task Started" in text or ("Task:" in text and "Started" in text):
                    if task_index < len(task_info_list):
                        info = task_info_list[task_index]
                        stage_label = info["name"]
                        # Resolve agent name from task config, not stdout
                        stage_agent = agent_name_by_id.get(info["agent_id"]) or _display_name(last_agent)
                        # Skip emitting for memory tasks
                        if not _is_memory_agent(stage_agent):
                            stage_event = {
                                "event": "agent_message",
                                "type": "thinking",
                                "agent": stage_agent,
                                "content": f"Working on: {stage_label}",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }
                            if on_event:
                                on_event(stage_event)
                            yield stage_event
                        task_index += 1
                    continue

                # Suppress memory agent output from the user-visible stream
                if _is_memory_agent(last_agent):
                    # Still process Final Answer boundaries but don't emit
                    if "Final Answer:" in text:
                        capturing_final = True
                        after = text.split("Final Answer:", 1)[1].strip()
                        if after:
                            final_lines.append(after)
                    elif capturing_final:
                        if text.startswith("Task Completed") or text.startswith("Task Started") or text.startswith("Crew Execution") or text.startswith("╭") or text.startswith("╰"):
                            capturing_final = False
                            final_lines = []
                        else:
                            cleaned = re.sub(r"^[│┃|]\s*", "", text)
                            cleaned = re.sub(r"\s*[│┃|]$", "", cleaned).strip()
                            if cleaned and not box_re.match(cleaned):
                                final_lines.append(cleaned)
                    continue

                if "Final Answer:" in text:
                    capturing_final = True
                    after = text.split("Final Answer:", 1)[1].strip()
                    if after:
                        final_lines.append(after)
                    continue

                if capturing_final:
                    if text.startswith("Task Completed") or text.startswith("Task Started") or text.startswith("Crew Execution") or text.startswith("╭") or text.startswith("╰"):
                        capturing_final = False
                        if final_lines:
                            content = "\n".join(final_lines)
                            content_hash = hash(content)
                            if content_hash not in emitted_hashes:
                                emitted_hashes.add(content_hash)
                                stream_event = {
                                    "event": "agent_message",
                                    "type": "message",
                                    "agent": _display_name(last_agent),
                                    "content": content,
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                }
                                if on_event:
                                    on_event(stream_event)
                                yield stream_event
                            final_lines = []
                        continue

                    cleaned = re.sub(r"^[│┃|]\s*", "", text)
                    cleaned = re.sub(r"\s*[│┃|]$", "", cleaned).strip()
                    if not cleaned or box_re.match(cleaned):
                        continue
                    if noise_re.match(cleaned):
                        continue  # skip hallucinated tool-call chatter
                    final_lines.append(cleaned)

            # Flush any residual captured content after the loop exits
            if final_lines:
                content = "\n".join(final_lines)
                content_hash = hash(content)
                if content_hash not in emitted_hashes:
                    emitted_hashes.add(content_hash)
                    stream_event = {
                        "event": "agent_message",
                        "type": "message",
                        "agent": _display_name(last_agent),
                        "content": content,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    if on_event:
                        on_event(stream_event)
                    yield stream_event
                final_lines = []

            result = await kickoff_future

            # NOTE: Individual task outputs are already captured and emitted
            # during the streaming loop above (via "Final Answer:" parsing),
            # so we skip re-emitting them here to avoid duplicates.

            # Emit the overall crew result + completion event
            final_output = str(result)

            complete_event = {
                "event": "complete",
                "runId": "run-placeholder",  # Will be set by caller
                "finalOutput": final_output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            if on_event:
                on_event(complete_event)
            yield complete_event
            
        except Exception as e:
            error_event = {
                "event": "error",
                "message": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            if on_event:
                on_event(error_event)
            yield error_event
            raise
