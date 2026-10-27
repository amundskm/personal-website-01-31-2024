import type { CmsImage } from './models';

/**
 * Sizes the content API serves (Image::WIDTHS in api/app/models/image.rb).
 * Other widths are rejected, so keep the two lists in sync.
 */
export const IMAGE_WIDTHS = [320, 480, 640, 720, 800, 1024, 1200, 1280, 1600, 1920, 2000, 2400];

/**
 * URL for an image at `width` (one of IMAGE_WIDTHS), cropped to `height` if
 * given. The asset URL already carries the usage's crop and hotspot, signed;
 * the API crops around the hotspot. Width/height must match one of the
 * API's aspect ratios (Image::ASPECT_RATIOS).
 */
export function imageUrl(image: CmsImage | null | undefined, width: number, height?: number): string | null {
  const url = image?.asset?.url;
  if (!url) return null;
  return `${url}&w=${width}${height ? `&h=${height}` : ''}`;
}

/** Intrinsic width/height of the original image, if known. */
export function imageDimensions(image: CmsImage | null | undefined) {
  const dims = image?.asset?.metadata?.dimensions;
  return dims?.width && dims?.height ? { width: dims.width, height: dims.height } : null;
}
