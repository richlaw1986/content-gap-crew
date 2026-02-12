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
 
const LLM_MODEL_OPTIONS = [
   {title: 'OpenAI GPT-5.3-Codex', value: 'gpt-5.3-codex'},
   {title: 'OpenAI GPT-5.2', value: 'gpt-5.2'},
   {title: 'OpenAI GPT-5.2 Mini', value: 'gpt-5.2-mini'},
   {title: 'OpenAI GPT-5.2 Nano', value: 'gpt-5.2-nano'},
   {title: 'OpenAI GPT-4.1', value: 'gpt-4.1'},
   {title: 'OpenAI GPT-4.1 Mini', value: 'gpt-4.1-mini'},
   {title: 'OpenAI GPT-4.1 Nano', value: 'gpt-4.1-nano'},
   {title: 'OpenAI GPT-4o', value: 'gpt-4o'},
   {title: 'OpenAI GPT-4o Mini', value: 'gpt-4o-mini'},
   {title: 'OpenAI O1', value: 'o1'},
   {title: 'OpenAI O1 Mini', value: 'o1-mini'},
   {title: 'Anthropic Claude Opus 4.6', value: 'claude-opus-4.6'},
   {title: 'Anthropic Claude Opus 4.5', value: 'claude-opus-4.5'},
   {title: 'Anthropic Claude Sonnet 4', value: 'claude-sonnet-4'},
   {title: 'Anthropic Claude 3.7 Sonnet', value: 'claude-3-7-sonnet-20250219'},
   {title: 'Anthropic Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022'},
   {title: 'Anthropic Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022'},
   {title: 'Anthropic Claude 3 Opus', value: 'claude-3-opus-20240229'},
]
export default defineType({
  name: 'agent',
  title: 'Agent',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Display name for the agent (e.g., "Data Analyst")',
      validation: (Rule) => Rule.required(),
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
      name: 'expertise',
      title: 'Expertise',
      type: 'text',
      rows: 3,
      description: 'Core knowledge domains and skills (e.g., "Deep expertise in SEO metrics, LLM traffic patterns, and statistical modelling")',
    }),
    defineField({
      name: 'philosophy',
      title: 'Philosophy',
      type: 'text',
      rows: 3,
      description: 'How this agent approaches work — values, principles, way of thinking',
    }),
    defineField({
      name: 'thingsToAvoid',
      title: 'Things to Avoid',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Anti-patterns and mistakes this agent should steer clear of',
    }),
    defineField({
      name: 'usefulUrls',
      title: 'Useful URLs',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
            defineField({name: 'url', title: 'URL', type: 'url', validation: (Rule) => Rule.required()}),
          ],
          preview: {
            select: {title: 'title', subtitle: 'url'},
          },
        },
      ],
      description: 'Reference URLs that complement this agent\'s knowledge',
    }),
    defineField({
      name: 'outputStyle',
      title: 'Output Style',
      type: 'text',
      rows: 2,
      description: 'Tone, format preferences, and length guidance (e.g., "Use tables for comparisons. Be concise. Cite data sources.")',
    }),
    defineField({
      name: 'backstory',
      title: 'Backstory (legacy / override)',
      type: 'text',
      rows: 4,
      description: 'Optional freeform backstory. If provided, it is appended after the structured fields above. For new agents, prefer filling in the structured fields instead.',
    }),
    defineField({
      name: 'tools',
      title: 'Tools',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tool'}]}],
      description: 'Tools this agent can use',
    }),
    defineField({
      name: 'llmModel',
      title: 'LLM Model',
      type: 'string',
      description: 'Model to use for this agent',
      options: {
        list: LLM_MODEL_OPTIONS,
      },
      initialValue: 'gpt-5.2',
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
