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

    def __init__(self, crew_config: CrewModel, memory_policy: dict[str, Any] | None = None):
        """Initialize the runner with a crew configuration.
        
        Args:
            crew_config: Crew document from Sanity with expanded agents/tasks/credentials
        """
        self.config = crew_config
        self.settings = get_settings()
        self._credentials_by_type: dict[str, dict[str, Any]] = {}
        self._memory_policy = memory_policy or {}
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
        
        llm_model = agent_config.get("llmModel") or agent_config.get("llmTier")
        
        return Agent(
            role=agent_config.get("role", ""),
            goal=agent_config.get("goal", ""),
            backstory=agent_config.get("backstory", ""),
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
    ) -> list[dict[str, Any]]:
        """Insert a memory-summary task before each real task (except the first).

        The first real task has no prior outputs to summarise, so we skip it.
        """
        if not memory_agent_id:
            return tasks

        prompt = memory_prompt or (
            "Summarize prior outputs and remove non-salient details. "
            "Preserve key decisions, assumptions, and open questions."
        )

        sorted_tasks = sorted(tasks, key=lambda t: t.get("order", 0))

        injected: list[dict[str, Any]] = []
        order = 1

        for idx, task in enumerate(sorted_tasks):
            # Skip memory summary before the very first real task
            if idx > 0:
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
                        "contextTasks": [],
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

            order += 1

        return injected

    def build_crew(self) -> Crew:
        """Build the complete CrewAI Crew from config.
        
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
        memory_prompt = None
        if isinstance(memory_agent_ref, dict):
            memory_agent_id = memory_agent_ref.get("_id") or memory_agent_ref.get("_ref")
            memory_prompt = memory_agent_ref.get("backstory")

        raw_tasks = [t.model_dump(by_alias=True) for t in self.config.tasks]
        injected_tasks = self._inject_memory_tasks(
            raw_tasks,
            memory_agent_id,
            memory_prompt,
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
        crew = self.build_crew()
        
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
        # Emit agent activity events for each agent
            for i, agent in enumerate(crew.agents):
                agent_event = {
                    "event": "agent_message",
                    "type": "thinking",
                    "agent": agent.role,
                "content": f"Starting analysis for: {inputs.get('topic') or inputs.get('objective') or 'unknown topic'}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if on_event:
                    on_event(agent_event)
                yield agent_event
                await asyncio.sleep(0.1)  # Small delay for streaming effect
            
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
            capturing_final = False
            final_lines: list[str] = []

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
                            stream_event = {
                                "event": "agent_message",
                                "type": "message",
                                "agent": last_agent or "Agent",
                                "content": "\n".join(final_lines),
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
                    final_lines.append(cleaned)

            result = await kickoff_future
            
            # Emit task outputs if available
            for task in crew.tasks:
                output = (
                    getattr(task, "output", None)
                    or getattr(task, "result", None)
                    or getattr(task, "response", None)
                )
                if output:
                    task_event = {
                        "event": "agent_message",
                        "type": "message",
                        "agent": getattr(task.agent, "role", "Agent"),
                        "content": str(output),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    if on_event:
                        on_event(task_event)
                    yield task_event

            # Emit completion event
            # Emit final output as an agent message so it appears in chat streams
            final_output = str(result)
            output_event = {
                "event": "agent_message",
                "type": "message",
                "agent": "Final Output",
                "content": final_output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            if on_event:
                on_event(output_event)
            yield output_event

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
