/**
 * Multi-agent workflow runner with streaming.
 *
 * Replaces CrewAI's crew.kickoff() with a sequential task execution model
 * using Vercel AI SDK's streaming + Mastra agents. Each task is assigned
 * to an agent, and tasks execute in order, with each task receiving the
 * previous task's output as context.
 *
 * Events are emitted as an async iterable, matching the Python WS protocol:
 *   { event: "agent_message", type: "thinking"|"message"|"tool_call"|"tool_result"|"system", ... }
 *   { event: "complete", finalOutput: "..." }
 *   { event: "error", message: "..." }
 */

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { AgentConfig, CredentialConfig, MemoryPolicyConfig } from "../sanity.js";
import type { PlannedTask } from "./planner.js";
import { ALL_TOOLS, type ToolName } from "../mastra/tools/index.js";

// ─── Types ────────────────────────────────────────────────────

export interface RunnerConfig {
  agents: AgentConfig[];
  tasks: PlannedTask[];
  process: string;
  credentials: CredentialConfig[];
  memoryPolicy?: MemoryPolicyConfig | null;
  mcpTools?: Array<{ name: string; tool: any }>;
}

export interface RunEvent {
  event: string;
  type?: string;
  agent?: string;
  content?: string;
  tool?: string;
  timestamp?: string;
  runId?: string;
  finalOutput?: string;
  message?: string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function getModel(modelName?: string) {
  const name = modelName || process.env.DEFAULT_LLM_MODEL || "gpt-5.2";

  if (name.startsWith("claude-")) {
    return anthropic(name);
  }
  return openai(name);
}

function isMemoryAgent(agentConfig: AgentConfig, memoryPolicy?: MemoryPolicyConfig | null): boolean {
  if (!memoryPolicy?.agent) return false;
  const memId = memoryPolicy.agent._id;
  return agentConfig._id === memId;
}

function isReviewerAgent(agentConfig: AgentConfig): boolean {
  const name = (agentConfig.name || "").toLowerCase();
  const role = (agentConfig.role || "").toLowerCase();
  const id = (agentConfig._id || "").toLowerCase();
  return (
    name.includes("review") ||
    role.includes("review") ||
    role.includes("quality") ||
    id.includes("review") ||
    id.includes("quality")
  );
}

/**
 * Index credentials by type for quick lookup.
 * E.g. { "google_ads": { _id, name, type, storageMethod, ... }, "semrush": { ... } }
 */
function indexCredentials(
  credentials: CredentialConfig[]
): Map<string, CredentialConfig> {
  const map = new Map<string, CredentialConfig>();
  for (const cred of credentials) {
    if (cred.type) map.set(cred.type, cred);
  }
  return map;
}

/**
 * Create a credential-bound wrapper around a tool.
 *
 * Many Mastra tools accept a `credentialJson` parameter in their inputSchema.
 * The LLM should NOT have to provide credential values — those are a system concern.
 * This function creates a new tool with `credentialJson` removed from the schema
 * and automatically injected at execution time, mirroring the Python backend's
 * `functools.partial(tool_func, credential=credential)` pattern.
 */
function bindCredential(
  originalTool: any,
  credential: CredentialConfig
): any {
  const origSchema = originalTool.inputSchema as z.ZodObject<any> | undefined;
  if (!origSchema) return originalTool;

  // Check if the tool actually expects credentialJson
  const shape = origSchema.shape ?? {};
  if (!("credentialJson" in shape)) return originalTool;

  // Build a new schema without credentialJson
  const { credentialJson: _removed, ...rest } = shape;
  const newSchema = z.object(rest);

  const credJson = JSON.stringify(credential);

  return createTool({
    id: originalTool.id,
    description: originalTool.description,
    inputSchema: newSchema,
    execute: async ({ context }: { context: Record<string, unknown> }) => {
      // Inject the credential back before calling the original execute
      return originalTool.execute({
        context: { ...context, credentialJson: credJson },
      });
    },
  });
}

/**
 * Resolve which tools from our catalog an agent should get,
 * based on the tool references in its Sanity config.
 *
 * For tools that require credentials (via `credentialTypes`), the matching
 * credential is pre-bound so the LLM never needs to provide it.
 */
export function resolveAgentTools(
  agentConfig: AgentConfig,
  credentials: CredentialConfig[]
): Record<string, any> {
  const tools: Record<string, any> = {};
  const configuredTools = agentConfig.tools ?? [];
  const credIndex = indexCredentials(credentials);

  for (const toolRef of configuredTools) {
    const toolName = toolRef.name as ToolName;
    if (!(toolName in ALL_TOOLS)) continue;

    let tool = ALL_TOOLS[toolName] as any;

    // If the Sanity tool config specifies credentialTypes, bind the first matching credential
    const credTypes = toolRef.credentialTypes ?? [];
    if (credTypes.length > 0) {
      const primaryType = credTypes[0];
      const cred = credIndex.get(primaryType);
      if (cred) {
        tool = bindCredential(tool, cred);
      } else {
        // Credential missing — skip this tool (it will fail anyway)
        console.warn(
          `[resolveAgentTools] Tool '${toolName}' requires credential '${primaryType}' but none found — skipping`
        );
        continue;
      }
    }

    tools[toolName] = tool;
  }

  // If agent has no explicit tools, give them the web/sitemap basics
  if (Object.keys(tools).length === 0) {
    tools.fetch_webpage_content = ALL_TOOLS.fetch_webpage_content;
    tools.sitemap_lookup = ALL_TOOLS.sitemap_lookup;
    tools.top_google_search_pages = ALL_TOOLS.top_google_search_pages;
  }

  return tools;
}

/**
 * Build a Mastra Agent from a Sanity agent config.
 */
function buildAgent(
  agentConfig: AgentConfig,
  credentials: CredentialConfig[]
): Agent {
  const tools = resolveAgentTools(agentConfig, credentials);

  const instructions = [
    `You are ${agentConfig.name} (${agentConfig.role}).`,
    agentConfig.goal ? `Goal: ${agentConfig.goal}` : "",
    agentConfig.expertise ? `Expertise: ${agentConfig.expertise}` : "",
    agentConfig.philosophy ? `Philosophy: ${agentConfig.philosophy}` : "",
    agentConfig.backstory ? `Backstory: ${agentConfig.backstory}` : "",
    agentConfig.outputStyle ? `Output Style: ${agentConfig.outputStyle}` : "",
    agentConfig.thingsToAvoid?.length
      ? `Things to avoid: ${agentConfig.thingsToAvoid.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return new Agent({
    name: agentConfig.name,
    instructions,
    model: getModel(agentConfig.llmModel),
    tools,
  });
}

// ─── Runner ───────────────────────────────────────────────────

export async function* runCrew(
  config: RunnerConfig,
  inputs: Record<string, unknown>
): AsyncGenerator<RunEvent> {
  const { agents: agentConfigs, tasks, credentials, memoryPolicy } = config;

  // Build lookup maps
  const agentById = new Map(agentConfigs.map((a) => [a._id, a]));

  // Filter out memory agent from visible agents
  const visibleAgents = agentConfigs.filter(
    (a) => !isMemoryAgent(a, memoryPolicy)
  );

  // Emit "crew assembled" event
  if (visibleAgents.length) {
    const names = visibleAgents.map((a) => a.name);
    yield {
      event: "agent_message",
      type: "system",
      agent: "system",
      content: `Crew assembled: ${names.join(", ")}`,
      timestamp: now(),
    };
  }

  // Sort tasks by order
  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  // Track task outputs for context chaining
  let previousOutput = "";
  let finalOutput = "";
  // Collect all non-reviewer outputs and the reviewer's feedback separately.
  // After all tasks, the lead agent runs a final synthesis pass to produce
  // ONE unified deliverable that incorporates every agent's contribution
  // and addresses the reviewer's QA notes.
  const substantiveOutputs: { agent: string; output: string }[] = [];
  let reviewerFeedback = "";
  let leadAgentConfig: AgentConfig | null = null;

  for (let i = 0; i < sortedTasks.length; i++) {
    const task = sortedTasks[i];
    const agentConfig = agentById.get(task.agentId);
    if (!agentConfig) {
      yield {
        event: "error",
        message: `Agent ${task.agentId} not found for task "${task.name}"`,
        timestamp: now(),
      };
      continue;
    }

    // Skip memory agent tasks from visible output
    if (isMemoryAgent(agentConfig, memoryPolicy)) {
      continue;
    }

    const agentName = agentConfig.name;
    const reviewer = isReviewerAgent(agentConfig);

    // Emit "working on" thinking event
    yield {
      event: "agent_message",
      type: "thinking",
      agent: agentName,
      content: `Working on: ${task.name}`,
      timestamp: now(),
    };

    // Build the agent
    const agent = buildAgent(agentConfig, credentials);

    // Build task prompt with context from previous tasks
    let taskPrompt = task.description;
    if (previousOutput) {
      taskPrompt = `CONTEXT FROM PREVIOUS TASK:\n${previousOutput.slice(0, 4000)}\n\n---\n\nYOUR TASK:\n${task.description}`;
    }

    // Add user inputs
    const objectiveStr =
      (inputs.objective as string) || (inputs.topic as string) || "";
    if (objectiveStr) {
      taskPrompt = `USER'S REQUEST: ${objectiveStr}\n\n${taskPrompt}`;
    }

    taskPrompt += `\n\nEXPECTED OUTPUT: ${task.expectedOutput}`;

    // If this is the reviewer, remind them their job is QA feedback
    if (reviewer) {
      taskPrompt += `\n\nYour review will be shown to the user alongside the main deliverable. Focus on noting issues, improvements, and validation — the prior agent's output is the final deliverable.`;
    }

    try {
      // Collect tool events via onStepFinish and stream text
      const pendingEvents: RunEvent[] = [];

      const result = await agent.generate(taskPrompt, {
        maxSteps: 10,
        onStepFinish: (step: any) => {
          // Emit tool calls from this step
          if (step.toolCalls?.length) {
            for (const tc of step.toolCalls) {
              pendingEvents.push({
                event: "agent_message",
                type: "tool_call",
                agent: agentName,
                tool: tc.toolName,
                content: `called ${tc.toolName}`,
                timestamp: now(),
              });
            }
          }
          // Emit tool results from this step
          if (step.toolResults?.length) {
            for (const tr of step.toolResults) {
              const resultStr = typeof tr.result === "string"
                ? tr.result
                : JSON.stringify(tr.result);
              const preview = resultStr.length > 200
                ? resultStr.slice(0, 200) + "..."
                : resultStr;
              pendingEvents.push({
                event: "agent_message",
                type: "tool_result",
                agent: agentName,
                tool: tr.toolName,
                content: `${tr.toolName}: ${preview}`,
                timestamp: now(),
              });
            }
          }
        },
      });

      // Yield all collected tool events
      for (const evt of pendingEvents) {
        yield evt;
      }

      const output = typeof result === "string"
        ? result
        : (result as any)?.text ?? String(result);

      previousOutput = output;

      // Track outputs by role for the final synthesis step.
      if (reviewer) {
        reviewerFeedback += (reviewerFeedback ? "\n\n" : "") + output;
      } else {
        substantiveOutputs.push({ agent: agentName, output });
        // The first substantive agent is the "lead" who will do the synthesis
        if (!leadAgentConfig) {
          leadAgentConfig = agentConfig;
        }
      }

      // Emit the agent's response
      yield {
        event: "agent_message",
        type: "message",
        agent: agentName,
        content: output,
        timestamp: now(),
      };
    } catch (error: any) {
      yield {
        event: "error",
        message: `Task "${task.name}" failed: ${error.message}`,
        timestamp: now(),
      };
    }
  }

