import {defineType, defineField} from 'sanity'

/**
 * Conversation Schema
 *
 * A persistent conversation thread between the user and agents.
 * Think of it like a Slack channel: messages flow in from users and agents,
 * agents can ask questions mid-task, and the user can give follow-up
 * objectives in the same thread.
 *
 * A conversation can contain multiple runs (each run = one crew execution).
 */
export default defineType({
  name: 'conversation',
  title: 'Conversation',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Short title derived from the first user message',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Awaiting Input', value: 'awaiting_input'},
          {title: 'Completed', value: 'completed'},
          {title: 'Failed', value: 'failed'},
        ],
      },
      initialValue: 'active',
    }),
    defineField({
      name: 'messages',
      title: 'Messages',
      type: 'array',
      description: 'Full message log — user messages, agent messages, system events',
      of: [
        {
          type: 'object',
          name: 'conversationMessage',
          title: 'Message',
          fields: [
            {
              name: 'sender',
              title: 'Sender',
              type: 'string',
              description: 'user | agent role | system | planner',
            },
            {
              name: 'agentId',
              title: 'Agent ID',
              type: 'string',
              description: 'Sanity _id of the agent (if sender is an agent)',
            },
            {
              name: 'type',
              title: 'Type',
              type: 'string',
              options: {
                list: [
                  {title: 'Message', value: 'message'},
                  {title: 'Thinking', value: 'thinking'},
                  {title: 'Question', value: 'question'},
                  {title: 'Answer', value: 'answer'},
                  {title: 'Tool Call', value: 'tool_call'},
                  {title: 'Tool Result', value: 'tool_result'},
                  {title: 'Error', value: 'error'},
                  {title: 'System', value: 'system'},
                ],
              },
              initialValue: 'message',
            },
            {
              name: 'content',
              title: 'Content',
              type: 'text',
            },
            {
              name: 'attachments',
              title: 'Attachments',
              type: 'array',
              description: 'Files attached to this message (uploaded to Sanity CDN)',
              of: [
                {
                  type: 'object',
                  name: 'attachment',
                  fields: [
                    {name: 'assetId', title: 'Asset ID', type: 'string'},
                    {name: 'url', title: 'URL', type: 'url'},
                    {name: 'filename', title: 'Filename', type: 'string'},
                    {name: 'mimeType', title: 'MIME Type', type: 'string'},
                    {name: 'size', title: 'Size (bytes)', type: 'number'},
                  ],
                },
              ],
            },
            {
              name: 'metadata',
              title: 'Metadata',
              type: 'object',
              fields: [
                {name: 'tool', title: 'Tool Name', type: 'string'},
                {name: 'runId', title: 'Run ID', type: 'string'},
                {name: 'taskName', title: 'Task Name', type: 'string'},
              ],
            },
            {
              name: 'timestamp',
              title: 'Timestamp',
              type: 'datetime',
            },
          ],
          preview: {
            select: {
              sender: 'sender',
              content: 'content',
              type: 'type',
            },
            prepare({sender, content, type}) {
              const icon =
                type === 'question'
                  ? '❓'
                  : type === 'answer'
                    ? '💬'
                    : type === 'error'
                      ? '❌'
                      : type === 'tool_call'
                        ? '🔧'
                        : sender === 'user'
                          ? '👤'
                          : '🤖'
              return {
                title: `${icon} ${sender}`,
                subtitle: content?.slice(0, 80),
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'runs',
      title: 'Runs',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'run'}]}],
      description: 'Crew runs executed within this conversation',
    }),
    defineField({
      name: 'activeRunId',
      title: 'Active Run ID',
      type: 'string',
      description: 'The currently executing run (if any)',
    }),
    defineField({
      name: 'lastRunSummary',
      title: 'Last Run Summary',
      type: 'text',
      description:
        'Concise summary of the most recent run, generated by the Narrative Governor. Used as context for follow-up runs in the same conversation.',
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [
        {name: 'userId', title: 'User ID', type: 'string'},
        {name: 'totalRuns', title: 'Total Runs', type: 'number'},
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
      title: 'title',
      status: 'status',
    },
    prepare({title, status}) {
      const statusEmoji = {
        active: '🔵',
        awaiting_input: '💬',
        completed: '✅',
        failed: '❌',
      }[status] || '⚪'
      return {
        title: `${statusEmoji} ${title || 'New Conversation'}`,
        subtitle: status,
      }
    },
  },
})
