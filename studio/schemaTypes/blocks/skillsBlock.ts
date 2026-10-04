import {defineArrayMember, defineField, defineType} from 'sanity'
import {SparklesIcon} from '@sanity/icons/Sparkles'
import {SECTION_THEMES} from './themes'

export const skillsBlock = defineType({
  name: 'skillsBlock',
  title: 'Skills',
  type: 'object',
  icon: SparklesIcon,
  fields: [
    defineField({name: 'heading', type: 'string', initialValue: 'Skills'}),
    defineField({name: 'intro', type: 'text', rows: 2}),
    defineField({
      name: 'groups',
      title: 'Skill groups',
      type: 'array',
      description: 'For example "Software" and "Making". Each group shows its skills as tags.',
      of: [
        defineArrayMember({
          name: 'skillGroup',
          type: 'object',
          fields: [
            defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
            defineField({
              name: 'skills',
              type: 'array',
              of: [defineArrayMember({type: 'string'})],
              options: {layout: 'tags'},
              validation: (rule) => rule.min(1),
            }),
          ],
          preview: {
            select: {title: 'title', skills: 'skills'},
            prepare: ({title, skills}) => ({title, subtitle: (skills ?? []).join(' · ')}),
          },
        }),
      ],
      validation: (rule) => rule.min(1),
    }),
    defineField({
      name: 'theme',
      type: 'string',
      options: {list: SECTION_THEMES, layout: 'radio', direction: 'horizontal'},
      initialValue: 'light',
    }),
  ],
  preview: {
    select: {title: 'heading', groups: 'groups'},
    prepare: ({title, groups}) => ({
      title: title || 'Skills',
      subtitle: `Skills (${(groups ?? []).length} groups)`,
    }),
  },
})
