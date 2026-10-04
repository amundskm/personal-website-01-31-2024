import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SectionOf } from '../../core/models';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';
import { SanityImageComponent } from '../../shared/sanity-image/sanity-image';

@Component({
  selector: 'app-two-column-block',
  imports: [PortableTextComponent, SanityImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    <section class="section">
      <div class="container">
        @if (b.heading) {
          <h2 class="section-heading">{{ b.heading }}</h2>
        }
        <div
          class="columns"
          [class.columns--center]="b.verticalAlign !== 'top'"
          [class.columns--reverse]="b.reverseOnMobile"
        >
          @for (column of [b.left, b.right]; track $index) {
            <div class="column">
              @if (column?.image?.asset) {
                <app-sanity-image
                  class="column__image"
                  [image]="column?.image"
                  [width]="640"
                  sizes="(min-width: 48rem) 50vw, 100vw"
                />
              } @else {
                <app-portable-text [value]="column?.content" />
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './two-column-block.scss',
})
export class TwoColumnBlock {
  readonly block = input.required<SectionOf<'twoColumnBlock'>>();
}
