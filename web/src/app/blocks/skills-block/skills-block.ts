import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SectionOf } from '../../core/models';

@Component({
  selector: 'app-skills-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    <section class="section theme-{{ b.theme ?? 'light' }}">
      <div class="container">
        @if (b.heading || b.intro) {
          <header class="section-header">
            <div>
              @if (b.heading) {
                <h2 class="section-heading">{{ b.heading }}</h2>
              }
              @if (b.intro) {
                <p class="section-intro">{{ b.intro }}</p>
              }
            </div>
          </header>
        }
        <div class="skill-groups">
          @for (group of b.groups ?? []; track group._key) {
            <section class="skill-group" [attr.aria-label]="group.title">
              <h3 class="skill-group__title">{{ group.title }}</h3>
              <ul class="tags">
                @for (skill of group.skills ?? []; track skill) {
                  <li class="tag">{{ skill }}</li>
                }
              </ul>
            </section>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './skills-block.scss',
})
export class SkillsBlock {
  readonly block = input.required<SectionOf<'skillsBlock'>>();
}
