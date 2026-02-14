import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'skill',
  title: 'Skill',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      description: 'What this skill is for and when to use it',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'steps',
      title: 'Steps',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Repeatable procedure steps',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Keywords for discovery and matching',
    }),
    defineField({
      name: 'toolsRequired',
      title: 'Tools Required',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Tool names needed to execute this skill',
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
      description: 'Optional structured inputs for this skill',
    }),
    defineField({
      name: 'outputSchema',
      title: 'Output Schema',
      type: 'text',
      description: 'Expected output shape or format (e.g. "Ranked list of content gaps")',
    }),
    defineField({
      name: 'playbook',
      title: 'Playbook',
      type: 'text',
      rows: 15,
      description:
        'Full narrative instructions (Markdown). For local skills this is optional rich context; ' +
        'for ecosystem skills it is the original SKILL.md content.',
    }),
    defineField({
      name: 'references',
      title: 'References',
      type: 'array',
      description: 'Supporting reference files (e.g. brand scripts, personas, competitive positioning)',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required()}),
            defineField({
              name: 'content',
              title: 'Content',
              type: 'text',
              rows: 12,
              description: 'Markdown content of this reference file',
            }),
          ],
          preview: {
            select: {title: 'name', content: 'content'},
            prepare({title, content}) {
              return {
                title: title || 'Untitled Reference',
                subtitle: content ? `${content.length.toLocaleString()} chars` : 'Empty',
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      description: 'Where this skill came from',
      options: {
        list: [
          {title: 'Local (Studio)', value: 'local'},
          {title: 'Ecosystem (skills.sh)', value: 'ecosystem'},
        ],
      },
      initialValue: 'local',
    }),
    defineField({
      name: 'ecosystemId',
      title: 'Ecosystem ID',
      type: 'string',
      description: 'The skills.sh identifier (e.g. owner/repo/skill-name)',
      hidden: ({document}) => document?.source !== 'ecosystem',
      readOnly: true,
    }),
    defineField({
      name: 'ecosystemInstalls',
      title: 'Ecosystem Installs',
      type: 'number',
      description: 'Number of installs on skills.sh',
      hidden: ({document}) => document?.source !== 'ecosystem',
      readOnly: true,
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      source: 'source',
      description: 'description',
    },
    prepare({title, source, description}) {
      return {
        title: title || 'Untitled Skill',
        subtitle: `${source === 'ecosystem' ? '🌐 Ecosystem' : '📁 Local'} — ${(description || '').slice(0, 80)}`,
      }
    },
  },
})
