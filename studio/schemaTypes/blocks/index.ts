import {heroBlock} from './heroBlock'
import {richTextBlock} from './richTextBlock'
import {imageBlock} from './imageBlock'
import {twoColumnBlock} from './twoColumnBlock'
import {projectGridBlock} from './projectGridBlock'
import {postListBlock} from './postListBlock'
import {ctaBlock} from './ctaBlock'
import {skillsBlock} from './skillsBlock'

/**
 * Every block type a page can be built from.
 * To add a new block: create its schema here, then add a matching Angular
 * component and register it in web/src/app/blocks/block-registry.ts.
 */
export const blockTypes = [
  heroBlock,
  richTextBlock,
  imageBlock,
  twoColumnBlock,
  projectGridBlock,
  postListBlock,
  skillsBlock,
  ctaBlock,
]
