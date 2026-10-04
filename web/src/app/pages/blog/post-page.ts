import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { POST_QUERY } from '../../core/queries';
import { sanityResource } from '../../core/sanity';
import type { POST_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';
import { SanityImageComponent } from '../../shared/sanity-image/sanity-image';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';

@Component({
  selector: 'app-post-page',
  imports: [
    DatePipe,
    RouterLink,
    PortableTextComponent,
    SanityImageComponent,
    NotFound,
    LoadingComponent,
    LoadErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (post.hasValue()) {
      @if (post.value(); as p) {
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
              <app-sanity-image
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
      } @else {
        <app-not-found />
      }
    } @else if (post.error()) {
      <app-load-error />
    } @else if (post.isLoading()) {
      <app-loading />
    }
  `,
})
export class PostPage {
  private readonly seo = inject(SeoService);

  readonly slug = input.required<string>();

  protected readonly post = sanityResource<POST_QUERY_RESULT>(POST_QUERY, () => ({
    slug: this.slug(),
  }));

  constructor() {
    effect(() => {
      const post = this.post.hasValue() ? this.post.value() : null;
      if (post) {
        this.seo.setPage({
          title: post.title,
          description: post.excerpt,
          image: post.coverImage,
          seo: post.seo,
          type: 'article',
        });
      }
    });
  }
}
