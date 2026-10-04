import type {StructureResolver} from 'sanity/structure'
import {CogIcon} from '@sanity/icons/Cog'
import {DocumentIcon} from '@sanity/icons/Document'
import {EditIcon} from '@sanity/icons/Edit'
import {ProjectsIcon} from '@sanity/icons/Projects'

export const SINGLETON_TYPES = new Set(['siteSettings'])

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
