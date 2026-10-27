import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { contentResource } from '../../core/content-api';
import type { PostCard } from '../../core/models';
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
          @let list = posts.value() ?? [];
          @if (list.length) {
            <div class="grid">
              @for (post of list; track post._id) {
                <app-post-card [post]="post" />
              }
            </div>
          } @else {
            <p class="empty">The first post is still brewing in the cauldron. Check back soon.</p>
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
  protected readonly posts = contentResource<PostCard[]>('/posts');

  ngOnInit(): void {
    this.seo.setPage({ title: 'Blog' });
  }
}
