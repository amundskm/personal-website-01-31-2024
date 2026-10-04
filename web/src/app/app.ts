import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SETTINGS_QUERY } from './core/queries';
import { sanityResource } from './core/sanity';
import { isSanityConfigured } from './core/sanity.config';
import type { SETTINGS_QUERY_RESULT } from './core/sanity.types';
import { SeoService } from './core/seo.service';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <app-header [settings]="settings()" />
    <main id="main">
      @if (!configured) {
        <div class="container setup-notice" role="note">
          <strong>Sanity is not connected yet.</strong>
          Set your project ID in <code>web/src/app/core/sanity.config.ts</code> — see the README.
        </div>
      }
      <router-outlet />
    </main>
    <app-footer [settings]="settings()" />
  `,
})
export class App {
  private readonly settingsResource = sanityResource<SETTINGS_QUERY_RESULT>(SETTINGS_QUERY);

  protected readonly configured = isSanityConfigured;
  protected readonly settings = computed(() =>
    this.settingsResource.hasValue() ? this.settingsResource.value() : null,
  );

  constructor() {
    const seo = inject(SeoService);
    effect(() => seo.setSiteDefaults(this.settings()));
  }
}
