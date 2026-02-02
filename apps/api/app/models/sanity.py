"""Pydantic models matching Sanity schema types."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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
    llm_tier: str = Field(alias="llmTier", default="default")
    verbose: bool = True

    class Config:
        populate_by_name = True


class Task(BaseModel):
    """Task document from Sanity."""
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    expected_output: str = Field(alias="expectedOutput", default="")
    order: int = 0

    class Config:
        populate_by_name = True


class Crew(BaseModel):
    """Crew document from Sanity."""
    id: str = Field(alias="_id")
    name: str
    slug: str = ""
    description: str | None = None
    agents: list[Agent] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    process: str = "sequential"
    verbose: bool = True

    class Config:
        populate_by_name = True


class RunInputs(BaseModel):
    """Inputs for a crew run."""
    topic: str = ""
    focus_areas: list[str] = Field(alias="focusAreas", default_factory=list)

    class Config:
        populate_by_name = True


class Run(BaseModel):
    """Run document from Sanity."""
    id: str = Field(alias="_id")
    crew_id: str = Field(alias="crew", default="")
    status: str = "pending"
    started_at: datetime | None = Field(alias="startedAt", default=None)
    completed_at: datetime | None = Field(alias="completedAt", default=None)
    inputs: RunInputs = Field(default_factory=RunInputs)
    output: str | None = None

    class Config:
        populate_by_name = True
