import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url';
import type { ImageUrlBuilder } from '@sanity/image-url';
import type { SanityImage } from './models';
import { sanityConfig } from './sanity.config';

const builder = createImageUrlBuilder(sanityConfig);

/**
 * Returns an image URL builder for a Sanity image (respecting its crop and
 * hotspot), or null if the image has no asset.
 */
export function urlFor(image: SanityImage | null | undefined): ImageUrlBuilder | null {
  if (!image?.asset?._id) return null;
  return builder.image(image as SanityImageSource).auto('format');
}

/** Intrinsic width/height of the original asset, if known. */
export function imageDimensions(image: SanityImage | null | undefined) {
  const dims = image?.asset?.metadata?.dimensions;
  return dims?.width && dims?.height ? { width: dims.width, height: dims.height } : null;
}
