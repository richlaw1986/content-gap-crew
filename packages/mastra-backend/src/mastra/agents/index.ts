/**
 * Dynamic agent builder.
 *
 * Agents are defined in Sanity and built at runtime —
 * this module provides the bridge.
 */

import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { listAgentsFull, type AgentConfig } from "../../sanity.js";
import { ALL_TOOLS, type ToolName } from "../tools/index.js";

function getModel(modelName?: string) {
  const name = modelName || "gpt-5.2";
  if (name.startsWith("claude-")) return anthropic(name);
  return openai(name);
}

/**
 * Build a Mastra agent from a Sanity agent config.
 */
export function buildAgentFromConfig(config: AgentConfig): Agent {
  // Resolve tools
  const tools: Record<string, any> = {};
  for (const toolRef of config.tools ?? []) {
    const name = toolRef.name as ToolName;
    if (name in ALL_TOOLS) tools[name] = ALL_TOOLS[name];
  }

  const instructions = [
    `You are ${config.name} (${config.role}).`,
    config.goal ? `Goal: ${config.goal}` : "",
    config.expertise ? `Expertise: ${config.expertise}` : "",
    config.philosophy ? `Philosophy: ${config.philosophy}` : "",
    config.backstory ? `Backstory: ${config.backstory}` : "",
    config.outputStyle ? `Output Style: ${config.outputStyle}` : "",
    config.thingsToAvoid?.length
      ? `Things to avoid: ${config.thingsToAvoid.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return new Agent({
    name: config.name,
    instructions,
    model: getModel(config.llmModel),
    tools,
  });
}

/**
 * Fetch all agents from Sanity and build Mastra agents.
 */
export async function buildAllAgents(): Promise<Map<string, Agent>> {
  const configs = await listAgentsFull();
  const agents = new Map<string, Agent>();
  for (const config of configs) {
    agents.set(config._id, buildAgentFromConfig(config));
  }
  return agents;
}
