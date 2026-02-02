import {defineType, defineField} from 'sanity'

/**
 * Crew Schema
 * 
 * Represents a complete CrewAI crew configuration.
 * A crew combines agents, tasks, and execution settings.
 * 
 * This allows multiple crew configurations to be stored and selected at runtime.
 * For example: "content-gap-full", "content-gap-quick", "ai-topics-only"
 */
export default defineType({
  name: 'crew',
  title: 'Crew',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Unique identifier for this crew configuration',
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
      description: 'What this crew configuration is designed for',
    }),
    defineField({
      name: 'agents',
      title: 'Agents',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'agent'}]}],
      description: 'Agents included in this crew',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'tasks',
      title: 'Tasks',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'task'}]}],
      description: 'Tasks to execute (in order)',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'process',
      title: 'Process Type',
      type: 'string',
      description: 'How tasks are executed',
      options: {
        list: [
          {title: 'Sequential', value: 'sequential'},
          {title: 'Hierarchical', value: 'hierarchical'},
        ],
      },
      initialValue: 'sequential',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'memory',
      title: 'Enable Memory',
      type: 'boolean',
      description: 'Whether to enable CrewAI memory between tasks',
      initialValue: false,
    }),
    defineField({
      name: 'verbose',
      title: 'Verbose Logging',
      type: 'boolean',
      description: 'Enable detailed logging during execution',
      initialValue: true,
    }),
    defineField({
      name: 'defaultInputs',
      title: 'Default Inputs',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'key', title: 'Key', type: 'string'},
            {name: 'value', title: 'Value', type: 'text'},
          ],
        },
      ],
      description: 'Default input values for crew runs',
    }),
    defineField({
      name: 'focusAreas',
      title: 'Focus Areas',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Default focus areas/topics for content gap analysis',
    }),
    defineField({
      name: 'credentials',
      title: 'Credentials',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'credential'}]}],
      description: 'Credential sets to use for this crew',
    }),
    defineField({
      name: 'isDefault',
      title: 'Default Crew',
      type: 'boolean',
      description: 'Use this crew when none is specified',
      initialValue: false,
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      description: 'Whether this crew is available for use',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'displayName',
      name: 'name',
      agentCount: 'agents.length',
      taskCount: 'tasks.length',
      isDefault: 'isDefault',
    },
    prepare({title, name, isDefault}) {
      return {
        title: title || name,
        subtitle: isDefault ? '⭐ Default' : name,
      }
    },
  },
})
