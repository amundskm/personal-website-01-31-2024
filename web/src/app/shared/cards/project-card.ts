import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectCard } from '../../core/models';
import { SanityImageComponent } from '../sanity-image/sanity-image';
import { WizardHat } from '../wizard/wizard-hat';

@Component({
  selector: 'app-project-card',
  imports: [RouterLink, SanityImageComponent, WizardHat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      @if (project().coverImage?.asset) {
        <a
          [routerLink]="['/projects', project().slug]"
          class="card__media"
          tabindex="-1"
          aria-hidden="true"
        >
          <app-sanity-image
            [image]="project().coverImage"
            [width]="640"
            [aspectRatio]="4 / 3"
            sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
          />
        </a>
      } @else {
        <div class="card__media card__placeholder" style="aspect-ratio: 4 / 3" aria-hidden="true">
          <app-wizard-hat />
        </div>
      }
      <div class="card__body">
        @if (project().year) {
          <span class="card__meta">{{ project().year }}</span>
        }
        <h3 class="card__title">
          <a [routerLink]="['/projects', project().slug]">{{ project().title }}</a>
        </h3>
        @if (project().summary) {
          <p class="card__text">{{ project().summary }}</p>
        }
        @if (project().techStack?.length) {
          <ul class="tags" aria-label="Tech stack">
            @for (tech of project().techStack; track tech) {
              <li class="tag">{{ tech }}</li>
            }
          </ul>
        }
      </div>
    </article>
  `,
  styleUrl: './card.scss',
})
export class ProjectCardComponent {
  readonly project = input.required<ProjectCard>();
}
