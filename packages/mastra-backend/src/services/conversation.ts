/**
 * WebSocket conversation handler.
 *
 * Port of apps/api/app/routers/conversations.py
 *
 * Implements the same WS protocol so the Studio plugin works unchanged:
 *   Client → Server:
 *     { type: "user_message", content: "..." }
 *     { type: "answer", content: "...", questionId: "..." }
 *   Server → Client:
 *     { type: "agent_message"|"question"|"tool_call"|"tool_result"|"thinking"|"system"|"complete"|"error"|"status", ... }
 */

import type { WebSocket } from "ws";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  getConversation,
  appendMessage,
  updateConversationStatus,
  updateConversationTitle,
  updateConversationSummary,
  listCrews,
  listAgentsFull,
  getPlanner,
  getMemoryPolicy,
  getAllCredentials,
  listAllSkills,
  searchSkills,
  createRun,
  updateRunStatus,
  addRunToConversation,
  type AgentConfig,
  type SkillConfig,
} from "../sanity.js";
import { planCrew } from "./planner.js";
import { runCrew, type RunEvent, type RunnerConfig } from "./runner.js";

// ─── Helpers ──────────────────────────────────────────────────

function _now(): string {
  return new Date().toISOString();
}

function _msgKey(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// Event types that are truly ephemeral — not persisted or replayed.
// Only "status" qualifies: it's a state toggle, not meaningful content.
// Everything else (thinking, tool_call, tool_result, system, agent_message,
// complete, question, etc.) is persisted so returning users see full history.
const EPHEMERAL_TYPES = new Set(["status"]);

// ─── Global run registry ───────────────────────────────────────
// Maps conversationId → run state, so runs survive WS disconnects.
// When a WS closes the run continues writing to Sanity. A new WS
// connection can reattach to receive live events.
interface ActiveRunState {
  wsRef: { ws: WebSocket | null };
  pendingQuestions: Map<string, { resolve: (a: string) => void; reject: (e: Error) => void }>;
  leadAgentConfig: AgentConfig | null;
  activeCrewAgents: AgentConfig[];
  runId?: string;
  done: boolean;
}
const _activeRuns = new Map<string, ActiveRunState>();

// ─── Agent reply (mid-run or follow-up) ───────────────────────

import { Agent } from "@mastra/core/agent";
import { type CredentialConfig } from "../sanity.js";

/**
 * Simple text-only reply (no tools). Used when the run is still in
 * progress and we just need a quick conversational response.
 */
async function agentReplySimple(
  agentConfig: AgentConfig,
  userMessage: string,
  recentMessages: Array<Record<string, unknown>>
): Promise<{ name: string; reply: string }> {
  const name = agentConfig.name || agentConfig.role || "Agent";
  const role = agentConfig.role || "";
  const backstory = agentConfig.backstory || "";
  const modelName = agentConfig.llmModel || "gpt-5.2";

  const systemPrompt =
    `You are ${name} (${role}). ${backstory}\n\n` +
    "You are in a team chat with a user. You and your team have been working " +
    "together on tasks in this conversation. The user has just sent a message.\n\n" +
    "CRITICAL RULES FOR THIS REPLY:\n" +
    "- This is a CHAT MESSAGE, not a task. Keep it SHORT — 2-4 sentences max.\n" +
    "- If the user asks about previous work, answer from the conversation context.\n" +
    "- If the user asks a NEW question on a different topic, answer it directly.\n" +
    "- Do NOT write a full guide, tutorial, or report.\n" +
    "- Do NOT ask follow-up questions unless absolutely essential.\n" +
    "- Think of this like a quick Slack reply, not a document.";

  type MsgRole = "system" | "user" | "assistant";
  const messages: Array<{ role: MsgRole; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of recentMessages.slice(-12)) {
    const sender = (msg.sender as string) || "";
    const content = ((msg.content as string) || "").slice(0, 800);
    if (sender === "user") {
      messages.push({ role: "user", content });
    } else {
      const prefix = sender !== name ? `[${sender}] ` : "";
      messages.push({ role: "assistant", content: `${prefix}${content}` });
    }
  }

  messages.push({ role: "user", content: userMessage });

  try {
    const model = modelName.startsWith("claude-")
      ? anthropic(modelName)
      : openai(modelName);

    const { text } = await generateText({
      model,
      temperature: 0.7,
      messages,
    });

    return { name, reply: text?.trim() || "I hear you — let me factor that in." };
  } catch (e: any) {
    console.warn(`Agent reply failed (${name}): ${e.message}`);
    return { name, reply: "I hear you — let me factor that in." };
  }
}

/**
 * Tool-enabled reply. Used for follow-up messages after a run has completed.
 * The agent gets its full toolkit so it can satisfy requests like "look that up"
 * or "give me the search volume for X".
 *
 * Returns tool events alongside the final reply so the UI can show them.
 */
async function agentReplyWithTools(
  agentConfig: AgentConfig,
  credentials: CredentialConfig[],
  userMessage: string,
  recentMessages: Array<Record<string, unknown>>,
  sendFn: (msg: Record<string, unknown>) => void
): Promise<{ name: string; reply: string }> {
  // Lazy import to avoid circular dep
  const { resolveAgentTools: _resolveTools } = await import("./runner.js");
  const name = agentConfig.name || agentConfig.role || "Agent";

  const tools = _resolveTools(agentConfig, credentials);

  // Build conversation history as context
  const historyLines: string[] = [];
  for (const msg of recentMessages.slice(-12)) {
    const sender = (msg.sender as string) || "";
    const content = ((msg.content as string) || "").slice(0, 800);
    if (content) historyLines.push(`[${sender}]: ${content}`);
  }
  const historyBlock = historyLines.length
    ? `RECENT CONVERSATION:\n${historyLines.join("\n")}\n\n---\n\n`
    : "";

  const instructions = [
    `You are ${name} (${agentConfig.role || ""}).`,
    agentConfig.goal ? `Goal: ${agentConfig.goal}` : "",
    agentConfig.expertise ? `Expertise: ${agentConfig.expertise}` : "",
    agentConfig.backstory ? `Backstory: ${agentConfig.backstory}` : "",
    "",
    "You are in a follow-up conversation with a user after completing a task.",
    "Use your tools if the user asks you to look something up, verify data, or run an analysis.",
    "Keep your response focused and concise — answer the question, don't write an essay.",
  ].filter(Boolean).join("\n");

  const agent = new Agent({
    name,
    instructions,
    model: agentConfig.llmModel?.startsWith("claude-")
      ? anthropic(agentConfig.llmModel)
      : openai(agentConfig.llmModel || "gpt-5.2"),
    tools,
  });

  try {
    const pendingEvents: Array<Record<string, unknown>> = [];

    const result = await agent.generate(
      `${historyBlock}USER'S MESSAGE:\n${userMessage}`,
      {
        maxSteps: 8,
        onStepFinish: (step: any) => {
          if (step.toolCalls?.length) {
            for (const tc of step.toolCalls) {
              const evt = {
                type: "tool_call" as const,
                sender: name,
                tool: tc.toolName,
                content: `called ${tc.toolName}`,
                timestamp: new Date().toISOString(),
              };
              pendingEvents.push(evt);
              sendFn(evt);
            }
          }
          if (step.toolResults?.length) {
            for (const tr of step.toolResults) {
              const resultStr = typeof tr.result === "string"
                ? tr.result
                : JSON.stringify(tr.result);
              const preview = resultStr.length > 200
                ? resultStr.slice(0, 200) + "..."
                : resultStr;
              const evt = {
                type: "tool_result" as const,
                sender: name,
                tool: tr.toolName,
                content: `${tr.toolName}: ${preview}`,
                timestamp: new Date().toISOString(),
              };
              pendingEvents.push(evt);
              sendFn(evt);
            }
          }
        },
      }
    );

    const text = typeof result === "string"
      ? result
      : (result as any)?.text ?? String(result);

    return { name, reply: text?.trim() || "I hear you — let me look into that." };
  } catch (e: any) {
    console.warn(`Agent tool reply failed (${name}): ${e.message}`);
    return { name, reply: `I ran into an issue: ${e.message}` };
  }
}

// ─── Run summary generation ──────────────────────────────────

async function generateRunSummary(
  objective: string,
  finalOutput: string,
  conversationMessages: Array<Record<string, unknown>>,
  modelName?: string
): Promise<string | null> {
  try {
    const model = (modelName || "gpt-5.2").startsWith("claude-")
      ? anthropic(modelName || "claude-sonnet-4")
      : openai(modelName || "gpt-5.2");

    const digestLines: string[] = [];
    for (const m of conversationMessages.slice(-20)) {
      const sender = (m.sender as string) || "";
      const content = (m.content as string) || "";
      const type = (m.type as string) || "";
      if (!content || ["thinking", "status", "system"].includes(type)) continue;
      digestLines.push(`[${sender}]: ${content.slice(0, 500)}`);
    }

    const { text } = await generateText({
      model,
      temperature: 0.3,
      system:
        "You are a conversation memory manager. Your ONLY job is to produce a " +
        "concise, factual summary of what happened in this crew run.\n\n" +
        "RULES:\n" +
        "- Summarize in 150-250 words max.\n" +
        "- Include: the user's objective, key decisions/findings, the final deliverable type.\n" +
        "- Do NOT include meta-commentary, workflow instructions, or tool calls.\n" +
        "- Write in past tense ('The team produced...', 'The user asked for...').",
      prompt:
        `## User's Objective\n${objective}\n\n` +
        `## Conversation Messages\n${digestLines.slice(-15).join("\n")}\n\n` +
        `## Final Output (first 1500 chars)\n${finalOutput.slice(0, 1500)}\n\n` +
        "Produce a concise run summary.",
    });

    return text?.trim() || null;
  } catch (e: any) {
    console.warn(`Failed to generate run summary: ${e.message}`);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────

export async function handleConversationWs(
  ws: WebSocket,
  conversationId: string
) {
  // Verify conversation exists
  const conv = await getConversation(conversationId);
  if (!conv) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Conversation not found",
        timestamp: _now(),
      })
    );
    ws.close(4004);
    return;
  }

  // Replay existing messages — skip ephemeral live-only events but DO
  // replay system messages ("Crew assembled", "Planning...") and complete
  // messages (final output) so returning users see the full picture.
  const existingMessages: Array<Record<string, unknown>> =
    (conv.messages as any[]) || [];
  for (const m of existingMessages) {
    const sender = (m.sender as string) || "system";
    const msgType = (m.type as string) || "message";
    if (EPHEMERAL_TYPES.has(msgType)) continue;

    const content = (m.content as string) || "";
    if (!content) continue;

    let wsType: string;
    if (msgType === "message" && sender === "user") wsType = "user_message";
    else if (msgType === "message") wsType = "agent_message";
    else wsType = msgType; // system, question, complete, answer, error, thinking, tool_call, tool_result

    const replayMsg: Record<string, unknown> = {
      type: wsType,
      sender,
      content,
      timestamp: (m.timestamp as string) || _now(),
      replayed: true,
    };
    // Include attachments on user messages
    const rawAtt = m.attachments as Array<Record<string, unknown>> | undefined;
    if (rawAtt?.length) replayMsg.attachments = rawAtt;
    const meta = (m.metadata as Record<string, unknown>) || {};
    if (meta.isReply) replayMsg.isReply = true;
    // For tool_call / tool_result, forward the tool name
    if (meta.tool) replayMsg.tool = meta.tool;
    // For complete messages, include the output field
    if (wsType === "complete" && meta.output) {
      replayMsg.output = meta.output;
      replayMsg.runId = (meta.runId as string) || "";
    }
    if (wsType === "question") {
      if (meta.options) replayMsg.options = meta.options;
      if (meta.selectionType) replayMsg.selectionType = meta.selectionType;
    }

    try {
      ws.send(JSON.stringify(replayMsg));
    } catch {
      break; // Client disconnected during replay
    }
  }

  // Per-connection state
  let pendingQuestions = new Map<string, {
    resolve: (answer: string) => void;
    reject: (error: Error) => void;
  }>();
  let runInProgress = false;
  let leadAgentConfig: AgentConfig | null = null;
  let activeCrewAgents: AgentConfig[] = [];

  // ── Restore agent state from conversation history ────────────
  // If this conversation already had a completed run, restore leadAgentConfig
  // and activeCrewAgents so follow-up messages go to the reply path (with tools)
  // instead of triggering a whole new crew selection + planning flow.
  const hasCompletedRun = existingMessages.some(
    (m) => (m.type as string) === "complete"
  );
  if (hasCompletedRun) {
    // Collect unique agent names from previous messages
    const agentSenders = new Set<string>();
    let firstAgentSender: string | null = null;
    for (const m of existingMessages) {
      const sender = (m.sender as string) || "";
      const mType = (m.type as string) || "";
      // Agent messages have type "message" with a non-"user"/"system" sender
      if (
        mType === "message" &&
        sender &&
        sender !== "user" &&
        sender !== "system"
      ) {
        agentSenders.add(sender);
        if (!firstAgentSender) firstAgentSender = sender;
      }
    }

    if (agentSenders.size > 0) {
      try {
        const allAgents = await listAgentsFull();
        // Match agent configs by name (case-insensitive)
        activeCrewAgents = allAgents.filter((a) =>
          agentSenders.has(a.name) ||
          [...agentSenders].some((s) => s.toLowerCase() === a.name.toLowerCase())
        );
        // Lead agent = the first agent that appeared in the conversation
        leadAgentConfig =
          activeCrewAgents.find(
            (a) => a.name.toLowerCase() === (firstAgentSender || "").toLowerCase()
          ) ||
          activeCrewAgents[0] ||
          null;

        if (leadAgentConfig) {
          console.log(
            `Restored agent state for conversation ${conversationId}: ` +
            `lead=${leadAgentConfig.name}, crew=[${activeCrewAgents.map((a) => a.name).join(", ")}]`
          );
        }
      } catch (e: any) {
        console.warn(`Failed to restore agent state: ${e.message}`);
      }
    }
  }

  // Mutable reference for the send callback — allows detaching when WS closes
  // while the run continues in the background.
  let _wsRef: { ws: WebSocket | null } = { ws };

  function send(msg: Record<string, unknown>) {
    const socket = _wsRef.ws;
    if (!socket) return; // Detached — run is continuing in background
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // Socket closed
    }
  }

  // ── Check for an existing active run on this conversation ──────
  const existingRun = _activeRuns.get(conversationId);
  if (existingRun && !existingRun.done) {
    console.log(`Reattaching WS to active run on conversation ${conversationId}`);
    // Reattach the send function so the running task can push to the new WS
    existingRun.wsRef.ws = ws;
    _wsRef = existingRun.wsRef;
    runInProgress = true;
    pendingQuestions = existingRun.pendingQuestions;
    leadAgentConfig = existingRun.leadAgentConfig;
    activeCrewAgents = existingRun.activeCrewAgents;

    // Let the client know a run is already in progress
    try {
      ws.send(JSON.stringify({
        type: "status",
        status: "running",
        runId: existingRun.runId || "",
        timestamp: _now(),
        reattached: true,
      }));
    } catch {
      // Client disconnected
    }
  }

  // Ask the user a question and wait for the answer
  function askUser(
    content: string,
    extra?: Record<string, unknown>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const qId = _msgKey();
      const msg: Record<string, unknown> = {
        type: "question",
        sender: "system",
        content,
        questionId: qId,
        timestamp: _now(),
        ...extra,
      };
      send(msg);

      // Persist
      const persistMsg: Record<string, unknown> = {
        _key: _msgKey(),
        sender: "system",
        type: "question",
        content,
        timestamp: _now(),
      };
      if (extra?.options || extra?.selectionType) {
        persistMsg.metadata = {
          ...(extra.options ? { options: extra.options } : {}),
          ...(extra.selectionType ? { selectionType: extra.selectionType } : {}),
        };
      }
      appendMessage(conversationId, persistMsg).catch(() => {});
      updateConversationStatus(conversationId, "awaiting_input").catch(() => {});

      pendingQuestions.set(qId, { resolve, reject });

      // Timeout after 10 minutes
      setTimeout(() => {
        if (pendingQuestions.has(qId)) {
          pendingQuestions.delete(qId);
          send({
            type: "error",
            message: "Timed out waiting for answer",
            timestamp: _now(),
          });
          reject(new Error("Timed out waiting for answer"));
        }
      }, 600_000);
    });
  }

  // Build conversation context for continuity
  async function buildConversationContext(): Promise<string> {
    const conv = await getConversation(conversationId);
    if (!conv) return "";

    const runSummary = (conv.lastRunSummary as string) || "";
    const msgs = (conv.messages as Array<Record<string, unknown>>) || [];

    if (runSummary) {
      const postSummaryUserMsgs: string[] = [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        const mtype = (m.type as string) || "";
        const content = (m.content as string) || "";
        const sender = (m.sender as string) || "";
        if (mtype === "system" && content.includes("Run completed")) break;
        if (sender === "user" && content) {
          postSummaryUserMsgs.push(`[user]: ${content}`);
        }
      }
      postSummaryUserMsgs.reverse();

      const parts = [`PREVIOUS RUN SUMMARY:\n${runSummary}`];
      if (postSummaryUserMsgs.length) {
        parts.push("RECENT USER MESSAGES:\n" + postSummaryUserMsgs.join("\n"));
      }
      return parts.join("\n\n");
    }

    // Fallback: raw message extraction
    const significant: string[] = [];
    for (const m of msgs) {
      const mtype = (m.type as string) || "";
      const sender = (m.sender as string) || "";
      let content = (m.content as string) || "";
      if (!content || ["thinking", "status", "system", "question"].includes(mtype)) {
        continue;
      }
      if (sender === "user" || ["message", "agent_message"].includes(mtype)) {
        if (content.length > 2000) content = content.slice(0, 2000) + "\n... [truncated]";
        significant.push(`[${sender}]: ${content}`);
      }
    }
    return significant.slice(-8).join("\n\n");
  }

  // Find agent mentioned by name in a message
  function findMentionedAgent(message: string): AgentConfig | null {
    if (!activeCrewAgents.length) return null;
    const msgLower = message.toLowerCase();
    let best: AgentConfig | null = null;
    let bestLen = 0;

    for (const agent of activeCrewAgents) {
      for (const key of ["name", "role"] as const) {
        const candidate = (agent[key] || "").trim();
        if (candidate.length < 3) continue;
        if (msgLower.includes(candidate.toLowerCase())) {
          if (candidate.length > bestLen) {
            best = agent;
            bestLen = candidate.length;
          }
        }
      }
    }
    return best;
  }

  // ── Run a crew ────────────────────────────────────────────

  async function executeRun(objective: string, userInputs: Record<string, unknown>) {
    try {
      await executeRunInner(objective, userInputs);
    } catch (fatal: any) {
      console.error(`Crew run failed: ${fatal.message}`);
      send({
        type: "error",
        message: `Something went wrong: ${fatal.message}`,
        timestamp: _now(),
      });
      await updateConversationStatus(conversationId, "active").catch(() => {});
    } finally {
      runInProgress = false;
      // Clean up global registry when the run finishes
      const state = _activeRuns.get(conversationId);
      if (state) {
        state.done = true;
        _activeRuns.delete(conversationId);
      }
    }
  }

  async function executeRunInner(
    objective: string,
    userInputs: Record<string, unknown>
  ) {
    const planner = await getPlanner();
    const memoryPolicy = await getMemoryPolicy();

    if (!planner) {
      send({ type: "error", message: "No crew planner configured", timestamp: _now() });
      return;
    }

    const allAgents = await listAgentsFull();

    // Filter out memory agent
    let memoryAgentId: string | null = null;
    if (memoryPolicy?.agent) {
      memoryAgentId = memoryPolicy.agent._id;
    }
    let agents = allAgents.filter((a) => a._id !== memoryAgentId);

    // Build conversation context
    const conversationContext = await buildConversationContext();
    let enrichedObjective = objective;
    if (conversationContext) {
      enrichedObjective =
        `CONVERSATION HISTORY (previous messages in this thread):\n${conversationContext}\n\n---\n\nNEW USER REQUEST:\n${objective}`;
    }

    // ── Fetch attachment content and append to objective ─────
    const rawAttachments = userInputs.attachments as Array<{
      url?: string; filename?: string; mimeType?: string;
    }> | undefined;
    if (rawAttachments?.length) {
      let attachBlock = "\n\nATTACHED FILES:\n";
      for (const att of rawAttachments) {
        if (!att.url) continue;
        const fname = att.filename || "file";
        const mime = att.mimeType || "";
        try {
          if (mime.startsWith("image/")) {
            // For images, just note the URL — the agent can use fetch_webpage_content if needed
            attachBlock += `- [Image] ${fname}: ${att.url}\n`;
          } else {
            // For text-based files, fetch and inline the content
            const resp = await fetch(att.url, { signal: AbortSignal.timeout(15_000) });
            if (resp.ok) {
              let text = await resp.text();
              if (text.length > 8000) text = text.slice(0, 8000) + "\n... [truncated]";
              attachBlock += `- ${fname}:\n\`\`\`\n${text}\n\`\`\`\n\n`;
            } else {
              attachBlock += `- ${fname}: (could not fetch — HTTP ${resp.status})\n`;
            }
          }
        } catch (e: any) {
          attachBlock += `- ${fname}: (could not fetch — ${e.message})\n`;
        }
      }
      enrichedObjective += attachBlock;
    }

    // ── Crew selection ──────────────────────────────────────
    const availableCrews = await listCrews();
    let selectedCrewId: string | null = null;

    // Deduplicate
    const seenLabels = new Set<string>();
    const dedupedCrews = availableCrews.filter((c) => {
      const label = (c.displayName || c.name).trim().toLowerCase();
      if (seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    });

    if (dedupedCrews.length) {
      const crewOptions = [
        ...dedupedCrews.map((c) => ({
          value: c._id,
          label: c.displayName || c.name,
          description: (c.description || "").slice(0, 120),
        })),
        {
          value: "__planner__",
          label: "Let AI decide",
          description: "The planner will assemble a custom crew for this task",
        },
      ];

      const crewAnswer = await askUser(
        "Would you like to use an existing crew, or let the AI planner assemble one?",
        { options: crewOptions, selectionType: "radio" }
      );

      const trimmed = crewAnswer.trim();
      if (trimmed && trimmed !== "__planner__") {
        if (dedupedCrews.some((c) => c._id === trimmed)) {
          selectedCrewId = trimmed;
        }
      }
    }

    // ── Skill selection ─────────────────────────────────────
    const allSkills = await listAllSkills();
    let selectedSkills: SkillConfig[] = [];

    if (allSkills.length) {
      const keywords = objective.split(/\s+/).slice(0, 5).join(" ");
      const searchedSkills = await searchSkills(keywords, undefined, 10);

      const seenIds = new Set<string>();
      const merged = [...searchedSkills, ...allSkills].filter((s) => {
        if (seenIds.has(s._id)) return false;
        seenIds.add(s._id);
        return true;
      });

      if (merged.length) {
        const skillOptions = [
          ...merged.map((s) => ({
            value: s._id,
            label: s.name,
            description: (s.description || "").slice(0, 120),
          })),
          {
            value: "__none__",
            label: "None — skip skills",
            description: "Proceed without applying any predefined skill playbooks",
          },
        ];

        const skillAnswer = await askUser(
          "Found skill playbooks that may be useful. Select any to apply (or skip):",
          { options: skillOptions, selectionType: "checkbox" }
        );

        if (skillAnswer.trim() !== "__none__") {
          let pickedIds: Set<string>;
          try {
            const parsed = JSON.parse(skillAnswer);
            pickedIds = new Set(Array.isArray(parsed) ? parsed : [String(parsed)]);
          } catch {
            pickedIds = new Set(
              skillAnswer.split(",").map((s) => s.trim()).filter(Boolean)
            );
          }
          pickedIds.delete("__none__");
          selectedSkills = merged.filter((s) => pickedIds.has(s._id));
        }
      }
    }

    // Inject skill context
    if (selectedSkills.length) {
      let skillBlock = "\n\nSKILL PLAYBOOKS TO FOLLOW:\n";
      for (const sk of selectedSkills) {
        const steps = sk.steps as string[] | undefined;
        const stepsText = steps?.length ? `\n  Steps: ${steps.join(" → ")}` : "";
        skillBlock += `- ${sk.name}: ${sk.description || ""}${stepsText}\n`;
      }
      enrichedObjective += skillBlock;
    }

    // ── Planning ────────────────────────────────────────────
    send({ type: "system", content: "Planning your workflow...", timestamp: _now() });
    await appendMessage(conversationId, {
      _key: _msgKey(),
      sender: "system",
      type: "system",
      content: "Planning your workflow...",
      timestamp: _now(),
    });

    let plan;
    try {
      plan = await planCrew(enrichedObjective, userInputs as Record<string, unknown>, agents, planner);
    } catch (e: any) {
      send({ type: "error", message: `Planning failed: ${e.message}`, timestamp: _now() });
      return;
    }

    // ── Clarifying questions ────────────────────────────────
    if (plan.questions?.length) {
      const combinedQ = plan.questions.join("\n- ");
      const answer = await askUser(`Clarifying questions:\n- ${combinedQ}`);
      enrichedObjective += `\n\nAdditional context from user:\n${answer}`;
      userInputs.clarification = answer;
    }

    // ── Resolve agents ──────────────────────────────────────
    function resolve(rawId: string): string | null {
      if (agents.some((a) => a._id === rawId)) return rawId;
      const norm = rawId.toLowerCase().replace(/[-_]/g, " ");
      for (const a of agents) {
        const aid = a._id.toLowerCase();
        if (norm.includes(aid) || aid.includes(norm)) return a._id;
        if (norm.includes(a.name.toLowerCase()) || norm.includes(a.role.toLowerCase())) {
          return a._id;
        }
      }
      return null;
    }

    const resolvedIds = new Set<string>();
    for (const raw of plan.agents) {
      const r = resolve(raw);
      if (r) resolvedIds.add(r);
    }

    let plannedAgents = agents.filter((a) => resolvedIds.has(a._id));
    if (!plannedAgents.length) {
      plannedAgents = agents;
    }

    // Set lead agent and active crew agents
    activeCrewAgents = plannedAgents;
    const firstTaskAgentId = plan.tasks.length
      ? resolve(plan.tasks.sort((a, b) => a.order - b.order)[0].agentId)
      : null;
    leadAgentConfig =
      (firstTaskAgentId ? agents.find((a) => a._id === firstTaskAgentId) : null) ||
      plannedAgents[0] ||
      null;

    // Inject memory agent if configured
    if (memoryPolicy && memoryAgentId) {
      if (!plannedAgents.some((a) => a._id === memoryAgentId)) {
        const memAgent = allAgents.find((a) => a._id === memoryAgentId);
        if (memAgent) plannedAgents.push(memAgent);
      }
    }

    // Resolve task agent IDs
    const fallbackId = plannedAgents[0]?._id;
    const resolvedTasks = plan.tasks.map((task) => ({
      ...task,
      agentId: resolve(task.agentId) || fallbackId || task.agentId,
    }));

    // Fetch credentials
    const credentials = await getAllCredentials();

    // Create run document
    const runId = await createRun({
      crewId: selectedCrewId || "crew-planned",
      inputs: userInputs,
      triggeredBy: "conversation",
      objective,
      status: "running",
      conversationId,
    });
    await addRunToConversation(conversationId, runId);
    send({ type: "status", status: "running", runId, timestamp: _now() });
    await updateRunStatus(runId, "running", { startedAt: _now() });

    // Update global registry with runId for reattach support
    const runState = _activeRuns.get(conversationId);
    if (runState) {
      runState.runId = runId;
      runState.leadAgentConfig = leadAgentConfig;
      runState.activeCrewAgents = activeCrewAgents;
    }

    // ── Execute crew ────────────────────────────────────────
    const runnerConfig: RunnerConfig = {
      agents: plannedAgents,
      tasks: resolvedTasks,
      process: plan.process,
      credentials,
      memoryPolicy,
    };

    try {
      for await (const event of runCrew(runnerConfig, {
        ...userInputs,
        objective: enrichedObjective,
        topic: objective,
      })) {
        const evtType = event.event;

        if (evtType === "agent_message") {
          const wsType = event.type || "agent_message";
          const out: Record<string, unknown> = {
            type: wsType,
            sender: event.agent || "Agent",
            content: event.content || "",
            timestamp: event.timestamp || _now(),
          };
          if (event.tool) out.tool = event.tool;
          send(out);

          // Persist all non-status messages so they replay on reconnect
          if (!EPHEMERAL_TYPES.has(wsType)) {
            await appendMessage(conversationId, {
              _key: _msgKey(),
              sender: event.agent || "Agent",
              type: wsType,
              content: event.content || "",
              metadata: {
                runId,
                ...(event.tool ? { tool: event.tool } : {}),
              },
              timestamp: event.timestamp || _now(),
            });
          }
        } else if (evtType === "complete") {
          const output = event.finalOutput || "";
          await updateRunStatus(runId, "completed", {
            completedAt: _now(),
            output,
          });
          send({
            type: "complete",
            runId,
            output,
            timestamp: _now(),
          });
          // Persist the final output as a "complete" message so it
          // can be replayed when the user returns to this conversation.
          await appendMessage(conversationId, {
            _key: _msgKey(),
            sender: "system",
            type: "complete",
            content: output.length > 200 ? output.slice(0, 200) + "…" : output,
            metadata: { runId, output },
            timestamp: _now(),
          });
          // Also persist the "Run completed" system message
          await appendMessage(conversationId, {
            _key: _msgKey(),
            sender: "system",
            type: "system",
            content: "Run completed.",
            metadata: { runId },
            timestamp: _now(),
          });

          // Generate run summary
          try {
            const conv = await getConversation(conversationId);
            const convMsgs = ((conv?.messages as any[]) || []) as Array<
              Record<string, unknown>
            >;
            const memModel = memoryPolicy?.agent?.llmModel;
            const summary = await generateRunSummary(
              objective,
              output,
              convMsgs,
              memModel
            );
            if (summary) {
              await updateConversationSummary(conversationId, summary);
            }
          } catch (e: any) {
            console.warn(`Non-critical: failed to generate run summary: ${e.message}`);
          }
        } else if (evtType === "error") {
          await updateRunStatus(runId, "failed", {
            error: { message: event.message || "Unknown error" },
          });
          send({
            type: "error",
            message: event.message || "Unknown error",
            timestamp: _now(),
          });
        }
      }
    } catch (e: any) {
      await updateRunStatus(runId, "failed", { error: { message: e.message } });
      send({ type: "error", message: e.message, timestamp: _now() });
    }
  }

  // ── Message receive loop ──────────────────────────────────

  ws.on("message", async (raw) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      send({ type: "error", message: "Invalid JSON", timestamp: _now() });
      return;
    }

    const msgType = data.type as string;
    if (msgType === "ping") return;

    const content = ((data.content as string) || "").trim();
    const attachments = (data.attachments as Array<{
      assetId?: string; url?: string; filename?: string; mimeType?: string; size?: number;
    }>) || [];

    if ((msgType === "user_message" || msgType === "answer") && (content || attachments.length)) {
      // Persist user message (with attachments if any)
      const persistMsg: Record<string, unknown> = {
        _key: _msgKey(),
        sender: "user",
        type: msgType === "answer" ? "answer" : "message",
        content: content || "(attached files)",
        timestamp: _now(),
      };
      if (attachments.length) {
        persistMsg.attachments = attachments.map((a) => ({
          _key: _msgKey(),
          assetId: a.assetId || "",
          url: a.url || "",
          filename: a.filename || "",
          mimeType: a.mimeType || "",
          size: a.size || 0,
        }));
      }
      await appendMessage(conversationId, persistMsg);

      // Update title from first message
      if (msgType === "user_message") {
        const c = await getConversation(conversationId);
        if (c && (!c.title || c.title === "New Conversation")) {
          const short = content.slice(0, 80) + (content.length > 80 ? "…" : "");
          await updateConversationTitle(conversationId, short);
        }
      }

      // Route the message
      if (pendingQuestions.size > 0) {
        const qId = data.questionId as string;
        if (qId && pendingQuestions.has(qId)) {
          pendingQuestions.get(qId)!.resolve(content);
          pendingQuestions.delete(qId);
        } else {
          // Resolve all pending questions
          for (const [qid, handler] of pendingQuestions) {
            handler.resolve(content);
          }
          pendingQuestions.clear();
        }
        await updateConversationStatus(conversationId, "active").catch(() => {});
      } else if (runInProgress) {
        // Run in progress — quick text reply as mentioned/lead agent (no tools)
        const mentioned = findMentionedAgent(content);
        const responder = mentioned || leadAgentConfig;
        if (responder) {
          const convSnapshot = await getConversation(conversationId);
          const recent = ((convSnapshot?.messages as any[]) || []).slice(-12);
          const { name: agentName, reply } = await agentReplySimple(responder, content, recent);
          send({
            type: "agent_message",
            sender: agentName,
            content: reply,
            isReply: true,
            timestamp: _now(),
          });
          await appendMessage(conversationId, {
            _key: _msgKey(),
            sender: agentName,
            type: "message",
            content: reply,
            metadata: { isReply: true },
            timestamp: _now(),
          });
        }
      } else if (leadAgentConfig) {
        // Previous run completed — reply with TOOLS so agent can
        // look things up, verify data, etc. on follow-up requests
        const mentioned = findMentionedAgent(content);
        const responder = mentioned || leadAgentConfig;
        const convSnapshot = await getConversation(conversationId);
        const recent = ((convSnapshot?.messages as any[]) || []).slice(-12);
        const credentials = await getAllCredentials();

        // Persist tool events as they happen
        const toolSend = (evt: Record<string, unknown>) => {
          send(evt);
          appendMessage(conversationId, {
            _key: _msgKey(),
            sender: (evt.sender as string) || responder.name || "Agent",
            type: (evt.type as string) || "tool_call",
            content: (evt.content as string) || "",
            metadata: { isReply: true, ...(evt.tool ? { tool: evt.tool } : {}) },
            timestamp: (evt.timestamp as string) || _now(),
          }).catch(() => {});
        };

        const { name: agentName, reply } = await agentReplyWithTools(
          responder, credentials, content, recent, toolSend
        );
        send({
          type: "agent_message",
          sender: agentName,
          content: reply,
          isReply: true,
          timestamp: _now(),
        });
        await appendMessage(conversationId, {
          _key: _msgKey(),
          sender: agentName,
          type: "message",
          content: reply,
          metadata: { isReply: true },
          timestamp: _now(),
        });
      } else {
        // First message — kick off a run
        runInProgress = true;
        // Register in global run registry so the run survives WS disconnect
        _activeRuns.set(conversationId, {
          wsRef: _wsRef,
          pendingQuestions,
          leadAgentConfig,
          activeCrewAgents,
          done: false,
        });
        const runInputs: Record<string, unknown> = { objective: content, topic: content };
        if (attachments.length) {
          runInputs.attachments = attachments;
        }
        executeRun(content, runInputs);
      }
    }
  });

  ws.on("close", () => {
    console.log(`WS disconnected for conversation ${conversationId}`);
    // Detach the WS from the run — the run continues in the background,
    // persisting results to Sanity. A new WS connection can reattach later.
    _wsRef.ws = null;

    // If there's NO active run (or it's already done), clean up fully.
    if (!runInProgress) {
      _activeRuns.delete(conversationId);
      for (const [, handler] of pendingQuestions) {
        handler.reject(new Error("WebSocket closed"));
      }
      pendingQuestions.clear();
    }
    // Otherwise: run still going — it stays in _activeRuns, events keep
    // being persisted to Sanity, and a new WS can reattach.
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error: ${err.message}`);
  });
}
