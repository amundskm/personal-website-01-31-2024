import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SiteSettings } from '../../core/models';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="footer">
      <div class="container footer__inner">
        <p class="footer__text">
          © {{ year }} {{ settings()?.title }}
          @if (settings()?.footerText) {
            <span> · {{ settings()?.footerText }}</span>
          }
        </p>
        @if (settings()?.socialLinks?.length) {
          <ul class="footer__social">
            @for (link of settings()?.socialLinks; track link._key) {
              <li>
                <a [href]="link.url" target="_blank" rel="noopener noreferrer me">{{
                  link.label || platformLabels[link.platform ?? 'other']
                }}</a>
              </li>
            }
          </ul>
        }
      </div>
    </footer>
  `,
  styleUrl: './footer.scss',
})
export class Footer {
  readonly settings = input<SiteSettings | null>();

  protected readonly year = new Date().getFullYear();
  protected readonly platformLabels: Record<string, string> = {
    github: 'GitHub',
    linkedin: 'LinkedIn',
    x: 'X',
    bluesky: 'Bluesky',
    mastodon: 'Mastodon',
    youtube: 'YouTube',
    email: 'Email',
    other: 'Link',
  };
}
