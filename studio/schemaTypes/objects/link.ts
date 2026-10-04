import {defineField, defineType} from 'sanity'
import {LinkIcon} from '@sanity/icons/Link'

/** A labelled link to either a document on this site or an external URL. */
export const link = defineType({
  name: 'link',
  title: 'Link',
  type: 'object',
  icon: LinkIcon,
  fields: [
    defineField({name: 'label', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'kind',
      type: 'string',
      options: {
        list: [
          {title: 'Page on this site', value: 'internal'},
          {title: 'External URL', value: 'external'},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      initialValue: 'internal',
    }),
    defineField({
      name: 'internal',
      title: 'Page',
      type: 'reference',
      to: [{type: 'page'}, {type: 'post'}, {type: 'project'}],
      hidden: ({parent}) => parent?.kind !== 'internal',
    }),
    defineField({
      name: 'path',
      title: 'Path',
      type: 'string',
      description: 'Optional: link to a fixed route such as /blog or /projects instead of a document.',
      hidden: ({parent}) => parent?.kind !== 'internal',
      validation: (rule) =>
        rule.custom((value) => !value || value.startsWith('/') || 'Paths must start with "/"'),
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      hidden: ({parent}) => parent?.kind !== 'external',
      validation: (rule) => rule.uri({scheme: ['http', 'https', 'mailto', 'tel']}),
    }),
    defineField({
      name: 'style',
      type: 'string',
      description: 'How the link looks when shown as a button.',
      options: {list: ['primary', 'secondary', 'text'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'primary',
    }),
  ],
  preview: {
    select: {title: 'label', url: 'url', path: 'path', ref: 'internal.title'},
    prepare: ({title, url, path, ref}) => ({title, subtitle: url || ref || path}),
  },
})
