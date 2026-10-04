import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PROJECT_QUERY } from '../../core/queries';
import { sanityResource } from '../../core/sanity';
import type { PROJECT_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';
import { SanityImageComponent } from '../../shared/sanity-image/sanity-image';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';

@Component({
  selector: 'app-project-page',
  imports: [
    RouterLink,
    PortableTextComponent,
    SanityImageComponent,
    NotFound,
    LoadingComponent,
    LoadErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (project.hasValue()) {
      @if (project.value(); as p) {
        <article class="section">
          <header class="container container--narrow article-header">
            <a routerLink="/projects" class="back-link">← All projects</a>
            <h1>{{ p.title }}</h1>
            @if (p.summary) {
              <p class="section-intro">{{ p.summary }}</p>
            }
            <div class="article-meta">
              @if (p.year) {
                <span>{{ p.year }}</span>
              }
              @if (p.techStack?.length) {
                <ul class="tags" aria-label="Tech stack">
                  @for (tech of p.techStack; track tech) {
                    <li class="tag">{{ tech }}</li>
                  }
                </ul>
              }
            </div>
            @if (p.liveUrl || p.repoUrl) {
              <div class="button-row">
                @if (p.liveUrl) {
                  <a
                    [href]="p.liveUrl"
                    class="btn btn--primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Visit site ↗</a
                  >
                }
                @if (p.repoUrl) {
                  <a
                    [href]="p.repoUrl"
                    class="btn btn--secondary"
                    target="_blank"
                    rel="noopener noreferrer"
                    >View source ↗</a
                  >
                }
              </div>
            }
          </header>
          @if (p.coverImage?.asset) {
            <div class="container article-cover">
              <app-sanity-image
                [image]="p.coverImage"
                [width]="1200"
                [priority]="true"
                sizes="(min-width: 80rem) 1200px, 100vw"
              />
            </div>
          }
          <div class="container container--narrow">
            <app-portable-text [value]="p.body" />
          </div>
          @if (p.gallery?.length) {
            <div class="container gallery">
              @for (image of p.gallery; track image._key) {
                <figure>
                  <app-sanity-image
                    [image]="image"
                    [width]="800"
                    sizes="(min-width: 48rem) 50vw, 100vw"
                  />
                  @if (image.caption) {
                    <figcaption>{{ image.caption }}</figcaption>
                  }
                </figure>
              }
            </div>
          }
        </article>
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

  protected readonly project = sanityResource<PROJECT_QUERY_RESULT>(PROJECT_QUERY, () => ({
    slug: this.slug(),
  }));

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
