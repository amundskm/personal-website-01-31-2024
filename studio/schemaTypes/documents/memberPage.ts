import {defineField, defineType} from 'sanity'
import {LockIcon} from '@sanity/icons/Lock'
import {blockTypes} from '../blocks'

/**
 * Who a members-only page is shared with. Values must match the Cognito groups
 * in web/src/app/core/auth/roles.ts. Admins can always see every page.
 */
const AUDIENCES = [
  {title: 'Wife', value: 'wife'},
  {title: 'NEIA Boiz', value: 'neia-boiz'},
  {title: 'Da Boiz', value: 'da-boiz'},
  {title: 'Da Girls', value: 'da-girls'},
]

/** Blocks that list public posts/projects make no sense in the private dataset. */
const PUBLIC_ONLY_BLOCKS = new Set(['projectGridBlock', 'postListBlock'])

/**
 * A page that only signed-in users in the chosen groups can see, served at
 * /members/<slug>. Lives in the private dataset (the "Members" workspace).
 */
export const memberPage = defineType({
  name: 'memberPage',
  title: 'Members page',
  type: 'document',
  icon: LockIcon,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      description: 'Served at /members/<slug>.',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'audiences',
      title: 'Who can see this?',
      type: 'array',
      description: 'Admins can always see every page. Leave empty for admin-only.',
      of: [{type: 'string'}],
      options: {list: AUDIENCES, layout: 'grid'},
    }),
    defineField({
      name: 'summary',
      type: 'text',
      rows: 2,
      description: 'Shown on the members home page.',
    }),
    defineField({
      name: 'sections',
      title: 'Page sections',
      type: 'array',
      of: blockTypes
        .filter((block) => !PUBLIC_ONLY_BLOCKS.has(block.name))
        .map((block) => ({type: block.name})),
      options: {
        insertMenu: {
          views: [{name: 'list'}, {name: 'grid'}],
        },
      },
    }),
  ],
  preview: {
    select: {title: 'title', slug: 'slug.current', audiences: 'audiences'},
    prepare: ({title, slug, audiences}) => ({
      title,
      subtitle: `/members/${slug ?? ''} · ${
        audiences?.length
          ? audiences
              .map((value: string) => AUDIENCES.find((a) => a.value === value)?.title ?? value)
              .join(', ')
          : 'Admin only'
      }`,
    }),
  },
})
