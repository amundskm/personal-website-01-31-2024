import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { imageDimensions, urlFor } from '../../core/image';
import type { SanityImage } from '../../core/models';

const CANDIDATE_WIDTHS = [320, 480, 640, 800, 1024, 1280, 1600, 2000, 2400];

/**
 * Responsive <img> for a Sanity image: generates a srcset from Sanity's image
 * CDN, applies crop/hotspot, reserves layout space and shows a blurred
 * placeholder (LQIP) while loading.
 */
@Component({
  selector: 'app-sanity-image',
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
  styleUrl: './sanity-image.scss',
})
export class SanityImageComponent {
  readonly image = input.required<SanityImage | null | undefined>();
  /** Largest width (CSS px) the image is displayed at. */
  readonly width = input(1200);
  /** Force a crop to this width/height ratio, e.g. 16/9. Defaults to the original ratio. */
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
    const builder = urlFor(this.image());
    if (!builder) return null;
    const sized = builder.width(width);
    return this.aspectRatio()
      ? sized
          .height(Math.round(width / this.ratio()))
          .fit('crop')
          .url()
      : sized.url();
  }

  protected readonly src = computed(() => this.urlAt(this.width()));

  protected readonly srcset = computed(() => {
    if (!this.src()) return null;
    const max = this.width() * 2;
    const widths = CANDIDATE_WIDTHS.filter((w) => w <= max);
    return widths.map((w) => `${this.urlAt(w)} ${w}w`).join(', ');
  });

  protected readonly placeholder = computed(() => {
    const lqip = this.image()?.asset?.metadata?.lqip;
    return lqip ? `url("${lqip}")` : null;
  });
}
