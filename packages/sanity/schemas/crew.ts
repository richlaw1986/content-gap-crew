import {defineType, defineField} from 'sanity'

/**
 * Crew Schema
 * 
 * Represents a reusable CrewAI crew configuration.
 * A crew defines agents, execution settings, and input schemas.
 * Tasks are generated dynamically by the planner at runtime.
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
      name: 'inputSchema',
      title: 'Input Schema',
      type: 'array',
      description: 'Defines what inputs this crew requires at runtime',
      of: [
        {
          type: 'object',
          name: 'inputField',
          title: 'Input Field',
          fields: [
            {
              name: 'name',
              title: 'Field Name',
              type: 'string',
              description: 'Variable name used in task templates (e.g., "topic")',
              validation: (Rule) => Rule.required().regex(/^[a-z][a-zA-Z0-9_]*$/, {
                name: 'camelCase',
                invert: false,
              }),
            },
            {
              name: 'label',
              title: 'Display Label',
              type: 'string',
              description: 'Human-readable label for the UI',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'type',
              title: 'Field Type',
              type: 'string',
              options: {
                list: [
                  {title: 'Text (single line)', value: 'string'},
                  {title: 'Text (multiline)', value: 'text'},
                  {title: 'Number', value: 'number'},
                  {title: 'Checkbox', value: 'boolean'},
                  {title: 'List of strings', value: 'array'},
                  {title: 'Dropdown', value: 'select'},
                ],
              },
              initialValue: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'required',
              title: 'Required',
              type: 'boolean',
              description: 'Whether this input must be provided',
              initialValue: true,
            },
            {
              name: 'placeholder',
              title: 'Placeholder',
              type: 'string',
              description: 'Placeholder text for the input field',
            },
            {
              name: 'helpText',
              title: 'Help Text',
              type: 'string',
              description: 'Additional guidance shown below the field',
            },
            {
              name: 'defaultValue',
              title: 'Default Value',
              type: 'string',
              description: 'Default value (as string, parsed based on type)',
            },
            {
              name: 'options',
              title: 'Options',
              type: 'array',
              of: [{type: 'string'}],
              description: 'Options for select/dropdown fields',
              hidden: ({parent}) => parent?.type !== 'select',
            },
          ],
          preview: {
            select: {
              name: 'name',
              label: 'label',
              type: 'type',
              required: 'required',
            },
            prepare({name, label, type, required}) {
              return {
                title: label || name,
                subtitle: `${type}${required ? ' (required)' : ''}`,
              }
            },
          },
        },
      ],
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
