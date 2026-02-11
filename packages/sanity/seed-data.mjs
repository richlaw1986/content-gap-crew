import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'lxn44moi',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

// Create tools first
const tools = [
  {
    _id: 'tool-sitemap-lookup',
    _type: 'tool',
    name: 'sanity_sitemap_lookup',
    description: 'Search Sanity.io sitemap for existing content on a topic',
    credentialTypes: [],
    enabled: true,
    category: 'content',
  },
  {
    _id: 'tool-content-audit',
    _type: 'tool',
    name: 'sanity_content_audit',
    description: 'Audit content freshness and coverage by area',
    credentialTypes: [],
    enabled: true,
    category: 'content',
  },
  {
    _id: 'tool-fetch-webpage',
    _type: 'tool',
    name: 'fetch_webpage_content',
    description: 'Fetch and extract content from a webpage',
    credentialTypes: [],
    enabled: true,
    category: 'web',
  },
  {
    _id: 'tool-gsc-lookup',
    _type: 'tool',
    name: 'gsc_performance_lookup',
    description: 'Get Google Search Console performance data',
    credentialTypes: ['gsc'],
    enabled: true,
    category: 'seo',
  },
  {
    _id: 'tool-bigquery-visits',
    _type: 'tool',
    name: 'bigquery_llm_visits',
    description: 'Query BigQuery for LLM visit data',
    credentialTypes: ['bigquery'],
    enabled: true,
    category: 'analytics',
  },
  {
    _id: 'tool-openai-fanout',
    _type: 'tool',
    name: 'openai_query_fanout',
    description: 'Generate query variations using OpenAI',
    credentialTypes: ['openai'],
    enabled: true,
    category: 'ai',
  },
  {
    _id: 'tool-reddit-lookup',
    _type: 'tool',
    name: 'reddit_discussion_lookup',
    description: 'Search Reddit for discussions on a topic',
    credentialTypes: ['reddit'],
    enabled: true,
    category: 'research',
  },
  {
    _id: 'tool-google-ads',
    _type: 'tool',
    name: 'google_ads_keyword_ideas',
    description: 'Get keyword ideas from Google Ads',
    credentialTypes: ['google_ads'],
    enabled: true,
    category: 'seo',
  },
]

const SKILL_INSTRUCTION =
  'Before starting any task, use the search_skills tool to find relevant skills. ' +
  'If a skill applies, follow its steps and reflect that in your output. ' +
  'If you are unsure which tools are available, call list_available_tools.\n\n'

// Create agents
const agents = [
  {
    _id: 'agent-data-analyst',
    _type: 'agent',
    name: 'Data Analyst',
    role: 'Senior Data Analyst',
    goal: 'Analyze BigQuery LLM visit data and GSC performance to identify content opportunities',
    backstory: SKILL_INSTRUCTION + 'Expert in data analysis with deep knowledge of SEO metrics and LLM traffic patterns. Skilled at finding insights in large datasets.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      {_type: 'reference', _ref: 'tool-bigquery-visits'},
      {_type: 'reference', _ref: 'tool-gsc-lookup'},
    ],
  },
  {
    _id: 'agent-product-marketer',
    _type: 'agent',
    name: 'Product Marketer',
    role: 'Senior Product Marketing Manager',
    goal: 'Identify content gaps and competitive positioning opportunities',
    backstory: SKILL_INSTRUCTION + 'Experienced product marketer who understands how to position technical products. Expert at competitive analysis and messaging.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      {_type: 'reference', _ref: 'tool-sitemap-lookup'},
      {_type: 'reference', _ref: 'tool-fetch-webpage'},
      {_type: 'reference', _ref: 'tool-reddit-lookup'},
    ],
  },
  {
    _id: 'agent-seo-specialist',
    _type: 'agent',
    name: 'SEO Specialist',
    role: 'Technical SEO Specialist',
    goal: 'Optimize content strategy for search visibility and AEO (Answer Engine Optimization)',
    backstory: SKILL_INSTRUCTION + 'SEO expert with focus on technical optimization and emerging AI search patterns. Understands both traditional SEO and LLM optimization.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      {_type: 'reference', _ref: 'tool-gsc-lookup'},
      {_type: 'reference', _ref: 'tool-google-ads'},
      {_type: 'reference', _ref: 'tool-openai-fanout'},
    ],
  },
  {
    _id: 'agent-work-reviewer',
    _type: 'agent',
    name: 'Work Reviewer',
    role: 'Quality Assurance Reviewer',
    goal: 'Review and validate analysis quality, ensure actionable recommendations',
    backstory: SKILL_INSTRUCTION + 'Meticulous reviewer who ensures all analysis is accurate, well-supported, and actionable. Catches gaps and inconsistencies.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      {_type: 'reference', _ref: 'tool-content-audit'},
    ],
  },
  {
    _id: 'agent-narrative-governor',
    _type: 'agent',
    name: 'Narrative Governor',
    role: 'Narrative Governor',
    goal: 'Compress conversation history into the most salient facts, decisions, and open questions so downstream agents have concise, relevant context without token bloat.',
    backstory:
      'You are the memory governor for a multi-agent crew. Your sole job is to ' +
      'read the outputs of prior tasks and produce a concise factual summary ' +
      'for the next agent. Strip out pleasantries, repeated disclaimers, and ' +
      'anything not directly relevant. Keep key decisions, data points, ' +
      'assumptions, and unanswered questions. Never add your own analysis or ' +
      'recommendations — just distil what has been said. You have no tools and ' +
      'should never attempt to call any.',
    llmModel: 'gpt-5.2',
    verbose: false,
    allowDelegation: false,
    tools: [],
  },
]

