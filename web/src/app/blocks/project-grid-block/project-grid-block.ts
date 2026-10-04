import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectCard, SectionOf } from '../../core/models';
import { ProjectCardComponent } from '../../shared/cards/project-card';

@Component({
  selector: 'app-project-grid-block',
  imports: [RouterLink, ProjectCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    <section class="section">
      <div class="container">
        @if (b.heading || b.showViewAll) {
          <header class="section-header">
            <div>
              @if (b.heading) {
                <h2 class="section-heading">{{ b.heading }}</h2>
              }
              @if (b.intro) {
                <p class="section-intro">{{ b.intro }}</p>
              }
            </div>
            @if (b.showViewAll) {
              <a routerLink="/projects" class="view-all">View all projects →</a>
            }
          </header>
        }
        @if (projects().length) {
          <div class="grid">
            @for (project of projects(); track project._id) {
              <app-project-card [project]="project" />
            }
          </div>
        } @else {
          <p class="empty">No projects yet.</p>
        }
      </div>
    </section>
  `,
})
export class ProjectGridBlock {
  readonly block = input.required<SectionOf<'projectGridBlock'>>();

  protected readonly projects = computed<ProjectCard[]>(() => {
    const b = this.block();
    const items = (b.items ?? []).filter((p): p is ProjectCard => !!p?.slug);
    return b.mode === 'manual' ? items : items.slice(0, b.limit ?? 6);
  });
}
