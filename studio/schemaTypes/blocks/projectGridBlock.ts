import {defineArrayMember, defineField, defineType} from 'sanity'
import {ProjectsIcon} from '@sanity/icons/Projects'

export const projectGridBlock = defineType({
  name: 'projectGridBlock',
  title: 'Project grid',
  type: 'object',
  icon: ProjectsIcon,
  fields: [
    defineField({name: 'heading', type: 'string'}),
    defineField({name: 'intro', type: 'text', rows: 2}),
    defineField({
      name: 'mode',
      type: 'string',
      options: {
        list: [
          {title: 'Featured projects', value: 'featured'},
          {title: 'All projects', value: 'all'},
          {title: 'Pick manually', value: 'manual'},
        ],
        layout: 'radio',
      },
      initialValue: 'featured',
    }),
    defineField({
      name: 'projects',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'project'}]})],
      hidden: ({parent}) => parent?.mode !== 'manual',
    }),
    defineField({
      name: 'limit',
      type: 'number',
      description: 'Maximum number of projects to show (featured/all modes).',
      initialValue: 6,
      hidden: ({parent}) => parent?.mode === 'manual',
      validation: (rule) => rule.min(1).max(24).integer(),
    }),
    defineField({
      name: 'showViewAll',
      title: 'Show "View all" link',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {title: 'heading', mode: 'mode'},
    prepare: ({title, mode}) => ({title: title || 'Projects', subtitle: `Project grid (${mode})`}),
  },
})