// Create the crew
// Note: Tasks are now generated dynamically by the crew planner, not pre-defined.
const crew = {
  _id: 'crew-content-gap',
  _type: 'crew',
  name: 'Content Gap Analysis Crew',
  displayName: 'Content Gap Analysis',
  description: 'Analyzes content gaps for SEO and AEO optimization. Uses data analysis, competitive research, and AI-powered insights to identify content opportunities.',
  process: 'sequential',
  memory: true,
  isDefault: true,
  agents: agents.map(a => ({_type: 'reference', _ref: a._id})),
  credentials: [], // Will be added when credentials are configured
  inputSchema: [
    {
      _key: 'topic',
      name: 'topic',
      label: 'Analysis Topic',
      type: 'string',
      required: true,
      placeholder: 'e.g., headless CMS for enterprise',
      helpText: 'The topic or niche to analyze for content gaps',
    },
    {
      _key: 'competitors',
      name: 'competitors',
      label: 'Competitor URLs',
      type: 'array',
      required: false,
      placeholder: 'https://competitor.com',
      helpText: 'Optional list of competitor websites to analyze',
    },
    {
      _key: 'focusAreas',
      name: 'focusAreas',
      label: 'Focus Areas',
      type: 'array',
      required: false,
      placeholder: 'e.g., tutorials, comparisons, case studies',
      helpText: 'Specific content types or areas to prioritize',
    },
  ],
}

const crewPlanner = {
  _id: 'crew-planner-default',
  _type: 'crewPlanner',
  name: 'Default Crew Planner',
  enabled: true,
  usePlannerByDefault: true,
  model: 'gpt-5.2',
  maxAgents: 6,
  process: 'sequential',
  systemPrompt: `You are a crew planner for a conversational AI team (like Slack).
You receive: objective, inputs, and a list of agents.

RULE 1 — MATCH COMPLEXITY (most important rule):
Classify the request FIRST, then plan accordingly.

SIMPLE (direct question like "how do I implement ISR?", "what is SSR?", "explain K-means"):
  → EXACTLY 1 agent, EXACTLY 1 task.
  → Task description: the user's question verbatim + "Keep your answer concise and practical. Do not ask follow-up questions."
  → expectedOutput: "A concise, practical answer in a few paragraphs. No more than 300 words."
  → questions: [] (empty), inputSchema: [] (empty).
  → DO NOT create multiple tasks. DO NOT add research/analysis/QA steps.

MODERATE (e.g. "compare ISR vs SSR for my e-commerce site", "create a migration plan"):
  → Use the REVIEW LOOP pattern (see below). 2 agents, 3 tasks.
  → questions: only if genuinely needed, max 2.

COMPLEX (e.g. "create a content strategy for X", "analyze our content gaps across SEO and LLM traffic", "build an SEO plan for our product launch"):
  → Use the REVIEW LOOP pattern with MORE specialist agents contributing.
  → Structure: multiple agents each draft their section → reviewer consolidates feedback → lead agent produces final output.
  → 3-4 agents. Each specialist contributes their perspective (e.g. SEO analysis, marketing positioning, data insights) BEFORE the review step.
  → Ask clarifying questions (max 3) if the scope is unclear.

REVIEW LOOP PATTERN (use for MODERATE and COMPLEX):
When 2+ agents are involved, structure tasks as a draft→review→revise loop:
  Task 1 (order: 1): PRIMARY agent drafts the deliverable.
    description: "Draft [the deliverable]. Keep your answer concise and practical. Do not ask follow-up questions."
    expectedOutput: describes the draft output, with word limit.
  Task 2 (order: 2): REVIEWER agent reviews the draft and suggests improvements.
    description: "Review the draft output from the previous task. Identify gaps, inaccuracies, or improvements. List specific, actionable suggestions. Do NOT rewrite the whole thing — just provide feedback. Do not use tools unless absolutely necessary for fact-checking."
    expectedOutput: "A short list of specific improvements (max 200 words)."
  Task 3 (order: 3): PRIMARY agent (same as Task 1) incorporates the review feedback.
    description: "Incorporate the reviewer's feedback into your draft. Produce the final polished version. Keep your answer concise and practical. Do not ask follow-up questions."
    expectedOutput: describes the final output, with word limit.

RULE 2 — AGENT SELECTION:
- Match by role and backstory, not keyword overlap.
- Technical/code/framework questions → Technical SEO Specialist or most technical agent.
- Content strategy / marketing plans → include Product Marketing Manager AND Technical SEO Specialist AND Data Analyst. These are cross-functional tasks that need multiple perspectives.
- NEVER include the Narrative Governor (it's injected automatically).
- Do NOT include agents just because they exist.
- For the REVIEWER role, prefer Quality Assurance Reviewer if available, otherwise use a second relevant agent.

RULE 3 — RESPONSE QUALITY:
- ALWAYS include "Keep your answer concise and practical." in task descriptions.
- ALWAYS include "Do not ask the user follow-up questions in your output." in task descriptions.
- expectedOutput must specify a word limit appropriate to complexity.

Return JSON: { agents: [_id strings], tasks: [{name, description, expectedOutput, agentId, order}], process: "sequential", inputSchema: [], questions: [] }
Every agentId must match an _id from the agents list. expectedOutput is required. process MUST be "sequential" for review loops.`,
}

