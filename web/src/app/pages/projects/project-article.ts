import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Project } from '../../core/models';
import { CmsImageComponent } from '../../shared/cms-image/cms-image';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';

/** A project's content: shown by the project page and the admin preview. */
@Component({
  selector: 'app-project-article',
  imports: [RouterLink, PortableTextComponent, CmsImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = project();
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
          <app-cms-image
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
              <app-cms-image [image]="image" [width]="800" sizes="(min-width: 48rem) 50vw, 100vw" />
              @if (image.caption) {
                <figcaption>{{ image.caption }}</figcaption>
              }
            </figure>
          }
        </div>
      }
    </article>
  `,
})
export class ProjectArticle {
  readonly project = input.required<Project>();
}
