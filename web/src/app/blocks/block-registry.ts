import type { Type } from '@angular/core';
import type { PageSection } from '../core/models';
import { CtaBlock } from './cta-block/cta-block';
import { HeroBlock } from './hero-block/hero-block';
import { ImageBlock } from './image-block/image-block';
import { PostListBlock } from './post-list-block/post-list-block';
import { ProjectGridBlock } from './project-grid-block/project-grid-block';
import { RichTextBlock } from './rich-text-block/rich-text-block';
import { TwoColumnBlock } from './two-column-block/two-column-block';

/**
 * Maps each Sanity block `_type` to the Angular component that renders it.
 * Every component receives the block data through a `block` input.
 *
 * Typed as a complete record, so adding a block schema in the Studio and
 * re-running `npm run typegen` produces a compile error here until it has a component.
 */
export const BLOCK_REGISTRY: Record<PageSection['_type'], Type<unknown>> = {
  heroBlock: HeroBlock,
  richTextBlock: RichTextBlock,
  imageBlock: ImageBlock,
  twoColumnBlock: TwoColumnBlock,
  projectGridBlock: ProjectGridBlock,
  postListBlock: PostListBlock,
  ctaBlock: CtaBlock,
};
