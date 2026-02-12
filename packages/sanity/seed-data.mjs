import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'lxn44moi',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

// ────────────────────────────────────────────────────────────────
// TOOLS — builtin + HTTP
// ────────────────────────────────────────────────────────────────

const tools = [
  // ── Builtin (Python) tools ────────────────────────────────
  {
    _id: 'tool-sitemap-lookup',
    _type: 'tool',
    name: 'sitemap_lookup',
    displayName: 'Sitemap Lookup',
    description: 'Search any website sitemap for existing content on a topic. Takes a site URL and a query.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'content',
  },
  {
    _id: 'tool-content-audit',
    _type: 'tool',
    name: 'content_audit',
    displayName: 'Content Audit',
    description: 'Audit content freshness and coverage on any website by scanning its sitemap. Takes a site URL and optional query filter.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'content',
  },
  {
    _id: 'tool-fetch-webpage',
    _type: 'tool',
    name: 'fetch_webpage_content',
    displayName: 'Fetch Webpage',
    description: 'Fetch and extract main text content from a webpage — title, headings, word count, and body text.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'web',
  },
  {
    _id: 'tool-gsc-lookup',
    _type: 'tool',
    name: 'gsc_performance_lookup',
    displayName: 'GSC Performance',
    description: 'Get Google Search Console performance data (clicks, impressions, CTR, position) for a site. Requires GSC credentials.',
    implementationType: 'builtin',
    credentialTypes: ['gsc'],
    enabled: true,
    category: 'search',
  },
  {
    _id: 'tool-bigquery-visits',
    _type: 'tool',
    name: 'bigquery_llm_visits',
    displayName: 'BigQuery LLM Visits',
    description: 'Query BigQuery for LLM referral visit data — AI traffic patterns, chatbot referrals, and AI-engine click-through.',
    implementationType: 'builtin',
    credentialTypes: ['bigquery'],
    enabled: true,
    category: 'data',
  },
  {
    _id: 'tool-openai-fanout',
    _type: 'tool',
    name: 'openai_query_fanout',
    displayName: 'Query Fanout',
    description: 'Generate diverse query variations for a topic using OpenAI — useful for keyword expansion and content ideation.',
    implementationType: 'builtin',
    credentialTypes: ['openai'],
    enabled: true,
    category: 'ai',
  },
  {
    _id: 'tool-reddit-lookup',
    _type: 'tool',
    name: 'reddit_discussion_lookup',
    displayName: 'Reddit Lookup',
    description: 'Search Reddit for discussions on a topic — find real user questions, pain points, and sentiment.',
    implementationType: 'builtin',
    credentialTypes: ['reddit'],
    enabled: true,
    category: 'social',
  },
  {
    _id: 'tool-google-ads',
    _type: 'tool',
    name: 'google_ads_keyword_ideas',
    displayName: 'Google Ads Keywords',
    description: 'Get keyword ideas with search volume, competition, and CPC from Google Ads Keyword Planner.',
    implementationType: 'builtin',
    credentialTypes: ['google_ads'],
    enabled: true,
    category: 'search',
  },
  {
    _id: 'tool-bigquery-describe',
    _type: 'tool',
    name: 'bigquery_describe_table',
    displayName: 'BigQuery Describe Table',
    description:
      'Describe the schema of a BigQuery table — column names, types, row count, date range, and sample data. ' +
      'Use this before running custom queries to understand table structure.',
    implementationType: 'builtin',
    credentialTypes: ['bigquery'],
    enabled: true,
    category: 'data',
  },
  {
    _id: 'tool-bigquery-custom',
    _type: 'tool',
    name: 'bigquery_custom_query',
    displayName: 'BigQuery Custom Query',
    description:
      'Run a custom SQL SELECT query against BigQuery LLM visit tables. ' +
      'Use bigquery_describe_table first to understand the schema. Only SELECT queries allowed.',
    implementationType: 'builtin',
    credentialTypes: ['bigquery'],
    enabled: true,
    category: 'data',
  },
  {
    _id: 'tool-fetch-compare',
    _type: 'tool',
    name: 'fetch_and_compare_urls',
    displayName: 'Compare URLs',
    description:
      'Fetch and compare content from multiple URLs side by side (max 5). ' +
      'Returns word count, heading count, code presence, and full content for each. Essential for competitor gap analysis.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'web',
  },
  {
    _id: 'tool-top-google',
    _type: 'tool',
    name: 'top_google_search_pages',
    displayName: 'Top Google Pages',
    description:
      'Analyze the competitive SERP landscape for a query — identifies key competitor domains, ' +
      'content format patterns, featured snippet opportunities, and People Also Ask questions.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'search',
  },
  {
    _id: 'tool-top-aeo',
    _type: 'tool',
    name: 'top_aeo_pages',
    displayName: 'AEO Opportunities',
    description:
      'Identify Answer Engine Optimisation opportunities — Top X lists, definitional content, comparison tables, ' +
      'and how-to content formats that get cited by LLMs. Includes freshness and entity grounding advice.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'search',
  },
  {
    _id: 'tool-competitor-gaps',
    _type: 'tool',
    name: 'competitor_content_gaps',
    displayName: 'Competitor Content Gaps',
    description:
      'Analyze competitor content for a topic and identify gaps — checks key competitor sites ' +
      'and compares to a target site. Returns gap analysis with actionable recommendations.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'content',
  },
  {
    _id: 'tool-search-skills',
    _type: 'tool',
    name: 'search_skills',
    displayName: 'Search Skills',
    description:
      'Search the skill library for reusable playbooks — EEAT audits, competitive gap analysis, ' +
      'content frameworks. Returns matching skills with steps and required tools.',
    implementationType: 'builtin',
    credentialTypes: ['sanity'],
    enabled: true,
    category: 'ai',
  },
  {
    _id: 'tool-list-tools',
    _type: 'tool',
    name: 'list_available_tools',
    displayName: 'List Available Tools',
    description: 'List all tools currently available to agents, with descriptions and credential requirements.',
    implementationType: 'builtin',
    credentialTypes: [],
    enabled: true,
    category: 'ai',
  },

  // ── HTTP tools (no code deployment needed) ────────────────

  // SerpApi — Live SERP results
  {
    _id: 'tool-serpapi-search',
    _type: 'tool',
    name: 'serpapi_google_search',
    displayName: 'Google SERP Results',
    description:
      'Get live Google search results for any query — organic results, featured snippets, People Also Ask, and knowledge panels. ' +
      'Use this to see what currently ranks for a keyword.',
    implementationType: 'http',
    credentialTypes: ['serpapi'],
    enabled: true,
    category: 'search',
    parameters: [
      {name: 'query', type: 'string', description: 'Search query', required: true},
      {name: 'num', type: 'string', description: 'Number of results (default 10)', required: false, default: '10'},
      {name: 'gl', type: 'string', description: 'Country code (default us)', required: false, default: 'us'},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate: 'https://serpapi.com/search.json?q={{query}}&num={{num}}&gl={{gl}}&api_key={{credential.serpApiKey}}',
      headers: [],
      responsePath: 'organic_results',
      responseMaxLength: 6000,
    },
  },

  // SerpApi — Google Trends
  {
    _id: 'tool-serpapi-trends',
    _type: 'tool',
    name: 'serpapi_google_trends',
    displayName: 'Google Trends',
    description:
      'Get Google Trends data for a keyword — interest over time, related queries, and rising topics. ' +
      'Use this to gauge topic momentum and seasonal patterns.',
    implementationType: 'http',
    credentialTypes: ['serpapi'],
    enabled: true,
    category: 'search',
    parameters: [
      {name: 'query', type: 'string', description: 'Trend topic to look up', required: true},
      {name: 'geo', type: 'string', description: 'Country code (default US)', required: false, default: 'US'},
      {name: 'date', type: 'string', description: 'Time range (default today 12-m)', required: false, default: 'today 12-m'},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate:
        'https://serpapi.com/search.json?engine=google_trends&q={{query}}&geo={{geo}}&date={{date}}&api_key={{credential.serpApiKey}}',
      headers: [],
      responsePath: 'interest_over_time',
      responseMaxLength: 5000,
    },
  },

  // PageSpeed Insights (free, no auth needed — Google API key is optional for higher quota)
  {
    _id: 'tool-pagespeed',
    _type: 'tool',
    name: 'pagespeed_insights',
    displayName: 'PageSpeed Insights',
    description:
      'Get Core Web Vitals and performance scores for a URL — LCP, FID, CLS, performance score, accessibility score. ' +
      'Essential for technical SEO audits.',
    implementationType: 'http',
    credentialTypes: ['google_api'],
    enabled: true,
    category: 'web',
    parameters: [
      {name: 'url', type: 'string', description: 'URL to audit', required: true},
      {name: 'strategy', type: 'string', description: 'mobile or desktop (default mobile)', required: false, default: 'mobile'},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate:
        'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={{url}}&strategy={{strategy}}&key={{credential.googleApiKey}}',
      headers: [],
      responsePath: 'lighthouseResult.categories',
      responseMaxLength: 4000,
    },
  },

  // YouTube Data API — Search
  {
    _id: 'tool-youtube-search',
    _type: 'tool',
    name: 'youtube_search',
    displayName: 'YouTube Search',
    description:
      'Search YouTube for videos on a topic — returns titles, view counts, channel names, and publish dates. ' +
      'Useful for video content gap analysis and competitor research.',
    implementationType: 'http',
    credentialTypes: ['google_api'],
    enabled: true,
    category: 'content',
    parameters: [
      {name: 'query', type: 'string', description: 'Search query', required: true},
      {name: 'maxResults', type: 'string', description: 'Number of results (default 10)', required: false, default: '10'},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate:
        'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q={{query}}&maxResults={{maxResults}}&key={{credential.googleApiKey}}',
      headers: [],
      responsePath: 'items',
      responseMaxLength: 6000,
    },
  },

  // Hunter.io — Email Finder
  {
    _id: 'tool-hunter-email',
    _type: 'tool',
    name: 'hunter_domain_search',
    displayName: 'Hunter Email Finder',
    description:
      'Find email addresses associated with a domain — useful for outreach, link building, and partnership research.',
    implementationType: 'http',
    credentialTypes: ['hunter'],
    enabled: true,
    category: 'marketing',
    parameters: [
      {name: 'domain', type: 'string', description: 'Domain to search (e.g., "example.com")', required: true},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate: 'https://api.hunter.io/v2/domain-search?domain={{domain}}&api_key={{credential.hunterApiKey}}',
      headers: [],
      responsePath: 'data',
      responseMaxLength: 5000,
    },
  },

  // Clearbit — Company Enrichment
  {
    _id: 'tool-clearbit-company',
    _type: 'tool',
    name: 'clearbit_company_lookup',
    displayName: 'Clearbit Company Lookup',
    description:
      'Enrich a domain with company data — industry, size, tech stack, funding, description. ' +
      'Useful for ICP targeting and competitive intelligence.',
    implementationType: 'http',
    credentialTypes: ['clearbit'],
    enabled: true,
    category: 'data',
    parameters: [
      {name: 'domain', type: 'string', description: 'Company domain (e.g., "stripe.com")', required: true},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate: 'https://company.clearbit.com/v2/companies/find?domain={{domain}}',
      headers: [
        {key: 'Authorization', value: 'Bearer {{credential.clearbitApiKey}}'},
      ],
      responseMaxLength: 5000,
    },
  },

  // Slack — Post Message
  {
    _id: 'tool-slack-post',
    _type: 'tool',
    name: 'slack_post_message',
    displayName: 'Slack Post',
    description:
      'Post a message to a Slack channel via webhook — use to notify teams about completed analyses or key findings.',
    implementationType: 'http',
    credentialTypes: ['slack'],
    enabled: true,
    category: 'marketing',
    parameters: [
      {name: 'text', type: 'string', description: 'Message text to post', required: true},
    ],
    httpConfig: {
      method: 'POST',
      urlTemplate: '{{credential.slackWebhookUrl}}',
      headers: [
        {key: 'Content-Type', value: 'application/json'},
      ],
      bodyTemplate: '{"text": "{{text}}"}',
      responseMaxLength: 500,
    },
  },

  // Semrush — Domain Overview
  {
    _id: 'tool-semrush-domain',
    _type: 'tool',
    name: 'semrush_domain_overview',
    displayName: 'Semrush Domain Overview',
    description:
      'Get organic search overview for a domain — traffic estimate, top keywords, backlinks, competitor map. ' +
      'Essential for competitive analysis and benchmarking.',
    implementationType: 'http',
    credentialTypes: ['semrush'],
    enabled: true,
    category: 'search',
    parameters: [
      {name: 'domain', type: 'string', description: 'Domain to analyze (e.g., "example.com")', required: true},
      {name: 'database', type: 'string', description: 'Database / country (default us)', required: false, default: 'us'},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate:
        'https://api.semrush.com/?type=domain_ranks&key={{credential.semrushApiKey}}&export_columns=Dn,Rk,Or,Ot,Oc,Ad,At,Ac&domain={{domain}}&database={{database}}',
      headers: [],
      responseMaxLength: 4000,
    },
  },

  // Semrush — Keyword Overview
  {
    _id: 'tool-semrush-keyword',
    _type: 'tool',
    name: 'semrush_keyword_overview',
    displayName: 'Semrush Keyword Data',
    description:
      'Get keyword metrics from Semrush — search volume, keyword difficulty, CPC, SERP features, and trend. ' +
      'Use for keyword research and prioritisation.',
    implementationType: 'http',
    credentialTypes: ['semrush'],
    enabled: true,
    category: 'search',
    parameters: [
      {name: 'keyword', type: 'string', description: 'Keyword to look up', required: true},
      {name: 'database', type: 'string', description: 'Database / country (default us)', required: false, default: 'us'},
    ],
    httpConfig: {
      method: 'GET',
      urlTemplate:
        'https://api.semrush.com/?type=phrase_all&key={{credential.semrushApiKey}}&export_columns=Ph,Nq,Cp,Co,Nr,Td&phrase={{keyword}}&database={{database}}',
      headers: [],
      responseMaxLength: 3000,
    },
  },
]

