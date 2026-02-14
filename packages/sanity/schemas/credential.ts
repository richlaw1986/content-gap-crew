import {defineType, defineField} from 'sanity'
import {SecretInput} from '../components/SecretInput'
import {CredentialWarningBanner} from '../components/CredentialWarningBanner'

// ── Sensitive field names that should be masked when storageMethod is "direct" ──
// Non-sensitive fields (name, type, storageMethod, environment, notes,
// sanityProjectId, sanityDataset, gscSiteUrl, redditUserAgent,
// bigqueryCredentialsFile, gscKeyFile, googleAdsCustomerId, bigqueryTables)
// are left as normal text inputs.

/**
 * Helper: define a string field that uses the SecretInput component
 * (masked when storageMethod is "direct", normal when "env").
 */
function secretField(
  name: string,
  title: string,
  options: {
    description?: string
    hidden?: (ctx: {document?: any}) => boolean
  } = {},
) {
  return defineField({
    name,
    title,
    type: 'string',
    description: options.description,
    hidden: options.hidden,
    components: {input: SecretInput},
  })
}

/**
 * Credential Schema
 *
 * Stores API credentials and authentication details.
 *
 * SECURITY NOTE: In production, use the "Environment Variable" storage method.
 * This stores only the env var name in Sanity — the actual secret lives on
 * your server (in .env or a cloud secret manager like AWS Secrets Manager).
 *
 * When "Direct Value" is selected, fields are masked (password input) and a
 * warning banner is shown reminding editors to switch to env mode for production.
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
          {title: 'Environment Variable (recommended)', value: 'env'},
          {title: 'Direct Value (development only)', value: 'direct'},
          {title: 'External Secret Manager', value: 'external'},
        ],
      },
      initialValue: 'env',
      validation: (Rule) => Rule.required(),
    }),

    // ── Warning banner (rendered after storageMethod) ─────
    // This is a virtual/display-only field that shows a warning when direct mode is active.
    defineField({
      name: 'securityNotice',
      title: ' ',
      type: 'string',
      readOnly: true,
      hidden: ({document}) => document?.storageMethod !== 'direct',
      components: {
        input: CredentialWarningBanner,
      },
    }),

    // ── Simple API-key credentials (sensitive — masked) ───
    secretField('anthropicApiKey', 'Anthropic API Key', {
      description: 'API key or env var name (e.g., "ANTHROPIC_API_KEY")',
      hidden: ({document}) => document?.type !== 'anthropic',
    }),
    secretField('openaiApiKey', 'OpenAI API Key', {
      description: 'API key or env var name',
      hidden: ({document}) => document?.type !== 'openai',
    }),
    secretField('braveApiKey', 'Brave Search API Key', {
      description: 'API key or env var name (e.g., "BRAVE_API_KEY")',
      hidden: ({document}) => document?.type !== 'brave',
    }),
    secretField('serpApiKey', 'SerpApi API Key', {
      description: 'API key or env var name (e.g., "SERPAPI_KEY")',
      hidden: ({document}) => document?.type !== 'serpapi',
    }),
    secretField('semrushApiKey', 'Semrush API Key', {
      description: 'API key or env var name (e.g., "SEMRUSH_API_KEY")',
      hidden: ({document}) => document?.type !== 'semrush',
    }),
    secretField('googleApiKey', 'Google API Key', {
      description: 'Shared API key for Google services (PageSpeed, YouTube, etc.)',
      hidden: ({document}) => document?.type !== 'google_api',
    }),
    secretField('hunterApiKey', 'Hunter.io API Key', {
      description: 'API key or env var name (e.g., "HUNTER_API_KEY")',
      hidden: ({document}) => document?.type !== 'hunter',
    }),
    secretField('clearbitApiKey', 'Clearbit API Key', {
      description: 'API key or env var name (e.g., "CLEARBIT_API_KEY")',
      hidden: ({document}) => document?.type !== 'clearbit',
    }),

    // ── GitHub credentials (sensitive) ────────────────────
    secretField('githubPersonalAccessToken', 'Personal Access Token', {
      description: 'GitHub PAT or env var name (e.g., "GITHUB_PERSONAL_ACCESS_TOKEN")',
      hidden: ({document}) => document?.type !== 'github',
    }),

    // ── Sanity credentials ────────────────────────────────
    secretField('sanityApiToken', 'API Token', {
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

    // ── Slack credentials (sensitive) ─────────────────────
    secretField('slackWebhookUrl', 'Webhook URL', {
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

    // ── Google Ads credentials (sensitive) ─────────────────
    secretField('googleAdsDeveloperToken', 'Developer Token', {
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    secretField('googleAdsClientId', 'Client ID', {
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    secretField('googleAdsClientSecret', 'Client Secret', {
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    secretField('googleAdsRefreshToken', 'Refresh Token', {
      hidden: ({document}) => document?.type !== 'google_ads',
    }),
    defineField({
      name: 'googleAdsCustomerId',
      title: 'Customer ID',
      type: 'string',
      description: 'Google Ads account ID (e.g., "123-456-7890")',
      hidden: ({document}) => document?.type !== 'google_ads',
    }),

    // ── Reddit credentials ────────────────────────────────
    secretField('redditClientId', 'Client ID', {
      hidden: ({document}) => document?.type !== 'reddit',
    }),
    secretField('redditClientSecret', 'Client Secret', {
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
      storageMethod: 'storageMethod',
    },
    prepare({title, type, environment, storageMethod}) {
      const lock = storageMethod === 'env' ? '🔒' : storageMethod === 'direct' ? '⚠️' : '🔗'
      return {
        title: `${lock} ${title || 'Untitled'}`,
        subtitle: `${type} · ${environment || 'development'} · ${storageMethod || 'env'}`,
      }
    },
  },
})