  // ── Synthesis decision ───────────────────────────────────────
  // If multiple agents contributed (or a reviewer flagged issues),
  // hand the raw materials to the conversation handler so it can
  // ask the user before synthesizing.  For simple single-agent runs
  // we just complete directly.
  const objectiveStr =
    (inputs.objective as string) || (inputs.topic as string) || "";

  const needsSynthesis =
    substantiveOutputs.length > 1 ||
    (substantiveOutputs.length === 1 && reviewerFeedback);

  if (!needsSynthesis) {
    // Single agent, no reviewer — complete directly
    finalOutput = substantiveOutputs[0]?.output || previousOutput || "No output produced.";
    yield {
      event: "complete",
      runId: "run-placeholder",
      finalOutput,
      timestamp: now(),
    };
  } else {
    // Hand off to conversation handler for optional user confirmation
    yield {
      event: "synthesis_ready",
      substantiveOutputs,
      reviewerFeedback,
      leadAgentName: leadAgentConfig?.name || "Lead Agent",
      leadAgentModel: leadAgentConfig?.llmModel,
      objective: objectiveStr,
      timestamp: now(),
    };
  }
}

// ─── Standalone synthesis (called by conversation handler) ────

export interface SynthesisInput {
  substantiveOutputs: { agent: string; output: string }[];
  reviewerFeedback: string;
  leadAgentName: string;
  leadAgentModel?: string;
  objective: string;
}