// ────────────────────────────────────────────────────────────────
// CREDENTIALS — seed documents (direct storage — edit in Sanity Studio)
// ────────────────────────────────────────────────────────────────

const credentials = [
  {
    _id: 'cred-openai',
    _type: 'credential',
    name: 'OpenAI',
    type: 'openai',
    storageMethod: 'direct',
    openaiApiKey: '',
    environment: 'development',
    notes: 'Used by Query Fanout tool and as the default LLM provider.',
  },
  {
    _id: 'cred-serpapi',
    _type: 'credential',
    name: 'SerpApi',
    type: 'serpapi',
    storageMethod: 'direct',
    serpApiKey: '',
    environment: 'development',
    notes: 'Powers Google SERP Results and Google Trends tools. Free tier: 100 searches/mo. https://serpapi.com',
  },
  {
    _id: 'cred-google-api',
    _type: 'credential',
    name: 'Google API Key',
    type: 'google_api',
    storageMethod: 'direct',
    googleApiKey: '',
    environment: 'development',
    notes: 'Shared key for PageSpeed Insights and YouTube Data API. Free. https://console.cloud.google.com/apis/credentials',
  },
  {
    _id: 'cred-brave',
    _type: 'credential',
    name: 'Brave Search',
    type: 'brave',
    storageMethod: 'direct',
    braveApiKey: '',
    environment: 'development',
    notes: 'Used by Brave Search MCP server. Free tier: 2,000 queries/mo. https://brave.com/search/api/',
  },
  {
    _id: 'cred-github',
    _type: 'credential',
    name: 'GitHub',
    type: 'github',
    storageMethod: 'direct',
    githubPersonalAccessToken: '',
    environment: 'development',
    notes: 'Used by GitHub MCP server. Create at: https://github.com/settings/tokens',
  },
  {
    _id: 'cred-sanity',
    _type: 'credential',
    name: 'Sanity',
    type: 'sanity',
    storageMethod: 'direct',
    sanityApiToken: '',
    sanityProjectId: 'lxn44moi',
    sanityDataset: 'production',
    environment: 'development',
    notes: 'Used by Sanity MCP server for reading/writing content.',
  },
  {
    _id: 'cred-hunter',
    _type: 'credential',
    name: 'Hunter.io',
    type: 'hunter',
    storageMethod: 'direct',
    hunterApiKey: '',
    environment: 'development',
    notes: 'Email finder for outreach. Free tier: 25 req/mo. https://hunter.io/api',
  },
  {
    _id: 'cred-clearbit',
    _type: 'credential',
    name: 'Clearbit',
    type: 'clearbit',
    storageMethod: 'direct',
    clearbitApiKey: '',
    environment: 'development',
    notes: 'Company enrichment for ICP targeting. https://clearbit.com',
  },
  {
    _id: 'cred-slack',
    _type: 'credential',
    name: 'Slack',
    type: 'slack',
    storageMethod: 'direct',
    slackWebhookUrl: '',
    environment: 'development',
    notes: 'Incoming webhook for posting analysis results. Create at: https://api.slack.com/messaging/webhooks',
  },
  {
    _id: 'cred-semrush',
    _type: 'credential',
    name: 'Semrush',
    type: 'semrush',
    storageMethod: 'direct',
    semrushApiKey: '',
    environment: 'development',
    notes: 'Domain overview and keyword research. Paid plans from $130/mo. https://www.semrush.com/api/',
  },
  {
    _id: 'cred-reddit',
    _type: 'credential',
    name: 'Reddit',
    type: 'reddit',
    storageMethod: 'direct',
    redditClientId: '',
    redditClientSecret: '',
    redditUserAgent: 'ContentGapCrewBot/1.0',
    environment: 'development',
    notes: 'Reddit API for discussion lookup. Free. Create at: https://www.reddit.com/prefs/apps',
  },
  {
    _id: 'cred-gsc',
    _type: 'credential',
    name: 'Google Search Console',
    type: 'gsc',
    storageMethod: 'direct',
    gscKeyFile: '',
    gscSiteUrl: '',
    environment: 'development',
    notes: 'Paste the path to your service account JSON or its contents. Needs GCP project + service account.',
  },
  {
    _id: 'cred-bigquery',
    _type: 'credential',
    name: 'BigQuery',
    type: 'bigquery',
    storageMethod: 'direct',
    bigqueryCredentialsFile: '',
    environment: 'development',
    notes: 'Paste the path to your service account JSON or its contents. Needs GCP project + service account.',
  },
  {
    _id: 'cred-google-ads',
    _type: 'credential',
    name: 'Google Ads',
    type: 'google_ads',
    storageMethod: 'direct',
    googleAdsDeveloperToken: '',
    googleAdsClientId: '',
    googleAdsClientSecret: '',
    googleAdsRefreshToken: '',
    googleAdsCustomerId: '',
    environment: 'development',
    notes: 'Google Ads API for keyword research. Needs approved developer token.',
  },
  {
    _id: 'cred-anthropic',
    _type: 'credential',
    name: 'Anthropic',
    type: 'anthropic',
    storageMethod: 'direct',
    anthropicApiKey: '',
    environment: 'development',
    notes: 'Claude models for agent LLMs. https://console.anthropic.com/settings/keys',
  },
]

