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

// Create agents
const agents = [
  {
    _id: 'agent-data-analyst',
    _type: 'agent',
    name: 'Data Analyst',
    role: 'Senior Data Analyst',
    goal: 'Analyze BigQuery LLM visit data and GSC performance to identify content opportunities',
    backstory: 'Expert in data analysis with deep knowledge of SEO metrics and LLM traffic patterns. Skilled at finding insights in large datasets.',
    llmTier: 'default',
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
    backstory: 'Experienced product marketer who understands how to position technical products. Expert at competitive analysis and messaging.',
    llmTier: 'default',
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
    backstory: 'SEO expert with focus on technical optimization and emerging AI search patterns. Understands both traditional SEO and LLM optimization.',
    llmTier: 'default',
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
    backstory: 'Meticulous reviewer who ensures all analysis is accurate, well-supported, and actionable. Catches gaps and inconsistencies.',
    llmTier: 'smart',
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
    role: 'Content Strategy Director',
    goal: 'Synthesize findings into coherent content strategy with prioritized recommendations',
    backstory: 'Senior content strategist who excels at turning data into narrative. Creates compelling, actionable content roadmaps.',
    llmTier: 'smart',
    verbose: true,
    allowDelegation: true,
    tools: [],
  },
]

// Create tasks
const tasks = [
  {
    _id: 'task-data-analysis',
    _type: 'task',
    description: 'Analyze LLM visit data and search performance for the given topic. Identify which pages are getting AI traffic, trending topics, and performance gaps.',
    expectedOutput: 'Data analysis report with: top pages by LLM visits, trending topics, GSC performance metrics, and identified opportunities.',
    agent: {_type: 'reference', _ref: 'agent-data-analyst'},
    order: 1,
    contextTasks: [],
  },
  {
    _id: 'task-competitive-analysis',
    _type: 'task',
    description: 'Research competitor content and community discussions. Identify what topics competitors cover that we don\'t, and what questions the community is asking.',
    expectedOutput: 'Competitive analysis with: competitor content gaps, Reddit/community insights, and positioning opportunities.',
    agent: {_type: 'reference', _ref: 'agent-product-marketer'},
    order: 2,
    contextTasks: [{_type: 'reference', _ref: 'task-data-analysis'}],
  },
  {
    _id: 'task-seo-optimization',
    _type: 'task',
    description: 'Develop SEO and AEO optimization strategy based on data analysis and competitive research. Identify keyword opportunities and content optimization tactics.',
    expectedOutput: 'SEO strategy with: target keywords, content optimization recommendations, and AEO tactics for AI search visibility.',
    agent: {_type: 'reference', _ref: 'agent-seo-specialist'},
    order: 3,
    contextTasks: [
      {_type: 'reference', _ref: 'task-data-analysis'},
      {_type: 'reference', _ref: 'task-competitive-analysis'},
    ],
  },
  {
    _id: 'task-quality-review',
    _type: 'task',
    description: 'Review all analysis for accuracy, completeness, and actionability. Identify any gaps or inconsistencies that need to be addressed.',
    expectedOutput: 'Quality review report with: validation of findings, identified gaps, and recommendations for improvement.',
    agent: {_type: 'reference', _ref: 'agent-work-reviewer'},
    order: 4,
    contextTasks: [
      {_type: 'reference', _ref: 'task-data-analysis'},
      {_type: 'reference', _ref: 'task-competitive-analysis'},
      {_type: 'reference', _ref: 'task-seo-optimization'},
    ],
  },
  {
    _id: 'task-final-synthesis',
    _type: 'task',
    description: 'Synthesize all findings into a coherent content strategy. Create prioritized recommendations with clear next steps.',
    expectedOutput: 'Final content gap report with: executive summary, prioritized content recommendations, implementation roadmap, and success metrics.',
    agent: {_type: 'reference', _ref: 'agent-narrative-governor'},
    order: 5,
    contextTasks: [
      {_type: 'reference', _ref: 'task-quality-review'},
    ],
  },
]

// Create the crew
const crew = {
  _id: 'crew-content-gap',
  _type: 'crew',
  name: 'Content Gap Analysis Crew',
  description: 'Analyzes content gaps for SEO and AEO optimization. Uses data analysis, competitive research, and AI-powered insights to identify content opportunities.',
  process: 'sequential',
  memory: true,
  isDefault: true,
  agents: agents.map(a => ({_type: 'reference', _ref: a._id})),
  tasks: tasks.map(t => ({_type: 'reference', _ref: t._id})),
  credentials: [], // Will be added when credentials are configured
}

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

  console.log('Creating tasks...')
  for (const task of tasks) {
    await client.createOrReplace(task)
    console.log(`  ✓ Task ${task.order}: ${task.description.substring(0, 50)}...`)
  }

  console.log('Creating crew...')
  await client.createOrReplace(crew)
  console.log(`  ✓ ${crew.name}`)

  console.log('\n✅ Seed data created successfully!')
}

seed().catch(console.error)
