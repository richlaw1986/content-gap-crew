import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'memoryPolicy',
  title: 'Memory Policy',
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
      name: 'agent',
      title: 'Memory Agent',
      type: 'reference',
      to: [{type: 'agent'}],
      description: 'Agent that summarizes context between tasks',
      validation: (Rule) => Rule.required(),
    }),
  ],
})
