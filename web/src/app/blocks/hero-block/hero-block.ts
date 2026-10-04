import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SectionOf } from '../../core/models';
import { CmsLinkComponent } from '../../shared/cms-link/cms-link';
import { SanityImageComponent } from '../../shared/sanity-image/sanity-image';
import { WizardMascot } from '../../shared/wizard/wizard-mascot';

@Component({
  selector: 'app-hero-block',
  imports: [CmsLinkComponent, SanityImageComponent, WizardMascot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    <section
      class="section hero theme-{{ b.theme ?? 'light' }}"
      [class.hero--split]="(b.layout === 'split' && b.image?.asset) || showMascot()"
    >
      <div class="container hero__inner">
        <div class="hero__content">
          @if (b.eyebrow) {
            <p class="eyebrow">{{ b.eyebrow }}</p>
          }
          <h1 class="hero__heading">{{ b.heading }}</h1>
          @if (b.subheading) {
            <p class="hero__subheading">{{ b.subheading }}</p>
          }
          @if (b.buttons?.length) {
            <div class="button-row">
              @for (button of b.buttons; track button._key) {
                <app-cms-link [link]="button" [asButton]="true" />
              }
            </div>
          }
        </div>
        @if (b.image?.asset) {
          <div class="hero__media">
            <app-sanity-image
              [image]="b.image"
              [width]="b.layout === 'split' ? 720 : 1200"
              [priority]="true"
              [sizes]="
                b.layout === 'split'
                  ? '(min-width: 56rem) 50vw, 100vw'
                  : '(min-width: 80rem) 1200px, 100vw'
              "
            />
          </div>
        } @else if (showMascot()) {
          <div class="hero__mascot">
            <app-wizard-mascot />
          </div>
        }
      </div>
    </section>
  `,
  styleUrl: './hero-block.scss',
})
export class HeroBlock {
  readonly block = input.required<SectionOf<'heroBlock'>>();

  protected readonly showMascot = computed(
    () => !!this.block().showMascot && !this.block().image?.asset,
  );
}
