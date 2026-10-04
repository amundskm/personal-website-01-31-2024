import {defineArrayMember, defineField, defineType} from 'sanity'
import {EditIcon} from '@sanity/icons/Edit'

export const post = defineType({
  name: 'post',
  title: 'Blog post',
  type: 'document',
  icon: EditIcon,
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
      name: 'excerpt',
      type: 'text',
      rows: 3,
      group: 'content',
      description: 'Short summary shown in post lists.',
      validation: (rule) => rule.max(300),
    }),
    defineField({name: 'coverImage', type: 'accessibleImage', group: 'content'}),
    defineField({name: 'body', type: 'blockContent', group: 'content'}),
    defineField({
      name: 'publishedAt',
      type: 'datetime',
      group: 'meta',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'tags',
      type: 'array',
      group: 'meta',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
    }),
    defineField({name: 'seo', type: 'seo', group: 'seo'}),
  ],
  orderings: [
    {
      title: 'Newest first',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {title: 'title', date: 'publishedAt', media: 'coverImage'},
    prepare: ({title, date, media}) => ({
      title,
      subtitle: date ? new Date(date).toLocaleDateString() : 'Unscheduled',
      media,
    }),
  },
})
