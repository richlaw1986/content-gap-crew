"""Crew planner that assembles a crew based on agent backstories and tools."""

import json
from typing import Any

from pydantic import AliasChoices, BaseModel, Field


class PlannedTask(BaseModel):
    name: str
    description: str
    expected_output: str = Field(
        validation_alias=AliasChoices("expectedOutput", "expected_output")
    )
    agent_id: str = Field(
        validation_alias=AliasChoices("agentId", "agent_id")
    )
    order: int = 0


class CrewPlan(BaseModel):
    agents: list[str]
    tasks: list[PlannedTask]
    process: str = "sequential"
    input_schema: list[dict[str, Any]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("inputSchema", "input_schema"),
    )
    questions: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("questions", "clarifyingQuestions"),
    )


async def plan_crew(
    objective: str,
    inputs: dict[str, Any],
    agents: list[dict[str, Any]],
    planner_config: dict[str, Any],
) -> CrewPlan:
    """Plan a crew based on objective, inputs, and agent capabilities."""
    from langchain_openai import ChatOpenAI

    model = planner_config.get("model", "gpt-5.2")
    system_prompt = planner_config.get("systemPrompt", "")
    max_agents = planner_config.get("maxAgents", 6)
    process = planner_config.get("process", "sequential")

    payload = {
        "objective": objective,
        "inputs": inputs,
        "maxAgents": max_agents,
        "process": process,
        "agents": agents,
    }

    schema = {
        "type": "object",
        "properties": {
            "agents": {"type": "array", "items": {"type": "string"}},
            "tasks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "expectedOutput": {"type": "string"},
                        "agentId": {"type": "string"},
                        "order": {"type": "number"},
                    },
                    "required": ["name", "description", "expectedOutput", "agentId", "order"],
                },
            },
            "process": {"type": "string"},
            "inputSchema": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": True,
                },
            },
            "questions": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["agents", "tasks", "process", "inputSchema", "questions"],
    }

    from app.config import get_settings

    settings = get_settings()
    llm = ChatOpenAI(model=model, temperature=0.0, api_key=settings.openai_api_key)
    response = llm.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_schema", "json_schema": {"name": "crew_plan", "schema": schema}},
    )

    try:
        return CrewPlan.model_validate_json(response.content)
    except Exception:
        repair = llm.invoke(
            [
                {
                    "role": "system",
                    "content": "Fix this JSON to match the schema exactly. Output only JSON.",
                },
                {"role": "user", "content": response.content},
            ]
        )
        return CrewPlan.model_validate_json(repair.content)
