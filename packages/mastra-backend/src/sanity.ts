/**
 * Sanity client for reading agent, crew, tool, and planner configurations.
 *
 * Mirrors the Python SanityClient queries so the Mastra backend can
 * consume the same Sanity documents as the FastAPI backend.
 */

import { createClient, type SanityClient } from "@sanity/client";

export interface SanityConfig {
  projectId: string;
  dataset: string;
  apiToken: string;
  apiVersion?: string;
}

export interface AgentConfig {
  _id: string;
  name: string;
  role: string;
  goal?: string;
  expertise?: string;
  philosophy?: string;
  thingsToAvoid?: string[];
  usefulUrls?: string[];
  outputStyle?: string;
  backstory?: string;
  llmModel?: string;
  knowledgeDocuments?: Array<{
    title?: string;
    description?: string;
    extractedSummary?: string;
    assetUrl?: string;
    assetRef?: string;
    originalFilename?: string;
  }>;
  tools?: ToolConfig[];
}

export interface ToolConfig {
  _id: string;
  name: string;
  displayName?: string;
  description?: string;
  implementationType?: string;
  credentialTypes?: string[];
  parameters?: Array<{ name: string; type: string; required?: boolean }>;
  httpConfig?: Record<string, unknown>;
}

export interface CrewConfig {
  _id: string;
  name: string;
  displayName?: string;
  slug?: string;
  description?: string;
  agentCount?: number;
}

export interface PlannerConfig {
  _id: string;
  name: string;
  model: string;
  systemPrompt: string;
  maxAgents: number;
  process: string;
  usePlannerByDefault?: boolean;
}

export interface MemoryPolicyConfig {
  _id: string;
  name: string;
  agent?: AgentConfig;
}

export interface CredentialConfig {
  _id: string;
  name: string;
  type: string;
  storageMethod: string;
  environment?: string;
  [key: string]: unknown; // various credential fields
}

export interface SkillConfig {
  _id: string;
  name: string;
  description?: string;
  steps?: string[];
  tags?: string[];
  toolsRequired?: string[];
  inputSchema?: Array<Record<string, unknown>>;
  outputSchema?: string;
}

export interface McpServerConfig {
  _id: string;
  name: string;
  displayName?: string;
  description?: string;
  transport: "stdio" | "http" | "websocket";
  command?: string;
  args?: string[];
  url?: string;
  env?: Array<{
    key: string;
    value?: string;
    fromCredential?: Record<string, unknown>;
  }>;
  tools?: string[];
  timeout?: number;
}

// ─── Client ───────────────────────────────────────────────────

let _client: SanityClient | null = null;

export function getSanityClient(config?: SanityConfig): SanityClient {
  if (_client) return _client;

  const projectId = config?.projectId ?? process.env.SANITY_PROJECT_ID ?? "";
  const dataset = config?.dataset ?? process.env.SANITY_DATASET ?? "production";
  const token = config?.apiToken ?? process.env.SANITY_API_TOKEN ?? "";

  if (!projectId || !token) {
    throw new Error(
      "Missing SANITY_PROJECT_ID or SANITY_API_TOKEN. " +
        "Set them as environment variables or pass a SanityConfig."
    );
  }

  _client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: config?.apiVersion ?? "2024-01-01",
    useCdn: false,
  });

  return _client;
}

// ─── Queries ──────────────────────────────────────────────────

export async function listCrews(): Promise<CrewConfig[]> {
  const client = getSanityClient();
  return (
    (await client.fetch<CrewConfig[]>(
      `*[_type == "crew" && enabled != false] {
        _id, name, displayName, slug, description,
        "agentCount": count(agents)
      }`
    )) ?? []
  );
}

export async function listAgentsFull(): Promise<AgentConfig[]> {
  const client = getSanityClient();
  return (
    (await client.fetch<AgentConfig[]>(
      `*[_type == "agent"] {
        _id, name, role, goal, expertise, philosophy,
        thingsToAvoid, usefulUrls, outputStyle, backstory, llmModel,
        knowledgeDocuments[] {
          title, description, extractedSummary,
          "assetUrl": asset->url,
          "assetRef": asset._ref,
          "originalFilename": asset->originalFilename
        },
        tools[]->{
          _id, name, displayName, description,
          implementationType, credentialTypes, parameters, httpConfig
        }
      }`
    )) ?? []
  );
}

export async function getPlanner(): Promise<PlannerConfig | null> {
  const client = getSanityClient();
  return client.fetch<PlannerConfig | null>(
    `*[_type == "crewPlanner" && enabled == true][0] {
      _id, name, model, systemPrompt, maxAgents, process, usePlannerByDefault
    }`
  );
}

export async function getMemoryPolicy(): Promise<MemoryPolicyConfig | null> {
  const client = getSanityClient();
  return client.fetch<MemoryPolicyConfig | null>(
    `*[_type == "memoryPolicy" && enabled == true][0] {
      _id, name,
      agent->{
        _id, name, role, goal, expertise, philosophy,
        thingsToAvoid, usefulUrls, outputStyle, backstory, llmModel
      }
    }`
  );
}

export async function getAllCredentials(): Promise<CredentialConfig[]> {
  const client = getSanityClient();
  return (
    (await client.fetch<CredentialConfig[]>(
      `*[_type == "credential"] {
        _id, name, type, storageMethod, environment,
        anthropicApiKey, openaiApiKey, braveApiKey, serpApiKey,
        semrushApiKey, googleApiKey, hunterApiKey, clearbitApiKey,
        githubPersonalAccessToken,
        sanityApiToken, sanityProjectId, sanityDataset,
        slackWebhookUrl,
        bigqueryCredentialsFile, bigqueryTables,
        gscKeyFile, gscSiteUrl,
        googleAdsDeveloperToken, googleAdsClientId, googleAdsClientSecret,
        googleAdsRefreshToken, googleAdsCustomerId,
        redditClientId, redditClientSecret, redditUserAgent
      }`
    )) ?? []
  );
}

