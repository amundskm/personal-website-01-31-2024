import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { POSTS_QUERY } from '../../core/queries';
import { sanityResource } from '../../core/sanity';
import type { POSTS_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { PostCardComponent } from '../../shared/cards/post-card';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';

@Component({
  selector: 'app-post-list-page',
  imports: [PostCardComponent, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container">
        <header class="page-header">
          <h1>Blog</h1>
          <p class="section-intro">Notes, write-ups and things I've learned.</p>
        </header>
        @if (posts.hasValue()) {
          @if (posts.value().length) {
            <div class="grid">
              @for (post of posts.value(); track post._id) {
                <app-post-card [post]="post" />
              }
            </div>
          } @else {
            <p class="empty">No posts yet — check back soon.</p>
          }
        } @else if (posts.error()) {
          <app-load-error />
        } @else if (posts.isLoading()) {
          <app-loading />
        }
      </div>
    </section>
  `,
})
export class PostListPage implements OnInit {
  private readonly seo = inject(SeoService);
  protected readonly posts = sanityResource<POSTS_QUERY_RESULT>(POSTS_QUERY);

  ngOnInit(): void {
    this.seo.setPage({ title: 'Blog' });
  }
}
