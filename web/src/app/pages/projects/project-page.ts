import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { contentResource, segment } from '../../core/content-api';
import type { Project } from '../../core/models';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';
import { ProjectArticle } from './project-article';

@Component({
  selector: 'app-project-page',
  imports: [ProjectArticle, NotFound, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (project.hasValue()) {
      @if (project.value(); as p) {
        <app-project-article [project]="p" />
      } @else {
        <app-not-found />
      }
    } @else if (project.error()) {
      <app-load-error />
    } @else if (project.isLoading()) {
      <app-loading />
    }
  `,
})
export class ProjectPage {
  private readonly seo = inject(SeoService);

  readonly slug = input.required<string>();

  protected readonly project = contentResource<Project>(() => `/projects/${segment(this.slug())}`);

  constructor() {
    effect(() => {
      const project = this.project.hasValue() ? this.project.value() : null;
      if (project) {
        this.seo.setPage({
          title: project.title,
          description: project.summary,
          image: project.coverImage,
          seo: project.seo,
        });
      }
    });
  }
}