// ────────────────────────────────────────────────────────────────
// MCP SERVERS
// ────────────────────────────────────────────────────────────────

const mcpServers = [
  // Brave Search — live web search via MCP
  {
    _id: 'mcp-brave-search',
    _type: 'mcpServer',
    name: 'brave-search',
    displayName: 'Brave Web Search',
    description:
      'Live web search powered by Brave. Provides web_search and local_search tools. ' +
      'Free tier: 2,000 queries/month.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-brave-search'],
    env: [
      {key: 'BRAVE_API_KEY', fromCredential: {_type: 'reference', _ref: 'cred-brave'}},
    ],
    tools: ['brave_web_search', 'brave_local_search'],
    enabled: true,
    timeout: 30000,
  },

  // Filesystem — read/write output files
  {
    _id: 'mcp-filesystem',
    _type: 'mcpServer',
    name: 'filesystem',
    displayName: 'Filesystem (Output)',
    description:
      'Read and write files to a local output directory. Use for saving deliverables, ' +
      'reports, and generated content as actual files.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-filesystem', '/tmp/crew-output'],
    env: [],
    tools: ['read_file', 'write_file', 'list_directory', 'create_directory'],
    enabled: true,
    timeout: 15000,
  },

  // GitHub — repo search, file read, issues
  {
    _id: 'mcp-github',
    _type: 'mcpServer',
    name: 'github',
    displayName: 'GitHub',
    description:
      'Search repositories, read files, create issues and PRs. ' +
      'Useful for technical research, code analysis, and developer-focused content.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-github'],
    env: [
      {key: 'GITHUB_PERSONAL_ACCESS_TOKEN', fromCredential: {_type: 'reference', _ref: 'cred-github'}},
    ],
    tools: ['search_repositories', 'get_file_contents', 'search_code', 'create_issue', 'list_issues'],
    enabled: true,
    timeout: 30000,
  },

  // Sanity — read/write Sanity documents
  {
    _id: 'mcp-sanity',
    _type: 'mcpServer',
    name: 'sanity',
    displayName: 'Sanity CMS',
    description:
      'Query and manage Sanity documents via GROQ. Useful for content audits, ' +
      'publishing workflows, and reading structured content from the CMS.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sanity/mcp-server'],
    env: [
      {key: 'SANITY_API_TOKEN', fromCredential: {_type: 'reference', _ref: 'cred-sanity'}},
      {key: 'SANITY_PROJECT_ID', value: 'lxn44moi'},
      {key: 'SANITY_DATASET', value: 'production'},
    ],
    tools: ['query', 'getDocument', 'patchDocument', 'createDocument'],
    enabled: true,
    timeout: 30000,
  },

  // Playwright — headless browser for JS-rendered pages
  {
    _id: 'mcp-playwright',
    _type: 'mcpServer',
    name: 'playwright',
    displayName: 'Playwright Browser',
    description:
      'Headless browser for scraping JavaScript-rendered pages, taking screenshots, ' +
      'and interacting with web apps. Handles SPAs, login flows, and dynamic content ' +
      'that simple HTTP fetch cannot reach.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-playwright'],
    env: [],
    tools: ['browser_navigate', 'browser_screenshot', 'browser_click', 'browser_type', 'browser_get_text'],
    enabled: true,
    timeout: 60000,
  },

  // Fetch — simple URL fetcher (lighter than Playwright)
  {
    _id: 'mcp-fetch',
    _type: 'mcpServer',
    name: 'fetch',
    displayName: 'URL Fetch',
    description:
      'Fetch any URL and extract its content as markdown or raw text. ' +
      'Lighter-weight alternative to Playwright for static pages.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-fetch'],
    env: [],
    tools: ['fetch'],
    enabled: true,
    timeout: 30000,
  },
]

