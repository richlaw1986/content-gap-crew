import {defineType, defineField} from 'sanity'

/**
 * Agent Schema
 * 
 * Represents a CrewAI agent with role, goal, backstory, and tool assignments.
 * Maps to the Agent class in the source CrewAI script.
 * 
 * Source agents:
 * - data_analyst
 * - product_marketer  
 * - seo_specialist
 * - work_reviewer
 * - narrative_governor
 */
export default defineType({
  name: 'agent',
  title: 'Agent',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Unique identifier for the agent (e.g., "data_analyst")',
      validation: (Rule) => Rule.required().regex(/^[a-z][a-z0-9_]*$/, {
        name: 'snake_case',
        invert: false,
      }).error('Name must be snake_case (lowercase letters, numbers, underscores)'),
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      description: 'The role this agent plays (e.g., "Data Analyst")',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'goal',
      title: 'Goal',
      type: 'text',
      description: 'What this agent is trying to achieve',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'backstory',
      title: 'Backstory',
      type: 'text',
      description: 'Context and expertise that shapes how the agent approaches tasks',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tools',
      title: 'Tools',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tool'}]}],
      description: 'Tools this agent can use',
    }),
    defineField({
      name: 'llmTier',
      title: 'LLM Tier',
      type: 'string',
      description: 'Which LLM tier to use for this agent',
      options: {
        list: [
          {title: 'Default (Sonnet)', value: 'default'},
          {title: 'Smart (Opus)', value: 'smart'},
          {title: 'Fast (Haiku)', value: 'fast'},
        ],
      },
      initialValue: 'default',
    }),
    defineField({
      name: 'verbose',
      title: 'Verbose',
      type: 'boolean',
      description: 'Enable verbose logging for this agent',
      initialValue: true,
    }),
    defineField({
      name: 'allowDelegation',
      title: 'Allow Delegation',
      type: 'boolean',
      description: 'Allow this agent to delegate tasks to other agents',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'role',
      subtitle: 'name',
    },
  },
})
