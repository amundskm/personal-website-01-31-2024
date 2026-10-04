import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { BlockRenderer } from '../../blocks/block-renderer';
import { PAGE_QUERY } from '../../core/queries';
import { sanityResource } from '../../core/sanity';
import type { PAGE_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';

/** A CMS-built page: renders the page's sections with the block renderer. */
@Component({
  selector: 'app-cms-page',
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
export class CmsPage {
  private readonly seo = inject(SeoService);

  /** Bound from the `:slug` route param, or from route data for the homepage. */
  readonly slug = input<string>();

  private readonly resolvedSlug = computed(() => this.slug() ?? 'home');

  protected readonly page = sanityResource<PAGE_QUERY_RESULT>(PAGE_QUERY, () => ({
    slug: this.resolvedSlug(),
  }));

  constructor() {
    effect(() => {
      const page = this.page.hasValue() ? this.page.value() : null;
      if (page) {
        // The homepage uses the site title alone
        const title = page.slug === 'home' ? null : page.title;
        this.seo.setPage({ title, seo: page.seo });
      }
    });
  }
}
