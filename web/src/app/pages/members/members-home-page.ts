import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/auth/roles';
import type { MEMBER_PAGES_QUERY_RESULT } from '../../core/sanity.types';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';

/** Landing page for signed-in users: lists the members-only pages shared with them. */
@Component({
  selector: 'app-members-home-page',
  imports: [RouterLink, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container">
        <header class="page-header">
          <p class="eyebrow">Members only</p>
          <h1>Welcome back</h1>
          <p class="section-intro">
            Signed in as {{ auth.user()?.email }}
            @if (roleNames()) {
              · {{ roleNames() }}
            }
          </p>
        </header>

        @if (auth.hasAnyRole(['wife']) || auth.hasAnyRole(['neia-boiz'])) {
          <div class="button-row family-links">
            @if (auth.hasAnyRole(['neia-boiz'])) {
              <a routerLink="/events" class="btn btn--primary">NEIA Boiz events</a>
            }
            @if (auth.hasAnyRole(['wife'])) {
              <a routerLink="/family/finances" class="btn btn--primary">Finances dashboard</a>
            }
          </div>
        }

        @if (!roleNames()) {
          <p class="empty">Your account doesn't have any permissions yet. Check back soon.</p>
        } @else if (pages.hasValue()) {
          @if (pages.value()?.length) {
            <div class="grid">
              @for (page of pages.value(); track page._id) {
                <article class="card">
                  <div class="card__body">
                    <h2 class="card__title">
                      <a [routerLink]="['/members', page.slug]">{{ page.title }}</a>
                    </h2>
                    @if (page.summary) {
                      <p class="card__text">{{ page.summary }}</p>
                    }
                  </div>
                </article>
              }
            </div>
          }
        } @else if (pages.error()) {
          <app-load-error />
        } @else if (pages.isLoading()) {
          <app-loading />
        }
      </div>
    </section>
  `,
  styleUrl: '../../shared/cards/card.scss',
  styles: `
    .family-links {
      margin-bottom: var(--space-10);
    }
  `,
})
export class MembersHomePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  protected readonly roleNames = computed(() =>
    (this.auth.user()?.roles ?? []).map((role) => ROLE_LABELS[role]).join(', '),
  );

  protected readonly pages = resource({
    // Users without a group would only get a 403, so don't ask
    params: () => (this.roleNames() ? {} : undefined),
    loader: () => this.auth.fetchMembersApi<MEMBER_PAGES_QUERY_RESULT>('/pages'),
  });

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Members',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }
}
