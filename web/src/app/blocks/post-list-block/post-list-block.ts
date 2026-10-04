import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SectionOf } from '../../core/models';
import { PostCardComponent } from '../../shared/cards/post-card';

@Component({
  selector: 'app-post-list-block',
  imports: [RouterLink, PostCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = block();
    <section class="section">
      <div class="container">
        <header class="section-header">
          @if (b.heading) {
            <h2 class="section-heading">{{ b.heading }}</h2>
          }
          @if (b.showViewAll) {
            <a routerLink="/blog" class="view-all">View all posts →</a>
          }
        </header>
        @if (posts().length) {
          <div class="grid">
            @for (post of posts(); track post._id) {
              <app-post-card [post]="post" />
            }
          </div>
        } @else {
          <p class="empty">The first post is still brewing. Check back soon.</p>
        }
      </div>
    </section>
  `,
})
export class PostListBlock {
  readonly block = input.required<SectionOf<'postListBlock'>>();

  protected readonly posts = computed(() => this.block().items.slice(0, this.block().count ?? 3));
}
