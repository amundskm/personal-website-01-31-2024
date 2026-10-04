import {defineArrayMember, defineField, defineType} from 'sanity'
import {StarIcon} from '@sanity/icons/Star'
import {SECTION_THEMES} from './themes'

export const heroBlock = defineType({
  name: 'heroBlock',
  title: 'Hero',
  type: 'object',
  icon: StarIcon,
  fields: [
    defineField({name: 'eyebrow', type: 'string', description: 'Small text above the heading.'}),
    defineField({name: 'heading', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'tagline',
      type: 'string',
      description: 'A short punchline shown in gold directly under the heading.',
    }),
    defineField({name: 'subheading', type: 'text', rows: 3}),
    defineField({name: 'image', type: 'accessibleImage'}),
    defineField({
      name: 'showMascot',
      title: 'Show wizard mascot',
      type: 'boolean',
      description: 'Shows the wizard beside the heading. Ignored when an image is set.',
      initialValue: false,
      hidden: ({parent}) => !!parent?.image?.asset,
    }),
    defineField({
      name: 'buttons',
      type: 'array',
      of: [defineArrayMember({type: 'link'})],
      validation: (rule) => rule.max(3),
    }),
    defineField({
      name: 'layout',
      type: 'string',
      options: {list: ['centered', 'split'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'centered',
    }),
    defineField({
      name: 'theme',
      type: 'string',
      options: {list: SECTION_THEMES, layout: 'radio', direction: 'horizontal'},
      initialValue: 'light',
    }),
  ],
  preview: {
    select: {title: 'heading', media: 'image'},
    prepare: ({title, media}) => ({title, subtitle: 'Hero', media}),
  },
})
