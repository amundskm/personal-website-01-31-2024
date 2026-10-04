import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { PROJECTS_QUERY } from '../../core/queries';
import { sanityResource } from '../../core/sanity';
import type { PROJECTS_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { ProjectCardComponent } from '../../shared/cards/project-card';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';

@Component({
  selector: 'app-project-list-page',
  imports: [ProjectCardComponent, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container">
        <header class="page-header">
          <h1>Projects</h1>
          <p class="section-intro">Things I've built, shipped and tinkered with.</p>
        </header>
        @if (projects.hasValue()) {
          @if (projects.value().length) {
            <div class="grid">
              @for (project of projects.value(); track project._id) {
                <app-project-card [project]="project" />
              }
            </div>
          } @else {
            <p class="empty">No projects yet — check back soon.</p>
          }
        } @else if (projects.error()) {
          <app-load-error />
        } @else if (projects.isLoading()) {
          <app-loading />
        }
      </div>
    </section>
  `,
})
export class ProjectListPage implements OnInit {
  private readonly seo = inject(SeoService);
  protected readonly projects = sanityResource<PROJECTS_QUERY_RESULT>(PROJECTS_QUERY);

  ngOnInit(): void {
    this.seo.setPage({ title: 'Projects' });
  }
}