// ────────────────────────────────────────────────────────────────
// AGENTS
// ────────────────────────────────────────────────────────────────

const agents = [
  {
    _id: 'agent-data-analyst',
    _type: 'agent',
    name: 'Data Analyst',
    role: 'Senior Data Analyst',
    goal: 'Analyze data, find patterns, and produce quantitative insights that inform decisions',
    expertise:
      'Deep expertise in data analysis, SEO metrics, LLM traffic patterns, ' +
      'statistical modelling, and quantitative research. Skilled at finding ' +
      'non-obvious insights in large datasets and translating numbers into ' +
      'clear business recommendations.',
    philosophy:
      'Data-driven and evidence-first. Every claim should be backed by a number ' +
      'or a clear analytical rationale. Favour clarity over complexity — a ' +
      'simple insight delivered well beats an elaborate model nobody reads.',
    thingsToAvoid: [
      'Making claims without supporting data or citations',
      'Over-complicating analysis when a simple metric suffices',
      'Presenting raw data dumps without interpretation or takeaways',
      'Confusing correlation with causation',
    ],
    outputStyle:
      'Use tables and charts where possible. Lead with the headline insight, ' +
      'then supporting detail. Keep prose concise — prefer bullet points to paragraphs.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      // Original workflow tools
      {_type: 'reference', _ref: 'tool-sitemap-lookup'},
      {_type: 'reference', _ref: 'tool-content-audit'},
      {_type: 'reference', _ref: 'tool-gsc-lookup'},
      {_type: 'reference', _ref: 'tool-google-ads'},
      {_type: 'reference', _ref: 'tool-top-google'},
      {_type: 'reference', _ref: 'tool-fetch-webpage'},
      {_type: 'reference', _ref: 'tool-fetch-compare'},
      {_type: 'reference', _ref: 'tool-bigquery-describe'},
      {_type: 'reference', _ref: 'tool-bigquery-visits'},
      {_type: 'reference', _ref: 'tool-bigquery-custom'},
      {_type: 'reference', _ref: 'tool-competitor-gaps'},
      // New HTTP tools
      {_type: 'reference', _ref: 'tool-semrush-domain'},
      {_type: 'reference', _ref: 'tool-semrush-keyword'},
      {_type: 'reference', _ref: 'tool-clearbit-company'},
    ],
  },
  {
    _id: 'agent-product-marketer',
    _type: 'agent',
    name: 'Product Marketer',
    role: 'Senior Product Marketing Manager',
    goal: 'Identify content gaps, competitive positioning opportunities, and go-to-market messaging',
    expertise:
      'Experienced product marketer with deep understanding of technical product positioning, ' +
      'competitive analysis, messaging frameworks, and content strategy. Knows how to ' +
      'translate features into benefits that resonate with buyers.',
    philosophy:
      'Buyer-centric. Every piece of content should answer "why should the reader care?" ' +
      'Focus on differentiation — what makes this product/approach uniquely valuable. ' +
      'Prefer actionable recommendations over theoretical frameworks.',
    thingsToAvoid: [
      'Generic messaging that could apply to any competitor',
      'Feature-listing without connecting to buyer outcomes',
      'Ignoring competitive context when making content recommendations',
      'Producing vague strategy docs that lack specific next-steps',
    ],
    outputStyle:
      'Clear, punchy prose. Use comparison tables when contrasting with competitors. ' +
      'Structure recommendations as prioritised action items.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      // Original workflow tools
      {_type: 'reference', _ref: 'tool-sitemap-lookup'},
      {_type: 'reference', _ref: 'tool-content-audit'},
      {_type: 'reference', _ref: 'tool-reddit-lookup'},
      {_type: 'reference', _ref: 'tool-top-aeo'},
      {_type: 'reference', _ref: 'tool-fetch-webpage'},
      {_type: 'reference', _ref: 'tool-fetch-compare'},
      {_type: 'reference', _ref: 'tool-competitor-gaps'},
      {_type: 'reference', _ref: 'tool-bigquery-visits'},
      // New HTTP tools
      {_type: 'reference', _ref: 'tool-serpapi-search'},
      {_type: 'reference', _ref: 'tool-youtube-search'},
      {_type: 'reference', _ref: 'tool-hunter-email'},
      {_type: 'reference', _ref: 'tool-slack-post'},
    ],
  },
  {
    _id: 'agent-seo-specialist',
    _type: 'agent',
    name: 'SEO Specialist',
    role: 'Technical SEO Specialist',
    goal: 'Optimise content strategy for search visibility and AEO (Answer Engine Optimisation)',
    expertise:
      'SEO expert focused on technical optimisation and emerging AI search patterns. ' +
      'Deep knowledge of traditional SEO (crawlability, indexation, structured data, ' +
      'Core Web Vitals) as well as LLM optimisation (AEO) — how to get content cited ' +
      'by AI assistants and featured snippets.',
    philosophy:
      'Search is the intersection of technical excellence and user intent. ' +
      'Always start from what the searcher actually needs, then work backwards to ' +
      'the technical implementation. Stay current — search evolves fast.',
    thingsToAvoid: [
      'Keyword-stuffing or outdated SEO tactics (exact-match domains, link schemes)',
      'Ignoring search intent in favour of volume alone',
      'Providing recommendations without explaining the "why" behind them',
      'Treating SEO as a checklist rather than an ongoing strategy',
    ],
    outputStyle:
      'Technical but accessible. Use clear headings, code snippets where relevant, ' +
      'and prioritised action items. Include estimated impact where possible.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      // Original workflow tools
      {_type: 'reference', _ref: 'tool-gsc-lookup'},
      {_type: 'reference', _ref: 'tool-google-ads'},
      {_type: 'reference', _ref: 'tool-openai-fanout'},
      {_type: 'reference', _ref: 'tool-top-google'},
      {_type: 'reference', _ref: 'tool-top-aeo'},
      {_type: 'reference', _ref: 'tool-fetch-webpage'},
      {_type: 'reference', _ref: 'tool-fetch-compare'},
      {_type: 'reference', _ref: 'tool-sitemap-lookup'},
      {_type: 'reference', _ref: 'tool-content-audit'},
      {_type: 'reference', _ref: 'tool-bigquery-visits'},
      {_type: 'reference', _ref: 'tool-competitor-gaps'},
      // New HTTP tools
      {_type: 'reference', _ref: 'tool-serpapi-search'},
      {_type: 'reference', _ref: 'tool-serpapi-trends'},
      {_type: 'reference', _ref: 'tool-pagespeed'},
      {_type: 'reference', _ref: 'tool-semrush-keyword'},
      {_type: 'reference', _ref: 'tool-semrush-domain'},
    ],
  },
  {
    _id: 'agent-work-reviewer',
    _type: 'agent',
    name: 'Work Reviewer',
    role: 'Quality Assurance Reviewer',
    goal: 'Review and validate analysis quality, ensure recommendations are accurate and actionable',
    expertise:
      'Meticulous reviewer with experience in editorial QA, fact-checking, and ' +
      'structured critique. Skilled at spotting logical gaps, unsupported claims, ' +
      'inconsistencies, and areas where more depth or clarity is needed.',
    philosophy:
      'Good enough is not good enough. Every deliverable should be something the ' +
      'team would be proud to put in front of a stakeholder. Be constructive — ' +
      'critique should always include a suggested fix, not just a complaint.',
    thingsToAvoid: [
      'Rubber-stamping work without critical evaluation',
      'Nitpicking style when substance has issues',
      'Providing feedback without clear, actionable improvement suggestions',
      'Missing the forest for the trees — check the overall narrative first',
    ],
    outputStyle:
      'Structured review: start with overall assessment, then specific items ' +
      'listed as "Issue → Suggestion". End with a clear pass/revise verdict.',
    llmModel: 'gpt-5.2',
    verbose: true,
    allowDelegation: false,
    tools: [
      // Original workflow tools
      {_type: 'reference', _ref: 'tool-sitemap-lookup'},
      {_type: 'reference', _ref: 'tool-content-audit'},
      {_type: 'reference', _ref: 'tool-fetch-webpage'},
      {_type: 'reference', _ref: 'tool-fetch-compare'},
      {_type: 'reference', _ref: 'tool-bigquery-visits'},
      // New HTTP tools
      {_type: 'reference', _ref: 'tool-pagespeed'},
    ],
  },
  {
    _id: 'agent-narrative-governor',
    _type: 'agent',
    name: 'Narrative Governor',
    role: 'Narrative Governor',
    goal: 'Compress conversation history into the most salient facts, decisions, and open questions so downstream agents have concise, relevant context without token bloat.',
    expertise:
      'Memory management and information compression. Reads the outputs of prior ' +
      'tasks and produces concise factual summaries for downstream agents.',
    philosophy:
      'Distil, don\'t embellish. Strip out pleasantries, repeated disclaimers, ' +
      'and anything not directly relevant. Keep key decisions, data points, ' +
      'assumptions, and unanswered questions. Never add your own analysis.',
    thingsToAvoid: [
      'Adding analysis or recommendations — only summarise',
      'Including pleasantries or filler text in summaries',
      'Attempting to call tools — this agent has no tools',
      'Producing summaries longer than 250 words',
    ],
    outputStyle: 'Ultra-concise bullet points. Facts only. No narrative or commentary.',
    llmModel: 'gpt-5.2',
    verbose: false,
    allowDelegation: false,
    tools: [],
  },
]

