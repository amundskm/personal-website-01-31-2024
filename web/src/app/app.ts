import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { contentResource } from './core/content-api';
import type { SiteSettings } from './core/models';
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
      <router-outlet />
    </main>
    <app-footer [settings]="settings()" />
  `,
})
export class App {
  private readonly settingsResource = contentResource<SiteSettings>('/settings');

  protected readonly settings = computed(() =>
    this.settingsResource.hasValue() ? this.settingsResource.value() : null,
  );

  constructor() {
    const seo = inject(SeoService);
    effect(() => seo.setSiteDefaults(this.settings()));
  }
}
