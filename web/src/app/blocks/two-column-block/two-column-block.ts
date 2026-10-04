import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SectionOf } from '../../core/models';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';
import { SanityImageComponent } from '../../shared/sanity-image/sanity-image';

@Component({
  selector: 'app-two-column-block',
  imports: [NgTemplateOutlet, PortableTextComponent, SanityImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    @if (b.layout === 'aside') {
      <!-- Main text lines up with the page's narrow text column; the right column becomes a sidebar in the margin -->
      <section class="section aside-layout">
        <div class="aside-main">
          @if (b.heading) {
            <h2 class="section-heading">{{ b.heading }}</h2>
          }
          <ng-container *ngTemplateOutlet="columnTpl; context: { $implicit: b.left }" />
        </div>
        <aside class="aside-side">
          <ng-container *ngTemplateOutlet="columnTpl; context: { $implicit: b.right }" />
        </aside>
      </section>
    } @else {
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
                <ng-container *ngTemplateOutlet="columnTpl; context: { $implicit: column }" />
              </div>
            }
          </div>
        </div>
      </section>
    }

    <ng-template #columnTpl let-column>
      @if (column?.image?.asset) {
        <app-sanity-image
          class="column__image"
          [image]="column.image"
          [width]="640"
          sizes="(min-width: 48rem) 50vw, 100vw"
        />
      } @else {
        <app-portable-text [value]="column?.content" />
      }
    </ng-template>
  `,
  styleUrl: './two-column-block.scss',
})
export class TwoColumnBlock {
  readonly block = input.required<SectionOf<'twoColumnBlock'>>();
}