// ────────────────────────────────────────────────────────────────
// CREW
// ────────────────────────────────────────────────────────────────

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
  credentials: credentials.map(c => ({_type: 'reference', _ref: c._id})),
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

// ────────────────────────────────────────────────────────────────
// CREW PLANNER
// ────────────────────────────────────────────────────────────────

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

RULE 0 — CONVERSATION CONTINUITY:
The objective may start with "PREVIOUS RUN SUMMARY:" — this is a concise summary of the last crew run, generated by the Narrative Governor. It may also include "RECENT USER MESSAGES:" for any follow-up messages since the summary.
When conversation history/summary is present:
  - The user is following up on previous work (e.g. "fix the formatting", "make it shorter", "add a section about X").
  - Treat follow-ups as SIMPLE or MODERATE — assign the SAME specialist who produced the original work.
  - Include the summary context in the task description so the agent can see what was produced before.
  - Do NOT ask clarifying questions for simple follow-ups like edits, fixes, or refinements.
  - Do NOT re-run the full original workflow — just the specific fix/change requested.
  - Trust the summary — it was purpose-built for continuity and contains the salient facts.

RULE 1 — MATCH COMPLEXITY (most important rule):
Classify the request FIRST, then plan accordingly.

SIMPLE (direct question like "how do I implement ISR?", "what is SSR?", "explain K-means"):
  → 2 agents (specialist + Work Reviewer), 2 tasks.
  → Task 1: specialist answers the question. Task 2: Work Reviewer reviews and polishes.
  → Task 1 description: the user's question verbatim + "Keep your answer concise and practical. Do not ask follow-up questions."
  → Task 1 expectedOutput: "A concise, practical answer in a few paragraphs. No more than 300 words."
  → Task 2 description: "Review the answer from the previous task. Fix any inaccuracies, improve clarity, and ensure the response is complete and well-structured. Produce the final polished version."
  → Task 2 expectedOutput: "The final polished answer (max 400 words)."
  → questions: [] (empty), inputSchema: [] (empty).

