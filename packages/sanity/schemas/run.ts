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
      description: 'The crew configuration used for this run (optional for planned runs)',
    }),
    defineField({
      name: 'planner',
      title: 'Planner',
      type: 'reference',
      to: [{type: 'crewPlanner'}],
      description: 'Planner configuration used to assemble a dynamic crew',
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
        defineField({
          name: 'inputSchema',
          title: 'Input Schema',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                {name: 'name', title: 'Field Name', type: 'string'},
                {name: 'label', title: 'Display Label', type: 'string'},
                {name: 'type', title: 'Field Type', type: 'string'},
                {name: 'required', title: 'Required', type: 'boolean'},
                {name: 'placeholder', title: 'Placeholder', type: 'string'},
                {name: 'helpText', title: 'Help Text', type: 'string'},
                {name: 'defaultValue', title: 'Default Value', type: 'string'},
                {name: 'options', title: 'Options', type: 'array', of: [{type: 'string'}]},
              ],
            },
          ],
        }),
      ],
    }),
    defineField({
      name: 'objective',
      title: 'Objective',
      type: 'text',
      description: 'The original user objective / prompt that triggered this run',
    }),
    defineField({
      name: 'questions',
      title: 'Clarifying Questions',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Questions the planner asked before execution',
    }),
    defineField({
      name: 'clarification',
      title: 'User Clarification',
      type: 'text',
      description: "User's answers to the planner's clarifying questions",
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
