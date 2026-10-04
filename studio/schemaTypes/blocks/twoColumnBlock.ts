import {defineField, defineType} from 'sanity'
import {SplitVerticalIcon} from '@sanity/icons/SplitVertical'

const column = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: 'object',
    fields: [
      defineField({name: 'content', type: 'blockContent'}),
      defineField({
        name: 'image',
        type: 'accessibleImage',
        description: 'Shown instead of the text when set.',
      }),
    ],
  })

export const twoColumnBlock = defineType({
  name: 'twoColumnBlock',
  title: 'Two columns',
  type: 'object',
  icon: SplitVerticalIcon,
  fields: [
    defineField({name: 'heading', type: 'string'}),
    defineField({
      name: 'layout',
      type: 'string',
      options: {
        list: [
          {title: 'Even columns', value: 'even'},
          {title: 'Text with sidebar', value: 'aside'},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      description:
        'Text with sidebar lines the left column up with the page’s other text and moves the right column into the margin as a sidebar.',
      initialValue: 'even',
    }),
    column('left', 'Left column'),
    column('right', 'Right column'),
    defineField({
      name: 'verticalAlign',
      type: 'string',
      options: {list: ['top', 'center'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'center',
      hidden: ({parent}) => parent?.layout === 'aside',
    }),
    defineField({
      name: 'reverseOnMobile',
      type: 'boolean',
      description: 'Show the right column first on small screens.',
      initialValue: false,
      hidden: ({parent}) => parent?.layout === 'aside',
    }),
  ],
  preview: {
    select: {title: 'heading', media: 'left.image'},
    prepare: ({title, media}) => ({title: title || 'Two columns', subtitle: 'Two columns', media}),
  },
})