/**
 * Synthesize multiple agent outputs into a single unified deliverable.
 *
 * Called by the conversation handler AFTER the user confirms they want
 * to proceed (or immediately when there's no reviewer feedback to discuss).
 */
export async function synthesizeOutputs(
  input: SynthesisInput
): Promise<string> {
  const { substantiveOutputs, reviewerFeedback, leadAgentName, leadAgentModel, objective } = input;

  // Build a tool-free agent for synthesis — no tool calls, just text generation.
  const synthesisAgent = new Agent({
    name: leadAgentName,
    instructions:
      `You are a senior synthesizer. Your ONLY job is to merge multiple team ` +
      `contributions into one seamless document. You produce the final document ` +
      `immediately using only the material provided. You never ask for more ` +
      `information — you work with what you have.`,
    model: getModel(leadAgentModel),
    tools: {},
  });

  const contributionsBlock = substantiveOutputs
    .map((s) => `--- ${s.agent} ---\n${s.output}`)
    .join("\n\n");

  const reviewerBlock = reviewerFeedback
    ? `\n\nQA REVIEWER FEEDBACK (address these in your final version):\n${reviewerFeedback}`
    : "";

  const synthesisPrompt = [
    `You are producing the FINAL DELIVERABLE for the user.`,
    ``,
    `USER'S ORIGINAL REQUEST: ${objective}`,
    ``,
    `Multiple team members have contributed their work below.`,
    `Your job is to synthesize ALL of their contributions into ONE cohesive, unified output.`,
    ``,
    `RULES:`,
    `- Produce the final document NOW. Do not ask for more data or URLs.`,
    `- Do NOT list contributions by agent name or separate sections per agent.`,
    `- Produce a SINGLE polished document that seamlessly integrates all insights.`,
    `- If the QA reviewer raised valid issues, address them where possible using the existing evidence.`,
    `- If contributions overlap, merge and deduplicate — keep the strongest version of each point.`,
    `- Maintain the depth and specificity of the original contributions — do not summarize or water down.`,
    `- Match the format the user would expect (e.g. a full audit document, complete code files, etc).`,
    `- Where evidence was limited, note it briefly as a caveat inline (e.g. "[not verified — needs PSI check]").`,
    `- Do NOT include preamble like "Here is the synthesized..." — start with the content directly.`,
    ``,
    `TEAM CONTRIBUTIONS:`,
    contributionsBlock,
    reviewerBlock,
  ].join("\n");

  const result = await synthesisAgent.generate(synthesisPrompt, {
    maxSteps: 1,
  });

  return typeof result === "string"
    ? result
    : (result as any)?.text ?? String(result);
}