MODERATE (e.g. "compare ISR vs SSR for my e-commerce site", "create a migration plan"):
  → Use the REVIEW LOOP pattern (see below). 2 agents, 3 tasks.
  → questions: only if genuinely needed, max 2.

COMPLEX (e.g. "create a content strategy for X", "create a PPC campaign plan", "analyze our content gaps across SEO and LLM traffic", "build an SEO plan for our product launch"):
  → ALWAYS ask 2-3 clarifying questions BEFORE starting. These are essential to produce useful output.
  → If the request involves analyzing, auditing, or comparing a WEBSITE (content gap analysis, SEO audit, site review, competitor analysis), you MUST ask which website/URL to target. NEVER assume a default — the user must tell you.
  → Examples of good clarifying questions: target website/URL, competitors to compare against, budget/spend range, target market/geo, goals (leads vs awareness vs revenue), timeline, existing assets/constraints, industry/vertical.
  → Even if a skill playbook was selected, ask clarifying questions for any information the skill needs that wasn't already provided (e.g. target URL, competitors, topic focus).
  → Use the REVIEW LOOP pattern with MORE specialist agents contributing.
  → Structure: multiple agents each draft their section → reviewer consolidates feedback → lead agent produces final output.
  → 3-4 agents. Each specialist contributes their perspective (e.g. SEO analysis, marketing positioning, data insights) BEFORE the review step.

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
- EVERY plan — SIMPLE, MODERATE, or COMPLEX — MUST include the Work Reviewer (agent-work-reviewer). This is mandatory with zero exceptions. No output goes to the user without QA.
- Match by role, expertise, and philosophy, not keyword overlap.
- Technical/code/framework questions → Technical SEO Specialist or most technical agent.
- Content strategy / marketing plans → include Product Marketing Manager AND Technical SEO Specialist AND Data Analyst. These are cross-functional tasks that need multiple perspectives.
- NEVER include the Narrative Governor (it's injected automatically).
- Do NOT include agents just because they exist (except Work Reviewer — always include it).

RULE 3 — RESPONSE QUALITY:
- ALWAYS include "Keep your answer concise and practical." in task descriptions.
- ALWAYS include "Do not ask the user follow-up questions in your output." in task descriptions.
- expectedOutput must specify a word limit appropriate to complexity.

Return JSON: { agents: [_id strings], tasks: [{name, description, expectedOutput, agentId, order}], process: "sequential", inputSchema: [], questions: [] }
Every agentId must match an _id from the agents list. expectedOutput is required. process MUST be "sequential" for review loops.`,
}

// ────────────────────────────────────────────────────────────────
// MEMORY POLICY
// ────────────────────────────────────────────────────────────────

const memoryPolicy = {
  _id: 'memory-policy-default',
  _type: 'memoryPolicy',
  name: 'Default Memory Policy',
  enabled: true,
  agent: {_type: 'reference', _ref: 'agent-narrative-governor'},
}

// ────────────────────────────────────────────────────────────────
// SKILLS
// ────────────────────────────────────────────────────────────────

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
    toolsRequired: ['fetch_webpage_content', 'sitemap_lookup'],
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
      'Compare to target site sitemap coverage',
      'Rank gaps by impact',
      'Recommend new content',
    ],
    tags: ['competitive', 'content-gap', 'seo'],
    toolsRequired: ['fetch_webpage_content', 'sitemap_lookup'],
    inputSchema: [
      {name: 'topic', label: 'Topic', type: 'string', required: true},
      {name: 'competitors', label: 'Competitors', type: 'array', required: false},
    ],
    outputSchema: 'Ranked list of content gaps',
    enabled: true,
  },
]

// ────────────────────────────────────────────────────────────────
// SEED RUNNER
// ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Creating credentials...')
  for (const cred of credentials) {
    await client.createOrReplace(cred)
    console.log(`  ✓ ${cred.name} (${cred.type})`)
  }

  console.log('Creating tools...')
  for (const tool of tools) {
    await client.createOrReplace(tool)
    console.log(`  ✓ ${tool.displayName || tool.name} [${tool.implementationType}]`)
  }

  console.log('Creating MCP servers...')
  for (const mcp of mcpServers) {
    await client.createOrReplace(mcp)
    console.log(`  ✓ ${mcp.displayName} (${mcp.transport})`)
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
  console.log('\n📋 Credentials are stored directly in Sanity (storageMethod: "direct").')
  console.log('   Open Sanity Studio → Credentials and paste in your API keys.')
  console.log('   No .env file needed for credentials.\n')
  console.log('   Credential documents created:')
  for (const c of credentials) {
    console.log(`     • ${c.name} (${c.type})`)
  }
  console.log()
}

seed().catch(console.error)
