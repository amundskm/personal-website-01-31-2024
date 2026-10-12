import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SeoService } from '../../core/seo.service';

/**
 * Where the "Unsubscribe" link in event emails lands. Works without logging
 * in: the link is signed for one member. Asks before turning emails off.
 */
@Component({
  selector: 'app-unsubscribe-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container container--narrow">
        <header class="page-header">
          <p class="eyebrow">neiaboiz.com</p>
          <h1>Event emails</h1>
        </header>
        @switch (state()) {
          @case ('ask') {
            <p>
              Stop all NEIA Boiz event emails: polls, updates, reminders and comment notifications?
            </p>
            <div class="button-row">
              <button type="button" class="btn btn--primary" (click)="confirm()">
                Unsubscribe
              </button>
              <a routerLink="/profile" class="btn btn--text">Choose which emails instead</a>
            </div>
          }
          @case ('working') {
            <p role="status">Unsubscribing…</p>
          }
          @case ('done') {
            <p role="status">
              You're unsubscribed. You won't get event emails from neiaboiz.com anymore.
            </p>
            <p>
              Changed your mind? Turn emails back on from <a routerLink="/profile">your profile</a>.
            </p>
          }
          @case ('invalid') {
            <p role="alert">{{ error() }}</p>
            <p>
              You can also change your emails from <a routerLink="/profile">your profile</a> after
              logging in.
            </p>
          }
        }
      </div>
    </section>
  `,
})
export class UnsubscribePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  /** From the link's query string. */
  readonly m = input<string>();
  readonly t = input<string>();

  protected readonly state = signal<'ask' | 'working' | 'done' | 'invalid'>('ask');
  protected readonly error = signal('');

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Unsubscribe',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
    if (!this.m() || !this.t()) {
      this.error.set('This unsubscribe link is incomplete.');
      this.state.set('invalid');
    }
  }

  protected async confirm(): Promise<void> {
    this.state.set('working');
    try {
      await this.auth.postPublicApi('/unsubscribe', { m: this.m(), t: this.t() });
      this.state.set('done');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Something went wrong.');
      this.state.set('invalid');
    }
  }
}
