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
      description: 'Expected output shape or format',
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
  ],
})
