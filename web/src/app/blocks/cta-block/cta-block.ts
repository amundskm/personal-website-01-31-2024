import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SectionOf } from '../../core/models';
import { CmsLinkComponent } from '../../shared/cms-link/cms-link';

@Component({
  selector: 'app-cta-block',
  imports: [CmsLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    <section class="section">
      <div class="container">
        <div class="cta theme-{{ b.theme ?? 'accent' }}">
          <h2 class="cta__heading">{{ b.heading }}</h2>
          @if (b.text) {
            <p class="cta__text">{{ b.text }}</p>
          }
          @if (b.button) {
            <div class="button-row">
              <app-cms-link [link]="b.button" [asButton]="true" />
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './cta-block.scss',
})
export class CtaBlock {
  readonly block = input.required<SectionOf<'ctaBlock'>>();
}
