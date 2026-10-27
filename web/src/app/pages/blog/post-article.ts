import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Post } from '../../core/models';
import { CmsImageComponent } from '../../shared/cms-image/cms-image';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';

/** A blog post's content: shown by the post page and the admin preview. */
@Component({
  selector: 'app-post-article',
  imports: [DatePipe, RouterLink, PortableTextComponent, CmsImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = post();
    <article class="section">
      <header class="container container--narrow article-header">
        <a routerLink="/blog" class="back-link">← All posts</a>
        <h1>{{ p.title }}</h1>
        <div class="article-meta">
          @if (p.publishedAt) {
            <time [attr.datetime]="p.publishedAt">{{ p.publishedAt | date: 'longDate' }}</time>
          }
          @if (p.tags?.length) {
            <ul class="tags" aria-label="Tags">
              @for (tag of p.tags; track tag) {
                <li class="tag">{{ tag }}</li>
              }
            </ul>
          }
        </div>
      </header>
      @if (p.coverImage?.asset) {
        <div class="container article-cover">
          <app-cms-image
            [image]="p.coverImage"
            [width]="1200"
            [aspectRatio]="2"
            [priority]="true"
            sizes="(min-width: 80rem) 1200px, 100vw"
          />
        </div>
      }
      <div class="container container--narrow">
        <app-portable-text [value]="p.body" />
      </div>
    </article>
  `,
})
export class PostArticle {
  readonly post = input.required<Post>();
}
