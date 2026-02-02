import {defineType, defineField} from 'sanity'

/**
 * MCP Server Schema
 * 
 * Configuration for Model Context Protocol servers.
 * MCP servers provide additional tools and capabilities to agents.
 * 
 * This allows dynamic configuration of external tool providers
 * without code changes.
 */
export default defineType({
  name: 'mcpServer',
  title: 'MCP Server',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Unique identifier for this MCP server',
      validation: (Rule) => Rule.required(),
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
      description: 'What tools/capabilities this server provides',
    }),
    defineField({
      name: 'transport',
      title: 'Transport Type',
      type: 'string',
      options: {
        list: [
          {title: 'Stdio', value: 'stdio'},
          {title: 'HTTP', value: 'http'},
          {title: 'WebSocket', value: 'websocket'},
        ],
      },
      initialValue: 'stdio',
      validation: (Rule) => Rule.required(),
    }),
    
    // Stdio transport config
    defineField({
      name: 'command',
      title: 'Command',
      type: 'string',
      description: 'Command to run (for stdio transport)',
      hidden: ({document}) => document?.transport !== 'stdio',
    }),
    defineField({
      name: 'args',
      title: 'Arguments',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Command arguments',
      hidden: ({document}) => document?.transport !== 'stdio',
    }),
    
    // HTTP/WebSocket transport config
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      description: 'Server URL (for HTTP/WebSocket transport)',
      hidden: ({document}) => document?.transport === 'stdio',
    }),
    
    // Common config
    defineField({
      name: 'env',
      title: 'Environment Variables',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'key', title: 'Key', type: 'string'},
            {name: 'value', title: 'Value', type: 'string'},
            {
              name: 'fromCredential',
              title: 'From Credential',
              type: 'reference',
              to: [{type: 'credential'}],
              description: 'Pull value from a credential instead',
            },
          ],
        },
      ],
      description: 'Environment variables to pass to the server',
    }),
    defineField({
      name: 'tools',
      title: 'Provided Tools',
      type: 'array',
      of: [{type: 'string'}],
      description: 'List of tool names this server provides (for documentation)',
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      description: 'Whether this MCP server is active',
      initialValue: true,
    }),
    defineField({
      name: 'timeout',
      title: 'Timeout (ms)',
      type: 'number',
      description: 'Connection timeout in milliseconds',
      initialValue: 30000,
    }),
  ],
  preview: {
    select: {
      title: 'displayName',
      name: 'name',
      transport: 'transport',
      enabled: 'enabled',
    },
    prepare({title, name, transport, enabled}) {
      return {
        title: title || name,
        subtitle: `${transport}${enabled ? '' : ' (disabled)'}`,
      }
    },
  },
})
