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

export interface SkillReference {
  name: string;
  content: string;
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
  /** Full narrative instructions (Markdown). Ecosystem skills store their SKILL.md here. */
  playbook?: string;
  /** Supporting reference files (brand scripts, personas, etc.) */
  references?: SkillReference[];
  source?: "local" | "ecosystem";
  ecosystemId?: string;
  ecosystemInstalls?: number;
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
        _id, name, description, steps, tags, toolsRequired, inputSchema, outputSchema,
        playbook, references[]{ name, content }, source, ecosystemId, ecosystemInstalls
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
    _id, name, description, steps, tags, toolsRequired, inputSchema, outputSchema,
    playbook, references[]{ name, content }, source, ecosystemId, ecosystemInstalls
  }`;
  return (await client.fetch<SkillConfig[]>(groq, params)) ?? [];
}

// ─── Ecosystem skills (skills.sh) ────────────────────────────

export interface EcosystemSkillResult {
  id: string;       // e.g. "coreyhaines31/marketingskills/seo-audit"
  skillId: string;  // e.g. "seo-audit"
  name: string;
  installs: number;
  source: string;   // e.g. "coreyhaines31/marketingskills"
}

/**
 * Search the skills.sh open ecosystem for skills matching a query.
 */
export async function searchEcosystemSkills(
  query: string,
  limit = 10
): Promise<EcosystemSkillResult[]> {
  try {
    const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      skills: EcosystemSkillResult[];
      count: number;
    };
    return (data.skills || []).slice(0, limit);
  } catch (e: any) {
    console.warn(`Ecosystem skill search failed: ${e.message}`);
    return [];
  }
}

/**
 * Fetch a skill's SKILL.md from GitHub, parse its frontmatter + content,
 * and install it as a Sanity "skill" document.
 */
export async function installEcosystemSkill(
  ecosystemSkill: EcosystemSkillResult
): Promise<SkillConfig | null> {
  const client = getSanityClient();
  const { id, source, installs } = ecosystemSkill;

  // e.g. source = "coreyhaines31/marketingskills", skillId = "seo-audit"
  // → raw GitHub: https://raw.githubusercontent.com/{source}/main/skills/{skillId}/SKILL.md
  const parts = id.split("/");
  const skillSlug = parts[parts.length - 1];
  const owner = parts[0];
  const repo = parts.length >= 2 ? parts[1] : "";

  // Try common branch names and skill path conventions
  const candidates = [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillSlug}/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillSlug}/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillSlug}/SKILL.md`,
  ];

  let rawMd = "";
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (resp.ok) {
        rawMd = await resp.text();
        break;
      }
    } catch {
      /* try next */
    }
  }

  // Parse YAML frontmatter + markdown body
  let name = ecosystemSkill.name;
  let description = "";
  let tags: string[] = [];
  let steps: string[] = [];

  if (rawMd) {
    const fmMatch = rawMd.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    // Extract steps from numbered lists or bullet lists under "Steps" heading
    const stepsSection = rawMd.match(/##\s*(?:Steps|How|Procedure|Process)\b[\s\S]*?(?=\n##|\n---|\z)/i);
    if (stepsSection) {
      const bullets = stepsSection[0].match(/^(?:\d+\.|[-*])\s+(.+)$/gm);
      if (bullets) {
        steps = bullets.map((b) => b.replace(/^(?:\d+\.|[-*])\s+/, "").trim());
      }
    }

    // Extract tags from frontmatter
    const tagsMatch = rawMd.match(/^tags:\s*\[([^\]]*)\]/m);
    if (tagsMatch) {
      tags = tagsMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, "")).filter(Boolean);
    }

    // If no description from frontmatter, use first paragraph after title
    if (!description) {
      const bodyAfterFm = rawMd.replace(/^---[\s\S]*?---/, "").trim();
      const firstPara = bodyAfterFm.match(/^#[^\n]*\n+([^\n#].+)/m);
      if (firstPara) description = firstPara[1].trim().slice(0, 500);
    }
  } else {
    // No SKILL.md found — use what we have from the search result
    description = `Ecosystem skill from ${source} (${installs.toLocaleString()} installs)`;
  }

  // Create a deterministic _id from the ecosystem ID
  const docId = `skill-eco-${skillSlug}-${owner}`.replace(/[^a-zA-Z0-9_-]/g, "-");

  const doc: Record<string, unknown> = {
    _id: docId,
    _type: "skill",
    name,
    description,
    steps: steps.length ? steps : undefined,
    tags: tags.length ? tags : [skillSlug],
    source: "ecosystem",
    ecosystemId: id,
    ecosystemInstalls: installs,
    enabled: true,
  };

  // Store the full SKILL.md as the playbook — this is supplementary
  // narrative context that enriches the structured fields above.
  if (rawMd) {
    doc.playbook = rawMd.slice(0, 8000);
  }

  // ── Attempt to fetch reference files ───────────────────────
  // Many skills have a references/ folder with supporting markdown files.
  // We discover them by looking for `references/*.md` links in SKILL.md,
  // or by probing common reference file names.
  const references: SkillReference[] = [];
  if (rawMd) {
    // Extract reference file names from markdown links like [xxx](references/foo.md)
    const refLinks = rawMd.matchAll(/\[([^\]]*)\]\(references\/([^)]+\.md)\)/gi);
    const refFileNames = new Set<string>();
    for (const m of refLinks) {
      refFileNames.add(m[2]); // e.g. "brandscript.md"
    }

    // Try to fetch each discovered reference file
    for (const refFile of refFileNames) {
      const refCandidates = [
        `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillSlug}/references/${refFile}`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillSlug}/references/${refFile}`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillSlug}/references/${refFile}`,
      ];
      for (const refUrl of refCandidates) {
        try {
          const refResp = await fetch(refUrl, { signal: AbortSignal.timeout(8_000) });
          if (refResp.ok) {
            const refContent = await refResp.text();
            const refName = refFile.replace(/\.md$/i, "");
            references.push({
              name: refName,
              content: refContent.slice(0, 8000),
            });
            break; // found it, skip other candidates
          }
        } catch {
          /* try next */
        }
      }
    }
  }

  if (references.length) {
    doc.references = references.map((r, i) => ({
      _key: `ref-${i}`,
      name: r.name,
      content: r.content,
    }));
  }

  try {
    await client.createOrReplace(doc as any);
    return {
      _id: docId,
      name,
      description,
      steps: steps.length ? steps : undefined,
      tags: tags.length ? tags : [skillSlug],
      playbook: rawMd ? rawMd.slice(0, 8000) : undefined,
      references: references.length ? references : undefined,
      source: "ecosystem",
      ecosystemId: id,
      ecosystemInstalls: installs,
    };
  } catch (e: any) {
    console.error(`Failed to install ecosystem skill ${id}: ${e.message}`);
    return null;
  }
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
