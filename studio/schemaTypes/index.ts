import {page} from './documents/page'
import {memberPage} from './documents/memberPage'
import {spendingPlan} from './documents/spendingPlan'
import {post} from './documents/post'
import {project} from './documents/project'
import {siteSettings} from './documents/siteSettings'
import {seo} from './objects/seo'
import {link} from './objects/link'
import {accessibleImage} from './objects/accessibleImage'
import {blockContent} from './objects/blockContent'
import {blockTypes} from './blocks'

export const schemaTypes = [
  // Documents
  page,
  post,
  project,
  siteSettings,
  memberPage,
  spendingPlan,
  // Shared objects
  seo,
  link,
  accessibleImage,
  blockContent,
  // Page section blocks
  ...blockTypes,
]
