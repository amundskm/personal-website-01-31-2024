import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SectionOf } from '../../core/models';
import { CmsImageComponent } from '../../shared/cms-image/cms-image';

@Component({
  selector: 'app-image-block',
  imports: [CmsImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <figure
        class="image-block"
        [class.container]="width() !== 'full'"
        [class.container--narrow]="width() === 'content'"
      >
        <app-cms-image [image]="block().image" [width]="pixelWidth()" [sizes]="sizes()" />
        @if (block().image?.caption) {
          <figcaption>{{ block().image?.caption }}</figcaption>
        }
      </figure>
    </section>
  `,
  styleUrl: './image-block.scss',
})
export class ImageBlock {
  readonly block = input.required<SectionOf<'imageBlock'>>();

  protected readonly width = computed(() => this.block().width ?? 'content');
  protected readonly pixelWidth = computed(
    () => ({ content: 720, wide: 1200, full: 1920 })[this.width()],
  );
  protected readonly sizes = computed(() =>
    this.width() === 'full' ? '100vw' : `(min-width: 80rem) ${this.pixelWidth()}px, 100vw`,
  );
}
