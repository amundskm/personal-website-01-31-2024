import type {StructureResolver} from 'sanity/structure'
import {CogIcon} from '@sanity/icons/Cog'
import {CreditCardIcon} from '@sanity/icons/CreditCard'
import {DocumentIcon} from '@sanity/icons/Document'
import {EditIcon} from '@sanity/icons/Edit'
import {LockIcon} from '@sanity/icons/Lock'
import {ProjectsIcon} from '@sanity/icons/Projects'

export const SINGLETON_TYPES = new Set(['siteSettings', 'spendingPlan'])

/** Document types each workspace may create (both share one schema, for typegen). */
export const PUBLIC_TYPES = new Set(['page', 'post', 'project', 'siteSettings'])
export const MEMBER_TYPES = new Set(['memberPage', 'spendingPlan'])

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Site settings')
        .id('siteSettings')
        .icon(CogIcon)
        .child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      S.divider(),
      S.documentTypeListItem('page').title('Pages').icon(DocumentIcon),
      S.documentTypeListItem('post').title('Blog posts').icon(EditIcon),
      S.documentTypeListItem('project').title('Projects').icon(ProjectsIcon),
    ])

export const membersStructure: StructureResolver = (S) =>
  S.list()
    .title('Members only')
    .items([
      S.documentTypeListItem('memberPage').title('Members pages').icon(LockIcon),
      S.divider(),
      S.listItem()
        .title('Spending plan')
        .id('spendingPlan')
        .icon(CreditCardIcon)
        .child(S.document().schemaType('spendingPlan').documentId('spendingPlan')),
    ])
