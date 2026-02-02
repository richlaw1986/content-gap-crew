import {defineType, defineField} from 'sanity'

/**
 * Task Schema
 * 
 * Represents a CrewAI task that an agent executes.
 * Tasks have descriptions, expected outputs, and are assigned to agents.
 * 
 * Source tasks:
 * - data_task (assigned to data_analyst)
 * - marketing_task (assigned to product_marketer)
 * - seo_task (assigned to seo_specialist)
 * - review_task (assigned to work_reviewer, depends on data/marketing/seo tasks)
 * - governance_task (assigned to narrative_governor, depends on all previous)
 */
export default defineType({
  name: 'task',
  title: 'Task',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Unique identifier for the task (e.g., "data_task")',
      validation: (Rule) => Rule.required().regex(/^[a-z][a-z0-9_]*$/, {
        name: 'snake_case',
        invert: false,
      }).error('Name must be snake_case'),
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
      description: 'Detailed instructions for what the agent should do',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expectedOutput',
      title: 'Expected Output',
      type: 'text',
      description: 'What the task should produce when complete',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'agent',
      title: 'Assigned Agent',
      type: 'reference',
      to: [{type: 'agent'}],
      description: 'The agent responsible for this task',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contextTasks',
      title: 'Context Tasks',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'task'}]}],
      description: 'Tasks whose output should be provided as context to this task',
    }),
    defineField({
      name: 'order',
      title: 'Execution Order',
      type: 'number',
      description: 'Order in which this task runs (lower = earlier)',
      validation: (Rule) => Rule.required().integer().positive(),
    }),
    defineField({
      name: 'asyncExecution',
      title: 'Async Execution',
      type: 'boolean',
      description: 'Whether this task can run in parallel with others',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Execution Order',
      name: 'executionOrder',
      by: [{field: 'order', direction: 'asc'}],
    },
  ],
  preview: {
    select: {
      title: 'displayName',
      name: 'name',
      order: 'order',
      agentRole: 'agent.role',
    },
    prepare({title, name, order, agentRole}) {
      return {
        title: title || name,
        subtitle: `#${order} → ${agentRole || 'Unassigned'}`,
      }
    },
  },
})
