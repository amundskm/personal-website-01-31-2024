import {defineField, defineType} from 'sanity'
import {ImageIcon} from '@sanity/icons/Image'

export const imageBlock = defineType({
  name: 'imageBlock',
  title: 'Image',
  type: 'object',
  icon: ImageIcon,
  fields: [
    defineField({name: 'image', type: 'accessibleImage', validation: (rule) => rule.required()}),
    defineField({
      name: 'width',
      type: 'string',
      options: {list: ['content', 'wide', 'full'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'content',
    }),
  ],
  preview: {
    select: {title: 'image.caption', alt: 'image.alt', media: 'image'},
    prepare: ({title, alt, media}) => ({title: title || alt || 'Image', subtitle: 'Image', media}),
  },
})
