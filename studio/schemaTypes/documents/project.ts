import {defineArrayMember, defineField, defineType} from 'sanity'
import {ProjectsIcon} from '@sanity/icons/Projects'

export const project = defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  icon: ProjectsIcon,
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'meta', title: 'Details'},
    {name: 'seo', title: 'SEO'},
  ],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'content',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'summary',
      type: 'text',
      rows: 3,
      group: 'content',
      description: 'One or two sentences shown on project cards.',
      validation: (rule) => rule.max(300),
    }),
    defineField({name: 'coverImage', type: 'accessibleImage', group: 'content'}),
    defineField({name: 'body', type: 'blockContent', group: 'content'}),
    defineField({
      name: 'gallery',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({type: 'accessibleImage'})],
      options: {layout: 'grid'},
    }),
    defineField({
      name: 'techStack',
      title: 'Tech stack',
      type: 'array',
      group: 'meta',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
    }),
    defineField({name: 'repoUrl', title: 'Repository URL', type: 'url', group: 'meta'}),
    defineField({name: 'liveUrl', title: 'Live URL', type: 'url', group: 'meta'}),
    defineField({name: 'year', type: 'number', group: 'meta'}),
    defineField({
      name: 'featured',
      type: 'boolean',
      group: 'meta',
      description: 'Featured projects appear in "featured" project grids.',
      initialValue: false,
    }),
    defineField({
      name: 'order',
      type: 'number',
      group: 'meta',
      description: 'Lower numbers are shown first.',
      initialValue: 100,
    }),
    defineField({name: 'seo', type: 'seo', group: 'seo'}),
  ],
  orderings: [
    {title: 'Display order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'title', featured: 'featured', year: 'year', media: 'coverImage'},
    prepare: ({title, featured, year, media}) => ({
      title,
      subtitle: [featured ? '★ Featured' : null, year].filter(Boolean).join(' · '),
      media,
    }),
  },
})
