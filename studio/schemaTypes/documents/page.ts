import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons/Document'
import {blockTypes} from '../blocks'

/** Slugs that collide with built-in Angular routes. */
const RESERVED_SLUGS = ['blog', 'projects']

export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  icon: DocumentIcon,
  groups: [
    {name: 'content', title: 'Content', default: true},
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
      description: 'Use "home" for the homepage. Other pages are served at /<slug>.',
      options: {source: 'title', maxLength: 96},
      validation: (rule) =>
        rule
          .required()
          .custom((slug) =>
            slug?.current && RESERVED_SLUGS.includes(slug.current)
              ? `"${slug.current}" is reserved for a built-in route`
              : true,
          ),
    }),
    defineField({
      name: 'sections',
      title: 'Page sections',
      type: 'array',
      group: 'content',
      description: 'Build the page by adding, removing and reordering sections.',
      of: blockTypes.map((block) => ({type: block.name})),
      options: {
        insertMenu: {
          views: [{name: 'list'}, {name: 'grid'}],
        },
      },
    }),
    defineField({name: 'seo', type: 'seo', group: 'seo'}),
  ],
  preview: {
    select: {title: 'title', slug: 'slug.current'},
    prepare: ({title, slug}) => ({title, subtitle: slug === 'home' ? '/' : `/${slug ?? ''}`}),
  },
})
