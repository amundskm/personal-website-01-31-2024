import {defineField, defineType} from 'sanity'
import {EditIcon} from '@sanity/icons/Edit'

export const postListBlock = defineType({
  name: 'postListBlock',
  title: 'Latest posts',
  type: 'object',
  icon: EditIcon,
  fields: [
    defineField({name: 'heading', type: 'string', initialValue: 'Latest writing'}),
    defineField({
      name: 'count',
      type: 'number',
      initialValue: 3,
      validation: (rule) => rule.min(1).max(12).integer(),
    }),
    defineField({
      name: 'showViewAll',
      title: 'Show "View all" link',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {title: 'heading', count: 'count'},
    prepare: ({title, count}) => ({
      title: title || 'Latest posts',
      subtitle: `Latest ${count ?? 3} posts`,
    }),
  },
})
