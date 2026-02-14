import {defineType, defineField} from 'sanity'

/**
 * Tool Schema
 *
 * Represents a tool that agents can use. Tools can be:
 * - **builtin**: Implemented in the backend (the `name` field maps to a function in the tool registry)
 * - **http**: A declarative HTTP API call — configured entirely from the Studio, no deploy needed
 *
 * MCP tools are discovered dynamically via `mcpServer` documents and don't appear here.
 */
export default defineType({
  name: 'tool',
  title: 'Tool',
  type: 'document',
  groups: [
    {name: 'basic', title: 'Basic', default: true},
    {name: 'http', title: 'HTTP Config'},
    {name: 'advanced', title: 'Advanced'},
  ],
  fields: [
    // ── Basic ──────────────────────────────────────────────
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      group: 'basic',
      description: 'Unique function name (snake_case). For builtin tools this must match the backend tool registry.',
      validation: (Rule) =>
        Rule.required()
          .regex(/^[a-z][a-z0-9_]*$/, {name: 'snake_case', invert: false})
          .error('Name must be snake_case'),
    }),
    defineField({
      name: 'displayName',
      title: 'Display Name',
      type: 'string',
      group: 'basic',
      description: 'Human-readable name for the UI',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      group: 'basic',
      description: 'What this tool does — shown to agents so they know when to use it',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'implementationType',
      title: 'Implementation',
      type: 'string',
      group: 'basic',
      description: 'How this tool runs. Built-in = code in the backend tool registry. HTTP = declarative API call configured below.',
      initialValue: 'builtin',
      options: {
        list: [
          {title: 'Built-in', value: 'builtin'},
          {title: 'HTTP API Call', value: 'http'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'credentialTypes',
      title: 'Required Credential Types',
      type: 'array',
      group: 'basic',
      of: [{type: 'string'}],
      description: 'Credential types this tool needs (e.g., ["bigquery", "gsc"]). For HTTP tools, credentials are injected as headers/params.',
      options: {
        list: [
          {title: 'Anthropic', value: 'anthropic'},
          {title: 'BigQuery', value: 'bigquery'},
          {title: 'Brave Search', value: 'brave'},
          {title: 'Clearbit', value: 'clearbit'},
          {title: 'GitHub', value: 'github'},
          {title: 'Google Ads', value: 'google_ads'},
          {title: 'Google API Key', value: 'google_api'},
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
    }),
    defineField({
      name: 'parameters',
      title: 'Parameters',
      type: 'array',
      group: 'basic',
      description: 'Input parameters the agent must provide when calling this tool',
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
              options: {list: ['string', 'number', 'boolean', 'array']},
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
            select: {title: 'name', subtitle: 'type'},
          },
        },
      ],
    }),

    // ── HTTP Configuration ─────────────────────────────────
    defineField({
      name: 'httpConfig',
      title: 'HTTP Configuration',
      type: 'object',
      group: 'http',
      hidden: ({parent}) => parent?.implementationType !== 'http',
      description: 'Configure how this tool calls an external HTTP API. Use {{paramName}} placeholders in URL and body templates.',
      fields: [
        defineField({
          name: 'method',
          title: 'HTTP Method',
          type: 'string',
          initialValue: 'GET',
          options: {
            list: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            layout: 'radio',
          },
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'urlTemplate',
          title: 'URL Template',
          type: 'string',
          description: 'URL with {{param}} placeholders, e.g. https://api.example.com/search?q={{query}}&limit={{limit}}',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'headers',
          title: 'Headers',
          type: 'array',
          description: 'Static headers sent with every request. Use {{credential.fieldName}} for credential injection.',
          of: [
            {
              type: 'object',
              fields: [
                defineField({name: 'key', title: 'Header Name', type: 'string', validation: (Rule) => Rule.required()}),
                defineField({name: 'value', title: 'Header Value', type: 'string', validation: (Rule) => Rule.required()}),
              ],
              preview: {select: {title: 'key', subtitle: 'value'}},
            },
          ],
        }),
        defineField({
          name: 'bodyTemplate',
          title: 'Body Template (JSON)',
          type: 'text',
          description: 'JSON body with {{param}} placeholders. Only used for POST/PUT/PATCH.',
        }),
        defineField({
          name: 'responsePath',
          title: 'Response Path',
          type: 'string',
          description: 'Dot-notation path to extract from the JSON response, e.g. "data.results" or "items[0].text". Leave blank to return the full response.',
        }),
        defineField({
          name: 'responseMaxLength',
          title: 'Max Response Length',
          type: 'number',
          description: 'Truncate the response to this many characters (to avoid token overflows). Default: 4000.',
          initialValue: 4000,
        }),
      ],
    }),

    // ── Advanced ───────────────────────────────────────────
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      group: 'advanced',
      description: 'Whether this tool is available for use',
      initialValue: true,
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      group: 'advanced',
      options: {
        list: [
          {title: 'Data Analysis', value: 'data'},
          {title: 'Search & SEO', value: 'search'},
          {title: 'Content', value: 'content'},
          {title: 'Social', value: 'social'},
          {title: 'AI/LLM', value: 'ai'},
          {title: 'Web', value: 'web'},
          {title: 'Marketing', value: 'marketing'},
        ],
      },
    }),
  ],
  preview: {
    select: {
      title: 'displayName',
      subtitle: 'name',
      enabled: 'enabled',
      implType: 'implementationType',
    },
    prepare({title, subtitle, enabled, implType}) {
      const badge = implType === 'http' ? '🌐 ' : '⚙️ '
      return {
        title: badge + (title || subtitle),
        subtitle: enabled === false ? `${subtitle} (disabled)` : subtitle,
      }
    },
  },
})
