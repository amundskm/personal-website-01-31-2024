import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SeoService } from '../../core/seo.service';

type Step = 'signIn' | 'newPassword' | 'forgot' | 'reset';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-login-page',
  imports: [NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container login">
        @switch (auth.state().status) {
          @case ('loading') {
            <div class="status" role="status" aria-live="polite">Loading…</div>
          }
          @case ('unavailable') {
            <h1>Log in</h1>
            <p class="empty">Signing in isn't available right now. Please try again later.</p>
          }
          @case ('signedIn') {
            <h1>You're signed in</h1>
            <p class="empty">Signed in as {{ auth.user()?.email }}.</p>
            <div class="button-row">
              <a routerLink="/members" class="btn btn--primary">Go to members area</a>
              <button type="button" class="btn btn--secondary" (click)="signOut()">Log out</button>
            </div>
          }
          @default {
            @switch (step()) {
              @case ('signIn') {
                <h1>Log in</h1>
                <form class="login__form" (submit)="submit($event)">
                  <label class="field">
                    <span>Email</span>
                    <input
                      name="email"
                      type="email"
                      autocomplete="username"
                      required
                      [value]="email()"
                    />
                  </label>
                  <label class="field">
                    <span>Password</span>
                    <input
                      name="password"
                      type="password"
                      autocomplete="current-password"
                      required
                    />
                  </label>
                  <ng-container *ngTemplateOutlet="actions; context: { label: 'Log in' }" />
                </form>
                <button type="button" class="btn btn--text" (click)="goTo('forgot')">
                  Forgot your password?
                </button>
              }
              @case ('newPassword') {
                <h1>Choose a password</h1>
                <p class="empty">Welcome! Replace your temporary password with one of your own.</p>
                <form class="login__form" (submit)="submit($event)">
                  <ng-container *ngTemplateOutlet="newPasswordFields" />
                  <ng-container *ngTemplateOutlet="actions; context: { label: 'Save password' }" />
                </form>
              }
              @case ('forgot') {
                <h1>Reset your password</h1>
                <p class="empty">We'll email you a verification code.</p>
                <form class="login__form" (submit)="submit($event)">
                  <label class="field">
                    <span>Email</span>
                    <input
                      name="email"
                      type="email"
                      autocomplete="username"
                      required
                      [value]="email()"
                    />
                  </label>
                  <ng-container *ngTemplateOutlet="actions; context: { label: 'Send code' }" />
                </form>
                <button type="button" class="btn btn--text" (click)="goTo('signIn')">
                  Back to log in
                </button>
              }
              @case ('reset') {
                <h1>Reset your password</h1>
                <p class="empty">Enter the code sent to {{ email() }}.</p>
                <form class="login__form" (submit)="submit($event)">
                  <label class="field">
                    <span>Verification code</span>
                    <input name="code" inputmode="numeric" autocomplete="one-time-code" required />
                  </label>
                  <ng-container *ngTemplateOutlet="newPasswordFields" />
                  <ng-container *ngTemplateOutlet="actions; context: { label: 'Reset password' }" />
                </form>
                <button type="button" class="btn btn--text" (click)="goTo('signIn')">
                  Back to log in
                </button>
              }
            }
          }
        }
      </div>
    </section>

    <ng-template #newPasswordFields>
      <label class="field">
        <span>New password</span>
        <input
          name="password"
          type="password"
          autocomplete="new-password"
          required
          [minLength]="minLength"
        />
      </label>
      <label class="field">
        <span>Confirm new password</span>
        <input
          name="confirm"
          type="password"
          autocomplete="new-password"
          required
          [minLength]="minLength"
        />
      </label>
    </ng-template>

    <ng-template #actions let-label="label">
      @if (message(); as m) {
        <p
          class="login__message"
          [class.is-error]="m.error"
          [attr.role]="m.error ? 'alert' : 'status'"
        >
          {{ m.text }}
        </p>
      }
      <button type="submit" class="btn btn--primary" [disabled]="busy()">
        {{ busy() ? 'Please wait…' : label }}
      </button>
    </ng-template>
  `,
  styleUrl: './login-page.scss',
})
export class LoginPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  /** Where to go after signing in (from the `?redirect=` query param). */
  readonly redirect = input<string>();

  protected readonly step = signal<Step>('signIn');
  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  protected readonly minLength = MIN_PASSWORD_LENGTH;

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Log in',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }

  protected goTo(step: Step): void {
    this.message.set(null);
    this.step.set(step);
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const field = (name: string) => String(data.get(name) ?? '');

    const password = field('password');
    if (data.has('confirm') && password !== field('confirm')) {
      this.message.set({ text: "The passwords don't match.", error: true });
      return;
    }

    this.busy.set(true);
    this.message.set(null);
    try {
      switch (this.step()) {
        case 'signIn':
          this.email.set(field('email'));
          await this.afterSignInStep(await this.auth.signIn(field('email'), password));
          break;
        case 'newPassword':
          await this.afterSignInStep(await this.auth.confirmNewPassword(password));
          break;
        case 'forgot':
          this.email.set(field('email'));
          await this.auth.requestPasswordReset(field('email'));
          this.step.set('reset');
          break;
        case 'reset':
          await this.auth.confirmPasswordReset(this.email(), field('code'), password);
          this.step.set('signIn');
          this.message.set({ text: 'Password updated. You can log in now.', error: false });
          break;
      }
    } catch (error) {
      this.message.set({ text: errorMessage(error), error: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.step.set('signIn');
  }

  private async afterSignInStep(next: 'done' | 'newPassword'): Promise<void> {
    if (next === 'newPassword') {
      this.step.set('newPassword');
      return;
    }
    await this.router.navigateByUrl(safeRedirect(this.redirect()));
  }
}

/** Only follow same-site paths, so `?redirect=` can't send people elsewhere. */
function safeRedirect(url: string | undefined): string {
  return url?.startsWith('/') && !url.startsWith('//') ? url : '/members';
}

function errorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return 'Incorrect email or password.';
    case 'CodeMismatchException':
      return "That code isn't right. Check the email and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired. Request a new one.';
    case 'InvalidPasswordException':
      return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters, including upper and lower case letters, a number and a symbol.`;
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
}
