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
 * Credential types from source:
 * - anthropic: { api_key }
 * - google_ads: { developer_token, client_id, client_secret, refresh_token, customer_id }
 * - gsc: { key_file, site_url }
 * - bigquery: { credentials_file, tables }
 * - openai: { api_key }
 * - reddit: { client_id, client_secret, user_agent }
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
          {title: 'Google Ads', value: 'google_ads'},
          {title: 'Google Search Console', value: 'gsc'},
          {title: 'OpenAI', value: 'openai'},
          {title: 'Reddit', value: 'reddit'},
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
    
    // Anthropic credentials
    defineField({
      name: 'anthropicApiKey',
      title: 'Anthropic API Key',
      type: 'string',
      description: 'API key or env var name (e.g., "ANTHROPIC_API_KEY")',
      hidden: ({document}) => document?.type !== 'anthropic',
    }),
    
    // OpenAI credentials
    defineField({
      name: 'openaiApiKey',
      title: 'OpenAI API Key',
      type: 'string',
      description: 'API key or env var name',
      hidden: ({document}) => document?.type !== 'openai',
    }),
    
    // BigQuery credentials
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
    
    // Google Search Console credentials
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
    
    // Google Ads credentials
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
    
    // Reddit credentials
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
      description: 'e.g., "SanityContentGapBot/1.0"',
      hidden: ({document}) => document?.type !== 'reddit',
    }),
    
    // Metadata
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
