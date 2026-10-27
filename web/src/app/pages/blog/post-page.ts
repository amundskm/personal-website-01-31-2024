import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { contentResource, segment } from '../../core/content-api';
import type { Post } from '../../core/models';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';
import { PostArticle } from './post-article';

@Component({
  selector: 'app-post-page',
  imports: [PostArticle, NotFound, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (post.hasValue()) {
      @if (post.value(); as p) {
        <app-post-article [post]="p" />
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

  protected readonly post = contentResource<Post>(() => `/posts/${segment(this.slug())}`);

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
