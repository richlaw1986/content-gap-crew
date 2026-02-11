import {defineType, defineField} from 'sanity'

/**
 * Run Schema
 *
 * Records a single crew execution within a conversation.
 * A conversation can contain multiple runs.
 */
export default defineType({
  name: 'run',
  title: 'Run',
  type: 'document',
  fields: [
    defineField({
      name: 'conversation',
      title: 'Conversation',
      type: 'reference',
      to: [{type: 'conversation'}],
      description: 'The conversation this run belongs to',
    }),
    defineField({
      name: 'crew',
      title: 'Crew',
      type: 'reference',
      to: [{type: 'crew'}],
      description: 'The crew configuration used for this run (optional for planned runs)',
    }),
    defineField({
      name: 'plannedCrew',
      title: 'Planned Crew',
      type: 'object',
      description: 'Planner-selected crew details for dynamic runs',
      fields: [
        defineField({
          name: 'agents',
          title: 'Agents',
          type: 'array',
          of: [{type: 'reference', to: [{type: 'agent'}]}],
        }),
        defineField({
          name: 'tasks',
          title: 'Tasks',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                {name: 'name', title: 'Name', type: 'string'},
                {name: 'description', title: 'Description', type: 'text'},
                {name: 'expectedOutput', title: 'Expected Output', type: 'text'},
                {name: 'agent', title: 'Agent', type: 'reference', to: [{type: 'agent'}]},
                {name: 'order', title: 'Order', type: 'number'},
              ],
            },
          ],
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
        }),
      ],
    }),
    defineField({
      name: 'objective',
      title: 'Objective',
      type: 'text',
      description: 'The objective for this specific run',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Awaiting Input', value: 'awaiting_input'},
          {title: 'Running', value: 'running'},
          {title: 'Completed', value: 'completed'},
          {title: 'Failed', value: 'failed'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'startedAt',
      title: 'Started At',
      type: 'datetime',
    }),
    defineField({
      name: 'completedAt',
      title: 'Completed At',
      type: 'datetime',
    }),
    defineField({
      name: 'inputs',
      title: 'Inputs',
      type: 'object',
      fields: [
        defineField({
          name: 'topic',
          title: 'Topic',
          type: 'string',
        }),
        defineField({
          name: 'focusAreas',
          title: 'Focus Areas',
          type: 'array',
          of: [{type: 'string'}],
        }),
        defineField({
          name: 'customInputs',
          title: 'Custom Inputs',
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
        }),
      ],
    }),
    defineField({
      name: 'output',
      title: 'Final Output',
      type: 'text',
      description: 'The final result from the crew execution',
    }),
    defineField({
      name: 'error',
      title: 'Error',
      type: 'object',
      fields: [
        defineField({
          name: 'message',
          title: 'Message',
          type: 'string',
        }),
        defineField({
          name: 'stack',
          title: 'Stack Trace',
          type: 'text',
        }),
        defineField({
          name: 'taskName',
          title: 'Failed Task',
          type: 'string',
        }),
      ],
      hidden: ({document}) => document?.status !== 'failed',
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [
        defineField({
          name: 'triggeredBy',
          title: 'Triggered By',
          type: 'string',
        }),
        defineField({
          name: 'durationMs',
          title: 'Total Duration (ms)',
          type: 'number',
        }),
      ],
    }),
  ],
  orderings: [
    {
      title: 'Most Recent',
      name: 'recentFirst',
      by: [{field: '_createdAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      objective: 'objective',
      status: 'status',
      startedAt: 'startedAt',
      topic: 'inputs.topic',
    },
    prepare({objective, status, startedAt, topic}) {
      const statusEmoji = {
        pending: '⏳',
        awaiting_input: '💬',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        cancelled: '🚫',
      }[status] || '❓'

      const date = startedAt ? new Date(startedAt).toLocaleDateString() : 'Not started'

      return {
        title: `${statusEmoji} ${topic || objective || 'Untitled run'}`,
        subtitle: date,
      }
    },
  },
})
