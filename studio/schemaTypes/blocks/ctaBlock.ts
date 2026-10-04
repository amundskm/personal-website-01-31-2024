import {defineField, defineType} from 'sanity'
import {BulbOutlineIcon} from '@sanity/icons/BulbOutline'
import {SECTION_THEMES} from './themes'

export const ctaBlock = defineType({
  name: 'ctaBlock',
  title: 'Call to action',
  type: 'object',
  icon: BulbOutlineIcon,
  fields: [
    defineField({name: 'heading', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'text', type: 'text', rows: 3}),
    defineField({name: 'button', type: 'link'}),
    defineField({
      name: 'theme',
      type: 'string',
      options: {list: SECTION_THEMES, layout: 'radio', direction: 'horizontal'},
      initialValue: 'accent',
    }),
  ],
  preview: {
    select: {title: 'heading'},
    prepare: ({title}) => ({title, subtitle: 'Call to action'}),
  },
})
