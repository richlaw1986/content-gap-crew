import {defineType, defineField} from 'sanity'

/**
 * Tool Schema
 * 
 * Represents a CrewAI tool that agents can use.
 * Each tool declares which credential types it requires.
 * 
 * Source tools (14 total):
 * - bigquery_describe_table (requires: bigquery)
 * - bigquery_llm_visits (requires: bigquery)
 * - bigquery_custom_query (requires: bigquery)
 * - sanity_sitemap_lookup (no auth)
 * - sanity_content_audit (no auth)
 * - gsc_performance_lookup (requires: gsc)
 * - google_ads_keyword_ideas (requires: google_ads)
 * - reddit_discussion_lookup (requires: reddit)
 * - openai_query_fanout (requires: openai)
 * - top_google_search_pages (no auth)
 * - top_aeo_pages (no auth)
 * - fetch_webpage_content (no auth)
 * - fetch_and_compare_urls (no auth)
 * - competitor_content_gaps (no auth)
 */
export default defineType({
  name: 'tool',
  title: 'Tool',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Function name matching the Python tool (e.g., "bigquery_llm_visits")',
      validation: (Rule) => Rule.required().regex(/^[a-z][a-z0-9_]*$/, {
        name: 'snake_case',
        invert: false,
      }).error('Name must be snake_case'),
    }),
    defineField({
      name: 'displayName',
      title: 'Display Name',
      type: 'string',
      description: 'Human-readable name for the UI',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      description: 'What this tool does - shown to agents and in the UI',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'credentialTypes',
      title: 'Required Credential Types',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Credential types this tool needs (e.g., ["bigquery", "gsc"])',
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
    }),
    defineField({
      name: 'parameters',
      title: 'Parameters',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Parameter Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'type',
              title: 'Type',
              type: 'string',
              options: {
                list: ['string', 'number', 'boolean', 'array'],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'string',
            }),
            defineField({
              name: 'required',
              title: 'Required',
              type: 'boolean',
              initialValue: true,
            }),
            defineField({
              name: 'default',
              title: 'Default Value',
              type: 'string',
              description: 'Default value (as string, will be parsed based on type)',
            }),
          ],
          preview: {
            select: {
              title: 'name',
              subtitle: 'type',
            },
          },
        },
      ],
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      description: 'Whether this tool is available for use',
      initialValue: true,
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Data Analysis', value: 'data'},
          {title: 'Search & SEO', value: 'search'},
          {title: 'Content', value: 'content'},
          {title: 'Social', value: 'social'},
          {title: 'AI/LLM', value: 'ai'},
        ],
      },
    }),
  ],
  preview: {
    select: {
      title: 'displayName',
      subtitle: 'name',
      enabled: 'enabled',
    },
    prepare({title, subtitle, enabled}) {
      return {
        title: title || subtitle,
        subtitle: enabled ? subtitle : `${subtitle} (disabled)`,
      }
    },
  },
})
