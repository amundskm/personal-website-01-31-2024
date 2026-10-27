import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IMAGE_WIDTHS, imageDimensions, imageUrl } from '../../core/image';
import type { CmsImage } from '../../core/models';

/**
 * Responsive <img> for a content image: a srcset of sizes from the content
 * API (cropped to the editor's crop and hotspot there), reserved layout space
 * and a blurred placeholder (LQIP) while loading.
 */
@Component({
  selector: 'app-cms-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as src) {
      <img
        [src]="src"
        [attr.srcset]="srcset()"
        [attr.sizes]="sizes()"
        [attr.width]="displayWidth()"
        [attr.height]="displayHeight()"
        [alt]="image()?.alt ?? ''"
        [attr.loading]="priority() ? 'eager' : 'lazy'"
        [attr.fetchpriority]="priority() ? 'high' : null"
        decoding="async"
        [class.cover]="!!aspectRatio()"
        [style.background-image]="placeholder()"
      />
    }
  `,
  styleUrl: './cms-image.scss',
})
export class CmsImageComponent {
  readonly image = input.required<CmsImage | null | undefined>();
  /** Largest width (CSS px) the image is displayed at; one of IMAGE_WIDTHS. */
  readonly width = input(1200);
  /** Crop to this width/height ratio: 16 / 9, 2 or 4 / 3 (the API's ASPECT_RATIOS). Defaults to the original ratio. */
  readonly aspectRatio = input<number>();
  readonly sizes = input('100vw');
  /** Load eagerly with high priority — use for above-the-fold images. */
  readonly priority = input(false);

  private readonly ratio = computed(() => {
    const forced = this.aspectRatio();
    if (forced) return forced;
    const dims = imageDimensions(this.image());
    return dims ? dims.width / dims.height : 16 / 9;
  });

  protected readonly displayWidth = computed(() => this.width());
  protected readonly displayHeight = computed(() => Math.round(this.width() / this.ratio()));

  private urlAt(width: number): string | null {
    const height = this.aspectRatio() ? Math.round(width / this.ratio()) : undefined;
    return imageUrl(this.image(), width, height);
  }

  protected readonly src = computed(() => this.urlAt(this.width()));

  protected readonly srcset = computed(() => {
    if (!this.src()) return null;
    const max = this.width() * 2;
    return IMAGE_WIDTHS.filter((w) => w <= max)
      .map((w) => `${this.urlAt(w)} ${w}w`)
      .join(', ');
  });

  protected readonly placeholder = computed(() => {
    const lqip = this.image()?.asset?.metadata?.lqip;
    return lqip ? `url("${lqip}")` : null;
  });
}
