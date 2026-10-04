import {defineField, defineType} from 'sanity'
import {TextIcon} from '@sanity/icons/Text'

export const richTextBlock = defineType({
  name: 'richTextBlock',
  title: 'Rich text',
  type: 'object',
  icon: TextIcon,
  fields: [
    defineField({name: 'content', type: 'blockContent'}),
    defineField({
      name: 'width',
      type: 'string',
      options: {list: ['narrow', 'wide'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'narrow',
    }),
  ],
  preview: {
    select: {content: 'content'},
    prepare: ({content}) => {
      const firstBlock = (content ?? []).find((b: {_type: string}) => b._type === 'block')
      const text = firstBlock?.children?.map((c: {text?: string}) => c.text).join('') ?? ''
      return {title: text || 'Empty text', subtitle: 'Rich text'}
    },
  },
})
