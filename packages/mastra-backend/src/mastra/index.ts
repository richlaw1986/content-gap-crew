/**
 * Mastra instance configuration.
 *
 * This is the central Mastra setup. Unlike typical Mastra apps where agents
 * and tools are static, we build agents dynamically from Sanity config,
 * so this is intentionally lightweight.
 */

export { ALL_TOOLS } from "./tools/index.js";
export { buildAgentFromConfig, buildAllAgents } from "./agents/index.js";
