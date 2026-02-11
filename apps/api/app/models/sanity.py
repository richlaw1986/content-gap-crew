"""Pydantic models matching Sanity schema types."""

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field


class Tool(BaseModel):
    """Tool document from Sanity."""
    id: str = Field(alias="_id")
    name: str
    display_name: str | None = Field(alias="displayName", default=None)
    description: str = ""
    credential_types: list[str] = Field(alias="credentialTypes", default_factory=list)
    enabled: bool = True

    class Config:
        populate_by_name = True


class Agent(BaseModel):
    """Agent document from Sanity."""
    id: str = Field(alias="_id")
    name: str
    role: str
    goal: str = ""
    backstory: str = ""
    tools: list[Tool] = Field(default_factory=list)
    llm_model: str = Field(
        alias="llmModel",
        validation_alias=AliasChoices("llmModel", "llmTier"),
        default="gpt-5.2",
    )
    verbose: bool = True

    class Config:
        populate_by_name = True


class Task(BaseModel):
    """Task — generated dynamically by the planner, not stored in Sanity."""
    id: str = Field(alias="_id")
    name: str | None = None
    description: str = ""
    expected_output: str = Field(alias="expectedOutput", default="")
    order: int = 0
    agent: dict | None = None
    context_tasks: list[dict] = Field(alias="contextTasks", default_factory=list)

    class Config:
        populate_by_name = True


class InputField(BaseModel):
    """Input field definition for dynamic crew inputs."""
    name: str
    label: str
    type: Literal["string", "text", "number", "boolean", "array", "select"]
    required: bool = False
    placeholder: str | None = None
    help_text: str | None = Field(alias="helpText", default=None)
    default_value: str | int | bool | list[str] | None = Field(alias="defaultValue", default=None)
    options: list[str] = Field(default_factory=list)  # for 'select' type

    class Config:
        populate_by_name = True


class Crew(BaseModel):
    """Crew document from Sanity."""
    id: str = Field(alias="_id")
    name: str
    slug: str | None = None
    display_name: str | None = Field(alias="displayName", default=None)
    description: str | None = None
    agents: list[Agent] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    input_schema: list[InputField] = Field(alias="inputSchema", default_factory=list)
    process: str = "sequential"
    memory_enabled: bool = Field(alias="memory", default=False)
    credentials: list["Credential"] = Field(default_factory=list)
    verbose: bool = True

    class Config:
        populate_by_name = True


class RunInputs(BaseModel):
    """Dynamic inputs for a crew run."""
    model_config = {"extra": "allow", "populate_by_name": True}


class RunError(BaseModel):
    """Error details for a failed run."""
    message: str = ""
    stack: str | None = None
    task_name: str | None = Field(alias="taskName", default=None)

    class Config:
        populate_by_name = True


class Run(BaseModel):
    """Run document from Sanity."""
    id: str = Field(alias="_id")
    conversation_id: str | None = Field(alias="conversation", default=None)
    crew_id: str | dict | None = Field(alias="crew", default=None)
    planned_crew: dict | None = Field(alias="plannedCrew", default=None)
    objective: str | None = None
    status: str = "pending"
    started_at: datetime | None = Field(alias="startedAt", default=None)
    completed_at: datetime | None = Field(alias="completedAt", default=None)
    inputs: RunInputs = Field(default_factory=RunInputs)
    output: str | None = None
    error: RunError | None = None
    metadata: dict | None = None

    class Config:
        populate_by_name = True


# ── Conversation models ────────────────────────────────────────

class ConversationMessage(BaseModel):
    """A single message in a conversation thread."""
    id: str = Field(alias="_key", default="")
    sender: str  # "user" | agent role | "system" | "planner"
    agent_id: str | None = Field(alias="agentId", default=None)
    type: str = "message"  # message | thinking | question | answer | tool_call | tool_result | error | system
    content: str = ""
    metadata: dict[str, Any] | None = None
    timestamp: str = ""

    class Config:
        populate_by_name = True


class Conversation(BaseModel):
    """Conversation document from Sanity."""
    id: str = Field(alias="_id")
    title: str = ""
    status: str = "active"  # active | awaiting_input | completed | failed
    messages: list[ConversationMessage] = Field(default_factory=list)
    runs: list[str] = Field(default_factory=list)  # run IDs
    active_run_id: str | None = Field(alias="activeRunId", default=None)
    metadata: dict | None = None
    created_at: str | None = Field(alias="_createdAt", default=None)

    class Config:
        populate_by_name = True


# ── Other models ───────────────────────────────────────────────

class Credential(BaseModel):
    """Credential document from Sanity."""
    id: str = Field(alias="_id", default="")
    name: str | None = None
    type: str = ""

    model_config = {"extra": "allow", "populate_by_name": True}


class MemoryPolicy(BaseModel):
    """Memory policy document from Sanity."""
    id: str = Field(alias="_id", default="")
    name: str | None = None
    enabled: bool = True
    agent: dict | None = None

    model_config = {"extra": "allow", "populate_by_name": True}


class Skill(BaseModel):
    """Skill document from Sanity."""
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    steps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    tools_required: list[str] = Field(alias="toolsRequired", default_factory=list)
    input_schema: list[InputField] = Field(alias="inputSchema", default_factory=list)
    output_schema: str | None = Field(alias="outputSchema", default=None)
    enabled: bool = True

    class Config:
        populate_by_name = True


# Chat models (kept for backward compatibility)
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    message: ChatMessage
    suggestedInputs: RunInputs | None = None


Crew.model_rebuild()
