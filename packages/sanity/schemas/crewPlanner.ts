import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'crewPlanner',
  title: 'Crew Planner',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'usePlannerByDefault',
      title: 'Use Planner By Default',
      type: 'boolean',
      description: 'Use planner when no crew_id is provided',
      initialValue: true,
    }),
    defineField({
      name: 'model',
      title: 'Model',
      type: 'string',
      description: 'Planner LLM model',
      initialValue: 'gpt-5.2',
    }),
    defineField({
      name: 'systemPrompt',
      title: 'System Prompt',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'maxAgents',
      title: 'Max Agents',
      type: 'number',
      initialValue: 6,
    }),
    defineField({
      name: 'process',
      title: 'Process',
      type: 'string',
      options: {
        list: [
          {title: 'Sequential', value: 'sequential'},
          {title: 'Hierarchical', value: 'hierarchical'},
        ],
      },
      initialValue: 'sequential',
    }),
  ],
})
