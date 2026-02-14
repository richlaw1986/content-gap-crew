/**
 * Crew planner — uses structured output to assemble a crew from Sanity agents.
 * Port of apps/api/app/services/crew_planner.py
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { AgentConfig, PlannerConfig } from "../sanity.js";

// ─── Schema ───────────────────────────────────────────────────
// OpenAI structured output (strict mode) requires ALL properties
// to be listed in `required`. Avoid .default() / .optional() here
// — we handle defaults in post-processing instead.

export const PlannedTaskSchema = z.object({
  name: z.string(),
  description: z.string(),
  expectedOutput: z.string(),
  agentId: z.string(),
  order: z.number(),
});

const InputSchemaItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

export const CrewPlanSchema = z.object({
  agents: z.array(z.string()),
  tasks: z.array(PlannedTaskSchema),
  process: z.string(),
  inputSchema: z.array(InputSchemaItemSchema),
  questions: z.array(z.string()),
});

export type PlannedTask = z.infer<typeof PlannedTaskSchema>;
export type CrewPlan = z.infer<typeof CrewPlanSchema>;

// ─── Planner ──────────────────────────────────────────────────

export async function planCrew(
  objective: string,
  inputs: Record<string, unknown>,
  agents: AgentConfig[],
  plannerConfig: PlannerConfig
): Promise<CrewPlan> {
  const model = plannerConfig.model || "gpt-5.2";
  const systemPrompt = plannerConfig.systemPrompt || "";
  const maxAgents = plannerConfig.maxAgents || 6;
  const process = plannerConfig.process || "sequential";

  const payload = {
    objective,
    inputs,
    maxAgents,
    process,
    agents: agents.map((a) => ({
      _id: a._id,
      name: a.name,
      role: a.role,
      goal: a.goal,
      expertise: a.expertise,
      philosophy: a.philosophy,
      thingsToAvoid: a.thingsToAvoid,
      outputStyle: a.outputStyle,
      backstory: a.backstory,
      llmModel: a.llmModel,
      tools: a.tools?.map((t) => ({
        _id: t._id,
        name: t.name,
        displayName: t.displayName,
        description: t.description,
      })),
    })),
  };

  try {
    const { object } = await generateObject({
      model: openai(model),
      temperature: 0,
      system: systemPrompt,
      prompt: JSON.stringify(payload),
      schema: CrewPlanSchema,
    });

    return applyDefaults(object);
  } catch (error: any) {
    // Retry with repair prompt
    console.warn(`Planner first attempt failed: ${error.message}, retrying...`);
    const { object } = await generateObject({
      model: openai(model),
      temperature: 0,
      system:
        "Fix this JSON to match the schema exactly. Output only valid JSON.",
      prompt: error.text ?? JSON.stringify(payload),
      schema: CrewPlanSchema,
    });
    return applyDefaults(object);
  }
}

/** Fill in safe defaults for fields that OpenAI may return empty */
function applyDefaults(plan: CrewPlan): CrewPlan {
  return {
    ...plan,
    process: plan.process || "sequential",
    inputSchema: plan.inputSchema ?? [],
    questions: plan.questions ?? [],
  };
}
