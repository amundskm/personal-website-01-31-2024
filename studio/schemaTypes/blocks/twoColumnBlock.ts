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
    column('left', 'Left column'),
    column('right', 'Right column'),
    defineField({
      name: 'verticalAlign',
      type: 'string',
      options: {list: ['top', 'center'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'center',
    }),
    defineField({
      name: 'reverseOnMobile',
      type: 'boolean',
      description: 'Show the right column first on small screens.',
      initialValue: false,
    }),
  ],
  preview: {
    select: {title: 'heading', media: 'left.image'},
    prepare: ({title, media}) => ({title: title || 'Two columns', subtitle: 'Two columns', media}),
  },
})
