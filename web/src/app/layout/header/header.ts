import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import type { SanityLink, SiteSettings } from '../../core/models';
import { resolveLink } from '../../core/paths';
import { WizardHat } from '../../shared/wizard/wizard-hat';

const internalLink = (key: string, label: string, path: string) =>
  ({
    _key: key,
    label,
    path,
    kind: 'internal',
    url: null,
    style: null,
    internal: null,
  }) satisfies SanityLink & {
    _key: string;
  };

const DEFAULT_NAV = [
  internalLink('blog', 'Blog', '/blog'),
  internalLink('projects', 'Projects', '/projects'),
];

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, WizardHat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="container header__inner">
        <a routerLink="/" class="header__brand">
          <app-wizard-hat />
          <span>{{ settings()?.title || 'Home' }}</span>
        </a>

        <button
          type="button"
          class="header__toggle"
          [attr.aria-expanded]="menuOpen()"
          aria-controls="site-nav"
          (click)="menuOpen.set(!menuOpen())"
        >
          <span class="visually-hidden">Toggle navigation</span>
          <span class="header__toggle-bar" aria-hidden="true"></span>
        </button>

        <nav id="site-nav" class="header__nav" [class.is-open]="menuOpen()" aria-label="Main">
          <ul>
            @for (item of navItems(); track item._key) {
              @let target = resolve(item);
              <li>
                @if (target?.kind === 'internal') {
                  <a
                    [routerLink]="target.path"
                    routerLinkActive="is-active"
                    [routerLinkActiveOptions]="{ exact: target.path === '/' }"
                    >{{ item.label }}</a
                  >
                } @else if (target?.kind === 'external') {
                  <a
                    [href]="target.href"
                    [attr.target]="target.newTab ? '_blank' : null"
                    [attr.rel]="target.newTab ? 'noopener noreferrer' : null"
                    >{{ item.label }}</a
                  >
                }
              </li>
            }
          </ul>
        </nav>
      </div>
    </header>
  `,
  styleUrl: './header.scss',
})
export class Header {
  readonly settings = input<SiteSettings | null>();

  /** CMS navigation, falling back to the built-in sections until it is configured. */
  protected readonly navItems = computed(() => {
    const nav = this.settings()?.navigation;
    return nav?.length ? nav : DEFAULT_NAV;
  });
  protected readonly menuOpen = signal(false);
  protected readonly resolve = resolveLink;

  constructor() {
    // Close the mobile menu after navigating
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }
}
