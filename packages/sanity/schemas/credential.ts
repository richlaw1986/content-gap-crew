import {defineType, defineField} from 'sanity'

/**
 * Credential Schema
 *
 * Stores API credentials and authentication details.
 *
 * SECURITY NOTE: In production, sensitive values should be stored
 * encrypted or reference external secret managers. This schema
 * supports both direct values and external references.
 *
 * Credential types:
 * - anthropic: { api_key }
 * - bigquery: { credentials_file, tables }
 * - brave: { api_key }
 * - clearbit: { api_key }
 * - github: { personal_access_token }
 * - google_ads: { developer_token, client_id, client_secret, refresh_token, customer_id }
 * - google_api: { api_key } — shared key for PageSpeed, YouTube, etc.
 * - gsc: { key_file, site_url }
 * - hunter: { api_key }
 * - openai: { api_key }
 * - reddit: { client_id, client_secret, user_agent }
 * - sanity: { api_token, project_id, dataset }
 * - semrush: { api_key }
 * - serpapi: { api_key }
 * - slack: { webhook_url }
 */
export default defineType({
  name: 'credential',
  title: 'Credential',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Identifier for this credential set (e.g., "production-bigquery")',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'type',
      title: 'Credential Type',
      type: 'string',
      description: 'The service this credential authenticates with',
      options: {
        list: [
          {title: 'Anthropic', value: 'anthropic'},
          {title: 'BigQuery', value: 'bigquery'},
          {title: 'Brave Search', value: 'brave'},
          {title: 'Clearbit', value: 'clearbit'},
          {title: 'GitHub', value: 'github'},
          {title: 'Google Ads', value: 'google_ads'},
          {title: 'Google API Key (PageSpeed / YouTube / etc.)', value: 'google_api'},
          {title: 'Google Search Console', value: 'gsc'},
          {title: 'Hunter.io', value: 'hunter'},
          {title: 'OpenAI', value: 'openai'},
          {title: 'Reddit', value: 'reddit'},
          {title: 'Sanity', value: 'sanity'},
          {title: 'Semrush', value: 'semrush'},
          {title: 'SerpApi', value: 'serpapi'},
          {title: 'Slack', value: 'slack'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'storageMethod',
      title: 'Storage Method',
      type: 'string',
      description: 'How the credential values are stored',
      options: {
        list: [
          {title: 'Environment Variable', value: 'env'},
          {title: 'Direct Value (not recommended for production)', value: 'direct'},
          {title: 'External Secret Manager', value: 'external'},
        ],
      },
      initialValue: 'env',
      validation: (Rule) => Rule.required(),
    }),

    // ── Simple API-key credentials ────────────────────────
    defineField({
      name: 'anthropicApiKey',
      title: 'Anthropic API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "ANTHROPIC_API_KEY")',
      hidden: ({document}) => document?.type !== 'anthropic',
    }),
    defineField({
      name: 'openaiApiKey',
      title: 'OpenAI API Key',
      type: 'string',
      description: 'API key or env var name',
      hidden: ({document}) => document?.type !== 'openai',
    }),
    defineField({
      name: 'braveApiKey',
      title: 'Brave Search API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "BRAVE_API_KEY")',
      hidden: ({document}) => document?.type !== 'brave',
    }),
    defineField({
      name: 'serpApiKey',
      title: 'SerpApi API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "SERPAPI_KEY")',
      hidden: ({document}) => document?.type !== 'serpapi',
    }),
    defineField({
      name: 'semrushApiKey',
      title: 'Semrush API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "SEMRUSH_API_KEY")',
      hidden: ({document}) => document?.type !== 'semrush',
    }),
    defineField({
      name: 'googleApiKey',
      title: 'Google API Key',
      type: 'string',
      description: 'Shared API key for Google services (PageSpeed, YouTube, etc.)',
      hidden: ({document}) => document?.type !== 'google_api',
    }),
    defineField({
      name: 'hunterApiKey',
      title: 'Hunter.io API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "HUNTER_API_KEY")',
      hidden: ({document}) => document?.type !== 'hunter',
    }),
    defineField({
      name: 'clearbitApiKey',
      title: 'Clearbit API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "CLEARBIT_API_KEY")',
      hidden: ({document}) => document?.type !== 'clearbit',
    }),

    // ── GitHub credentials ────────────────────────────────
    defineField({
      name: 'githubPersonalAccessToken',
      title: 'Personal Access Token',
      type: 'string',
      description: 'GitHub PAT or env var name (e.g., "GITHUB_PERSONAL_ACCESS_TOKEN")',
      hidden: ({document}) => document?.type !== 'github',
    }),

    // ── Sanity credentials ────────────────────────────────
    defineField({
      name: 'sanityApiToken',
      title: 'API Token',
      type: 'string',
      description: 'Sanity API token or env var name',
      hidden: ({document}) => document?.type !== 'sanity',
    }),
    defineField({
      name: 'sanityProjectId',
      title: 'Project ID',
      type: 'string',
      description: 'Sanity project ID',
      hidden: ({document}) => document?.type !== 'sanity',
    }),
    defineField({
      name: 'sanityDataset',
      title: 'Dataset',
      type: 'string',
      description: 'Sanity dataset name (default: production)',
      hidden: ({document}) => document?.type !== 'sanity',
    }),

    // ── Slack credentials ─────────────────────────────────
    defineField({
      name: 'slackWebhookUrl',
      title: 'Webhook URL',
      type: 'string',
      description: 'Slack incoming webhook URL or env var name',
      hidden: ({document}) => document?.type !== 'slack',
    }),

    // ── BigQuery credentials ──────────────────────────────
    defineField({
      name: 'bigqueryCredentialsFile',
      title: 'Credentials File Path',
      type: 'string',
      description: 'Path to service account JSON file',
      hidden: ({document}) => document?.type !== 'bigquery',
    }),
    defineField({
      name: 'bigqueryTables',
      title: 'Table Mappings',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'alias', title: 'Alias', type: 'string'},
            {name: 'fullTableId', title: 'Full Table ID', type: 'string'},
          ],
        },
      ],
      hidden: ({document}) => document?.type !== 'bigquery',
    }),

    // ── Google Search Console credentials ─────────────────
    defineField({
      name: 'gscKeyFile',
      title: 'Service Account Key File',
      type: 'string',
      description: 'Path to service account JSON file',
      hidden: ({document}) => document?.type !== 'gsc',
    }),
    defineField({
      name: 'gscSiteUrl',
      title: 'Site URL',
      type: 'url',
      description: 'The site URL in GSC (e.g., "https://www.sanity.io/")',
      hidden: ({document}) => document?.type !== 'gsc',
    }),

    // ── Google Ads credentials ────────────────────────────
    defineField({
      name: 'googleAdsDeveloperToken',
      title: 'Developer Token',
      type: 'string',
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    defineField({
      name: 'googleAdsClientId',
      title: 'Client ID',
      type: 'string',
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    defineField({
      name: 'googleAdsClientSecret',
      title: 'Client Secret',
      type: 'string',
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    defineField({
      name: 'googleAdsRefreshToken',
      title: 'Refresh Token',
      type: 'string',
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    defineField({
      name: 'googleAdsCustomerId',
      title: 'Customer ID',
      type: 'string',
      hidden: ({document}) => document?.type !== 'google_ads',
    }),

    // ── Reddit credentials ────────────────────────────────
    defineField({
      name: 'redditClientId',
      title: 'Client ID',
      type: 'string',
      hidden: ({document}) => document?.type !== 'reddit',
    }),
    defineField({
      name: 'redditClientSecret',
      title: 'Client Secret',
      type: 'string',
      hidden: ({document}) => document?.type !== 'reddit',
    }),
    defineField({
      name: 'redditUserAgent',
      title: 'User Agent',
      type: 'string',
      description: 'e.g., "ContentGapCrewBot/1.0"',
      hidden: ({document}) => document?.type !== 'reddit',
    }),

    // ── Metadata ──────────────────────────────────────────
    defineField({
      name: 'environment',
      title: 'Environment',
      type: 'string',
      description: 'Which environment this credential is for',
      options: {
        list: [
          {title: 'Development', value: 'development'},
          {title: 'Staging', value: 'staging'},
          {title: 'Production', value: 'production'},
        ],
      },
      initialValue: 'development',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Internal notes about this credential',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      type: 'type',
      environment: 'environment',
    },
    prepare({title, type, environment}) {
      return {
        title,
        subtitle: `${type} (${environment})`,
      }
    },
  },
})