export async function listAllSkills(): Promise<SkillConfig[]> {
  const client = getSanityClient();
  return (
    (await client.fetch<SkillConfig[]>(
      `*[_type == "skill" && enabled != false] | order(_updatedAt desc) {
        _id, name, description, steps, tags, toolsRequired, inputSchema, outputSchema
      }`
    )) ?? []
  );
}

export async function searchSkills(
  query?: string,
  tags?: string[],
  limit = 10
): Promise<SkillConfig[]> {
  const client = getSanityClient();
  const filters = ['_type == "skill"', "enabled == true"];
  const params: Record<string, unknown> = { limit };

  if (query) {
    filters.push("name match $q || description match $q || $q in tags");
    params.q = `*${query}*`;
  }
  if (tags?.length) {
    filters.push("count(tags[@ in $tags]) > 0");
    params.tags = tags;
  }

  const groq = `*[${filters.join(" && ")}] | order(_updatedAt desc) [0...$limit] {
    _id, name, description, steps, tags, toolsRequired, inputSchema, outputSchema
  }`;
  return (await client.fetch<SkillConfig[]>(groq, params)) ?? [];
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  const client = getSanityClient();
  return (
    (await client.fetch<McpServerConfig[]>(
      `*[_type == "mcpServer" && enabled == true] {
        _id, name, displayName, description, transport,
        command, args, url,
        env[]{
          key, value,
          "fromCredential": fromCredential->{
            _id, type, storageMethod,
            openaiApiKey, anthropicApiKey, braveApiKey, serpApiKey,
            semrushApiKey, googleApiKey, hunterApiKey, clearbitApiKey,
            githubPersonalAccessToken,
            sanityApiToken, sanityProjectId, sanityDataset,
            slackWebhookUrl
          }
        },
        tools, timeout
      }`
    )) ?? []
  );
}

// ─── Conversation / Run mutations ─────────────────────────────

export async function getConversation(convId: string) {
  const client = getSanityClient();
  return client.fetch(
    `*[_type == "conversation" && _id == $id][0] {
      _id, title, status, messages, runs, activeRunId, metadata, lastRunSummary, _createdAt
    }`,
    { id: convId }
  );
}

export async function appendMessage(
  convId: string,
  message: Record<string, unknown>
) {
  const client = getSanityClient();
  if (!message._key) {
    message._key = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  await client
    .patch(convId)
    .setIfMissing({ messages: [] })
    .insert("after", "messages[-1]", [message])
    .commit();
}

export async function updateConversationStatus(convId: string, status: string) {
  const client = getSanityClient();
  await client.patch(convId).set({ status }).commit();
}

export async function updateConversationTitle(convId: string, title: string) {
  const client = getSanityClient();
  await client.patch(convId).set({ title }).commit();
}

export async function updateConversationSummary(
  convId: string,
  summary: string
) {
  const client = getSanityClient();
  await client.patch(convId).set({ lastRunSummary: summary }).commit();
}

export async function createRun(opts: {
  crewId?: string;
  inputs?: Record<string, unknown>;
  triggeredBy?: string;
  objective?: string;
  status?: string;
  conversationId?: string;
}): Promise<string> {
  const client = getSanityClient();
  const runId = `run-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const inputs = opts.inputs ?? {};

  const doc: Record<string, unknown> = {
    _id: runId,
    _type: "run",
    status: opts.status ?? "pending",
    inputs: {
      topic:
        (inputs.topic as string) || (inputs.objective as string) || "",
    },
  };

  if (opts.objective) doc.objective = opts.objective;
  if (opts.crewId && !opts.crewId.startsWith("crew-planned")) {
    doc.crew = { _type: "reference", _ref: opts.crewId };
  }
  if (opts.conversationId) {
    doc.conversation = { _type: "reference", _ref: opts.conversationId };
  }
  if (opts.triggeredBy) {
    doc.metadata = { triggeredBy: opts.triggeredBy };
  }

  await client.createOrReplace(doc as any);
  return runId;
}

export async function updateRunStatus(
  runId: string,
  status: string,
  extra?: Record<string, unknown>
) {
  const client = getSanityClient();
  const patch: Record<string, unknown> = { status, ...extra };
  await client.createIfNotExists({ _id: runId, _type: "run", status } as any);
  await client.patch(runId).set(patch).commit();
}

export async function addRunToConversation(convId: string, runId: string) {
  const client = getSanityClient();
  const key = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  await client
    .patch(convId)
    .set({ activeRunId: runId })
    .setIfMissing({ runs: [] })
    .insert("after", "runs[-1]", [
      { _type: "reference", _ref: runId, _key: key },
    ])
    .commit();
}

// ─── Credential resolution ────────────────────────────────────

export function resolveCredentialValue(
  credential: CredentialConfig,
  field: string
): string {
  const raw = credential[field] as string | undefined;
  if (!raw) throw new Error(`Missing credential field: ${field}`);

  const method = credential.storageMethod ?? "env";
  if (method === "env") {
    const envVal = process.env[raw];
    if (!envVal) {
      throw new Error(`Env var '${raw}' not set for credential field '${field}'`);
    }
    return envVal;
  }
  return raw;
}
