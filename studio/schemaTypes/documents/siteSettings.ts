import {defineArrayMember, defineField, defineType} from 'sanity'
import {CogIcon} from '@sanity/icons/Cog'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  icon: CogIcon,
  fields: [
    defineField({name: 'title', title: 'Site title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'description',
      title: 'Default meta description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'navigation',
      type: 'array',
      description: 'Links shown in the site header.',
      of: [defineArrayMember({type: 'link'})],
    }),
    defineField({
      name: 'socialLinks',
      title: 'Social links',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'socialLink',
          fields: [
            defineField({
              name: 'platform',
              type: 'string',
              options: {
                list: ['github', 'linkedin', 'x', 'bluesky', 'mastodon', 'youtube', 'email', 'other'],
              },
              validation: (rule) => rule.required(),
            }),
            defineField({name: 'label', type: 'string'}),
            defineField({
              name: 'url',
              type: 'url',
              validation: (rule) => rule.required().uri({scheme: ['http', 'https', 'mailto']}),
            }),
          ],
          preview: {select: {title: 'platform', subtitle: 'url'}},
        }),
      ],
    }),
    defineField({name: 'footerText', type: 'string'}),
    defineField({name: 'seo', title: 'Default SEO', type: 'seo'}),
  ],
  preview: {prepare: () => ({title: 'Site settings'})},
})
