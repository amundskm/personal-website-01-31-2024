import { ChangeDetectionStrategy, Component, effect, inject, input, resource } from '@angular/core';
import { BlockRenderer } from '../../blocks/block-renderer';
import { AuthService } from '../../core/auth/auth.service';
import type { MEMBER_PAGE_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';

/**
 * A members-only page from the private dataset. The members API returns 404
 * both for missing pages and for pages not shared with the user.
 */
@Component({
  selector: 'app-member-page',
  imports: [BlockRenderer, NotFound, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (page.hasValue()) {
      @if (page.value(); as p) {
        @if (p.sections?.[0]?._type !== 'heroBlock') {
          <h1 class="visually-hidden">{{ p.title }}</h1>
        }
        <app-block-renderer [sections]="p.sections" />
      } @else {
        <app-not-found />
      }
    } @else if (page.error()) {
      <app-load-error />
    } @else if (page.isLoading()) {
      <app-loading />
    }
  `,
})
export class MemberPage {
  private readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  /** Bound from the `:slug` route param. */
  readonly slug = input.required<string>();

  protected readonly page = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) =>
      this.auth.fetchMembersApi<MEMBER_PAGE_QUERY_RESULT>(
        `/pages/${encodeURIComponent(params.slug)}`,
      ),
  });

  constructor() {
    effect(() => {
      const page = this.page.hasValue() ? this.page.value() : null;
      if (page) {
        this.seo.setPage({
          title: page.title,
          seo: { title: null, description: null, image: null, noIndex: true },
        });
      }
    });
  }
}