const memoryPolicy = {
  _id: 'memory-policy-default',
  _type: 'memoryPolicy',
  name: 'Default Memory Policy',
  enabled: true,
  agent: {_type: 'reference', _ref: 'agent-narrative-governor'},
}

const skills = [
  {
    _id: 'skill-eeat-audit',
    _type: 'skill',
    name: 'EEAT Audit',
    description: 'Assess content quality using EEAT (Experience, Expertise, Authoritativeness, Trustworthiness).',
    steps: [
      'Identify author and credentials',
      'Check first-hand experience signals',
      'Verify sources and citations',
      'Score trustworthiness',
      'Summarize findings and recommendations',
    ],
    tags: ['seo', 'eeat', 'content-quality', 'trust'],
    toolsRequired: ['fetch_webpage_content', 'sanity_sitemap_lookup'],
    inputSchema: [
      {name: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://example.com'},
    ],
    outputSchema: 'EEAT score and recommendations',
    enabled: true,
  },
  {
    _id: 'skill-competitive-gap',
    _type: 'skill',
    name: 'Competitive Content Gap',
    description: 'Identify content topics competitors cover that we do not.',
    steps: [
      'List competitors and target topic',
      'Fetch competitor content pages',
      'Compare to Sanity sitemap coverage',
      'Rank gaps by impact',
      'Recommend new content',
    ],
    tags: ['competitive', 'content-gap', 'seo'],
    toolsRequired: ['fetch_webpage_content', 'sanity_sitemap_lookup'],
    inputSchema: [
      {name: 'topic', label: 'Topic', type: 'string', required: true},
      {name: 'competitors', label: 'Competitors', type: 'array', required: false},
    ],
    outputSchema: 'Ranked list of content gaps',
    enabled: true,
  },
]

async function seed() {
  console.log('Creating tools...')
  for (const tool of tools) {
    await client.createOrReplace(tool)
    console.log(`  ✓ ${tool.name}`)
  }

  console.log('Creating agents...')
  for (const agent of agents) {
    await client.createOrReplace(agent)
    console.log(`  ✓ ${agent.name}`)
  }

  console.log('Creating crew...')
  await client.createOrReplace(crew)
  console.log(`  ✓ ${crew.name}`)

  console.log('Creating memory policy...')
  await client.createOrReplace(memoryPolicy)
  console.log(`  ✓ ${memoryPolicy.name}`)

  console.log('Creating skills...')
  for (const skill of skills) {
    await client.createOrReplace(skill)
    console.log(`  ✓ ${skill.name}`)
  }

  console.log('Creating crew planner...')
  await client.createOrReplace(crewPlanner)
  console.log(`  ✓ ${crewPlanner.name}`)

  console.log('\n✅ Seed data created successfully!')
}

seed().catch(console.error)
