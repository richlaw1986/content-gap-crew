/**
 * MCP (Model Context Protocol) client integration.
 * Port of apps/api/app/services/mcp_client.py
 *
 * Connects to MCP servers (stdio or HTTP) and wraps their tools
 * as Mastra-compatible tool functions.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { spawn, type ChildProcess } from "child_process";
import type { McpServerConfig } from "../sanity.js";

// ─── Env resolution ───────────────────────────────────────────

const CRED_FIELD_MAP: Record<string, string> = {
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey",
  brave: "braveApiKey",
  serpapi: "serpApiKey",
  semrush: "semrushApiKey",
  google_api: "googleApiKey",
  hunter: "hunterApiKey",
  clearbit: "clearbitApiKey",
  github: "githubPersonalAccessToken",
  sanity: "sanityApiToken",
  slack: "slackWebhookUrl",
};

function resolveMcpEnv(
  envEntries?: McpServerConfig["env"]
): Record<string, string> {
  if (!envEntries) return {};
  const result: Record<string, string> = {};

  for (const entry of envEntries) {
    const key = entry.key;
    if (!key) continue;

    if (entry.value) {
      result[key] = entry.value;
      continue;
    }

    const cred = entry.fromCredential;
    if (!cred || typeof cred !== "object") continue;

    const credType = (cred.type as string) || "";
    const storage = (cred.storageMethod as string) || "env";
    let field = CRED_FIELD_MAP[credType];

    if (!field) {
      // Fallback: first non-meta field
      for (const [k, v] of Object.entries(cred)) {
        if (k.startsWith("_") || ["type", "storageMethod", "name"].includes(k))
          continue;
        if (v) {
          field = k;
          break;
        }
      }
    }

    const raw = field ? (cred[field] as string) || "" : "";
    if (!raw) continue;

    if (storage === "env") {
      result[key] = process.env[raw] || "";
    } else {
      result[key] = raw;
    }
  }

  return result;
}

// ─── Stdio MCP connection ─────────────────────────────────────

interface McpTool {
  name: string;
  description: string;
}

class StdioMcpConnection {
  private process: ChildProcess | null = null;
  private _tools: McpTool[] = [];
  private _requestId = 0;
  private _buffer = "";
  private _pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string>,
    private timeoutMs = 30000
  ) {}

  async connect(): Promise<void> {
    return new Promise<void>((resolveConnect, rejectConnect) => {
      try {
        this.process = spawn(this.command, this.args, {
          env: { ...process.env, ...this.env },
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.process.stdout?.on("data", (chunk) => {
          this._buffer += chunk.toString();
          const lines = this._buffer.split("\n");
          this._buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const resp = JSON.parse(line);
              const id = resp.id;
              if (id != null && this._pending.has(id)) {
                const { resolve } = this._pending.get(id)!;
                this._pending.delete(id);
                if (resp.error) {
                  console.warn(`MCP error: ${JSON.stringify(resp.error)}`);
                  resolve(null);
                } else {
                  resolve(resp.result);
                }
              }
            } catch {
              // Not JSON, skip
            }
          }
        });

        this.process.on("error", (err) => {
          rejectConnect(err);
        });

        // Initialize
        this.sendRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "content-gap-crew-mastra", version: "1.0" },
        })
          .then(async () => {
            const result = await this.sendRequest("tools/list", {});
            this._tools = (result?.tools || []).map((t: any) => ({
              name: t.name || "unknown",
              description: t.description || "",
            }));
            console.log(
              `MCP stdio: connected, ${this._tools.length} tools available`
            );
            resolveConnect();
          })
          .catch(rejectConnect);
      } catch (err: any) {
        rejectConnect(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error("Process not started"));
        return;
      }

      this._requestId++;
      const id = this._requestId;
      const request = { jsonrpc: "2.0", id, method, params };

      this._pending.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + "\n");

      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          resolve(null);
        }
      }, this.timeoutMs);
    });
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args,
    });
    if (result?.content) {
      return result.content
        .map((block: any) => {
          if (block.type === "text") return block.text || "";
          if (block.type === "resource") return JSON.stringify(block.resource);
          return "";
        })
        .join("\n");
    }
    return JSON.stringify(result);
  }

  get tools(): McpTool[] {
    return this._tools;
  }
}

// ─── HTTP MCP connection ──────────────────────────────────────

class HttpMcpConnection {
  private _tools: McpTool[] = [];

  constructor(
    private url: string,
    private env: Record<string, string>,
    private timeoutMs = 30000
  ) {}

  async connect(): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const authToken = this.env.AUTHORIZATION_TOKEN || this.env.API_KEY;
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    try {
      // Initialize
      await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "content-gap-crew-mastra", version: "1.0" },
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      // List tools
      const toolsResp = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const toolsData: any = await toolsResp.json();
      const tools = toolsData?.result?.tools || [];
      this._tools = tools.map((t: any) => ({
        name: t.name || "unknown",
        description: t.description || "",
      }));
      console.log(`MCP HTTP: connected to ${this.url}, ${this._tools.length} tools`);
    } catch (e: any) {
      console.warn(`MCP HTTP connection to ${this.url} failed: ${e.message}`);
    }
  }

  async disconnect(): Promise<void> {
    // HTTP is stateless
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const authToken = this.env.AUTHORIZATION_TOKEN || this.env.API_KEY;
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    try {
      const resp = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: toolName, arguments: args },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const data: any = await resp.json();
      const result = data?.result || {};
      if (result.content) {
        return result.content
          .map((block: any) => {
            if (block.type === "text") return block.text || "";
            if (block.type === "resource") return JSON.stringify(block.resource);
            return "";
          })
          .join("\n");
      }
      return JSON.stringify(result);
    } catch (e: any) {
      return `MCP HTTP tool call error: ${e.message}`;
    }
  }

  get tools(): McpTool[] {
    return this._tools;
  }
}

// ─── MCP Manager ──────────────────────────────────────────────

type McpConnection = StdioMcpConnection | HttpMcpConnection;

export class McpManager {
  private connections = new Map<string, McpConnection>();

  async connectServers(configs: McpServerConfig[]): Promise<void> {
    for (const config of configs) {
      const name = config.name || "unknown";
      const transport = config.transport || "stdio";
      const env = resolveMcpEnv(config.env);
      const timeout = config.timeout || 30000;

      try {
        if (transport === "stdio" && config.command) {
          const conn = new StdioMcpConnection(
            config.command,
            config.args || [],
            env,
            timeout
          );
          await conn.connect();
          this.connections.set(name, conn);
        } else if (transport === "http" && config.url) {
          const conn = new HttpMcpConnection(config.url, env, timeout);
          await conn.connect();
          this.connections.set(name, conn);
        } else {
          console.warn(`MCP server '${name}': unsupported transport '${transport}'`);
        }
      } catch (e: any) {
        console.warn(`Failed to connect MCP server '${name}': ${e.message}`);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [name, conn] of this.connections) {
      try {
        await conn.disconnect();
      } catch (e: any) {
        console.warn(`Error disconnecting MCP server '${name}': ${e.message}`);
      }
    }
    this.connections.clear();
  }

  /**
   * Wrap all MCP tools as Mastra-compatible tool objects.
   */
  getAllTools(): Array<{ name: string; tool: ReturnType<typeof createTool> }> {
    const allTools: Array<{ name: string; tool: ReturnType<typeof createTool> }> = [];

    for (const [serverName, conn] of this.connections) {
      for (const mcpTool of conn.tools) {
        const toolName = `mcp_${serverName}_${mcpTool.name}`;
        const callFn = (args: Record<string, unknown>) =>
          conn.callTool(mcpTool.name, args);

        const tool = createTool({
          id: toolName,
          description: `[MCP: ${serverName}] ${mcpTool.description || mcpTool.name}`,
          inputSchema: z.object({
            inputJson: z
              .string()
              .default("{}")
              .describe("JSON string of arguments to pass to the tool"),
          }),
          execute: async ({ context: { inputJson } }) => {
            try {
              const args = JSON.parse(inputJson || "{}");
              return await callFn(args);
            } catch (e: any) {
              return `MCP tool error (${serverName}/${mcpTool.name}): ${e.message}`;
            }
          },
        });

        allTools.push({ name: toolName, tool });
      }
    }

    return allTools;
  }

  get connectedServers(): string[] {
    return [...this.connections.keys()];
  }

  get totalTools(): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      count += conn.tools.length;
    }
    return count;
  }
}
