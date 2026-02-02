import {defineType, defineField} from 'sanity'

/**
 * Run Schema
 * 
 * Records the execution of a crew run.
 * Stores inputs, outputs, status, and execution logs.
 * 
 * This provides:
 * - Audit trail of all crew executions
 * - Ability to review past results
 * - Debugging information for failed runs
 */
export default defineType({
  name: 'run',
  title: 'Run',
  type: 'document',
  fields: [
    defineField({
      name: 'crew',
      title: 'Crew',
      type: 'reference',
      to: [{type: 'crew'}],
      description: 'The crew configuration used for this run',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
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
      name: 'taskResults',
      title: 'Task Results',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'task',
              title: 'Task',
              type: 'reference',
              to: [{type: 'task'}],
            }),
            defineField({
              name: 'agent',
              title: 'Agent',
              type: 'reference',
              to: [{type: 'agent'}],
            }),
            defineField({
              name: 'status',
              title: 'Status',
              type: 'string',
              options: {
                list: ['pending', 'running', 'completed', 'failed'],
              },
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
              name: 'output',
              title: 'Output',
              type: 'text',
            }),
            defineField({
              name: 'toolCalls',
              title: 'Tool Calls',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    {name: 'tool', title: 'Tool', type: 'string'},
                    {name: 'input', title: 'Input', type: 'text'},
                    {name: 'output', title: 'Output', type: 'text'},
                    {name: 'timestamp', title: 'Timestamp', type: 'datetime'},
                    {name: 'durationMs', title: 'Duration (ms)', type: 'number'},
                  ],
                },
              ],
            }),
          ],
          preview: {
            select: {
              taskName: 'task.name',
              status: 'status',
            },
            prepare({taskName, status}) {
              const statusEmoji = {
                pending: '⏳',
                running: '🔄',
                completed: '✅',
                failed: '❌',
              }[status] || '❓'
              return {
                title: taskName,
                subtitle: `${statusEmoji} ${status}`,
              }
            },
          },
        },
      ],
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
          description: 'User or system that initiated the run',
        }),
        defineField({
          name: 'durationMs',
          title: 'Total Duration (ms)',
          type: 'number',
        }),
        defineField({
          name: 'tokenUsage',
          title: 'Token Usage',
          type: 'object',
          fields: [
            {name: 'input', title: 'Input Tokens', type: 'number'},
            {name: 'output', title: 'Output Tokens', type: 'number'},
            {name: 'total', title: 'Total Tokens', type: 'number'},
          ],
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
      crewName: 'crew.displayName',
      status: 'status',
      startedAt: 'startedAt',
      topic: 'inputs.topic',
    },
    prepare({crewName, status, startedAt, topic}) {
      const statusEmoji = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        cancelled: '🚫',
      }[status] || '❓'
      
      const date = startedAt ? new Date(startedAt).toLocaleDateString() : 'Not started'
      
      return {
        title: `${statusEmoji} ${crewName || 'Unknown Crew'}`,
        subtitle: `${date} — ${topic || 'No topic'}`,
      }
    },
  },
})
