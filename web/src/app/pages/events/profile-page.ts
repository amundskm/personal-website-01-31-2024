import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { ProfileInfo } from '../../core/events/events';
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE,
  DEFAULT_PREFS,
  type EmailPrefs,
  NO_EMAILS,
  PREF_LABELS,
} from '../../core/events/profile';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { MemberAvatar } from './member-avatar';

/** Your name, photo and which event emails you get. */
@Component({
  selector: 'app-profile-page',
  imports: [RouterLink, MemberAvatar, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container container--narrow">
        <a routerLink="/events" class="back-link">← Events</a>
        <header class="page-header">
          <p class="eyebrow">NEIA Boiz</p>
          <h1>Your profile</h1>
        </header>

        @if (data.hasValue() && data.value(); as p) {
          @if (message(); as m) {
            <p
              class="ev-status"
              [class.ev-error]="m.error"
              [attr.role]="m.error ? 'alert' : 'status'"
            >
              {{ m.text }}
            </p>
          }

          <article class="ev-card profile-card">
            <h2>Name and photo</h2>
            <div class="profile-photo">
              <app-member-avatar [name]="name() || p.name" [url]="p.avatarUrl" [size]="96" />
              <div class="button-row">
                <label class="btn btn--secondary">
                  {{ p.avatarUrl ? 'Change photo' : 'Add a photo' }}
                  <input
                    type="file"
                    accept="image/*"
                    class="visually-hidden"
                    [disabled]="busy()"
                    (change)="upload($event)"
                  />
                </label>
                @if (p.avatarUrl) {
                  <button
                    type="button"
                    class="btn btn--text"
                    [disabled]="busy()"
                    (click)="removePhoto()"
                  >
                    Remove
                  </button>
                }
              </div>
            </div>
            <form class="ev-form" (submit)="saveName($event)">
              <label class="ev-field">
                <span>Display name</span>
                <input
                  [value]="name()"
                  (input)="name.set($any($event.target).value)"
                  required
                  maxlength="40"
                  autocomplete="nickname"
                />
              </label>
              <p class="ev-meta">Shown in polls, RSVPs and comments. Signed in as {{ p.email }}.</p>
              <div class="button-row">
                <button
                  type="submit"
                  class="btn btn--primary"
                  [disabled]="busy() || !nameChanged()"
                >
                  Save name
                </button>
              </div>
            </form>
          </article>

          <article class="ev-card profile-card" id="calendar">
            <h2>Calendar</h2>
            <p>
              Subscribe once and every confirmed NEIA Boiz event shows up in your calendar,
              including date changes and cancellations.
            </p>
            @if (feed(); as f) {
              <div class="button-row">
                <a
                  class="btn btn--primary"
                  [href]="f.google"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Google Calendar
                </a>
                <a class="btn btn--secondary" [href]="f.webcal">Add to Apple Calendar</a>
                <button type="button" class="btn btn--text" (click)="copyFeed(f.https)">
                  {{ copied() ? 'Copied!' : 'Copy link' }}
                </button>
              </div>
              <p class="ev-meta">
                Outlook and other apps: subscribe "from the web" with the copied link. Google can
                take up to a day to pick up changes. This link is private to you; don't share it.
              </p>
            }
          </article>

          <article class="ev-card profile-card">
            <h2>Email notifications</h2>
            <form class="ev-form" (submit)="savePrefs($event)">
              @for (pref of prefLabels; track pref.key) {
                <label class="ev-check profile-pref">
                  <input
                    type="checkbox"
                    [checked]="prefs()[pref.key]"
                    (change)="setPref(pref.key, $any($event.target).checked)"
                  />
                  <span>
                    <strong>{{ pref.label }}</strong>
                    <span class="ev-meta">{{ pref.hint }}</span>
                  </span>
                </label>
              }
              <div class="button-row">
                <button
                  type="submit"
                  class="btn btn--primary"
                  [disabled]="busy() || !prefsChanged()"
                >
                  Save preferences
                </button>
                @if (allOff()) {
                  <button
                    type="button"
                    class="btn btn--text"
                    [disabled]="busy()"
                    (click)="prefs.set(defaults)"
                  >
                    Turn all on
                  </button>
                } @else {
                  <button
                    type="button"
                    class="btn btn--text"
                    [disabled]="busy()"
                    (click)="prefs.set(none)"
                  >
                    Unsubscribe from all
                  </button>
                }
              </div>
              @if (allOff()) {
                <p class="ev-meta">
                  You won't get any event emails. You can still see everything on the site.
                </p>
              }
            </form>
          </article>
        } @else if (data.error()) {
          <app-load-error />
        } @else if (data.isLoading()) {
          <app-loading />
        }
      </div>
    </section>
  `,
  styleUrl: './events.scss',
})
export class ProfilePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  protected readonly data = resource({
    loader: () => this.auth.fetchMembersApi<ProfileInfo>('/events/profile'),
  });

  protected readonly prefLabels = PREF_LABELS;
  protected readonly defaults = DEFAULT_PREFS;
  protected readonly none = NO_EMAILS;

  protected readonly name = signal('');
  protected readonly prefs = signal<EmailPrefs>(DEFAULT_PREFS);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);

  private readonly saved = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly nameChanged = computed(() => {
    const saved = this.saved();
    return !!this.name().trim() && (!saved?.hasName || this.name().trim() !== saved.name);
  });
  protected readonly prefsChanged = computed(
    () => JSON.stringify(this.prefs()) !== JSON.stringify(this.saved()?.prefs),
  );
  protected readonly allOff = computed(() => Object.values(this.prefs()).every((on) => !on));

  /** This member's private calendar subscription, in the forms each app wants. */
  protected readonly feed = signal<{ https: string; webcal: string; google: string } | null>(null);
  protected readonly copied = signal(false);

  protected async copyFeed(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  constructor() {
    // Build the calendar subscription links once the profile (and its token) loads
    effect(() => {
      const p = this.saved();
      if (!p?.calendarToken) return;
      void this.auth.membersApiBase().then((base) => {
        const https = `${base}/calendar/${encodeURIComponent(p.id)}/${p.calendarToken}.ics`;
        const webcal = https.replace(/^https:/, 'webcal:');
        this.feed.set({
          https,
          webcal,
          google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
        });
      });
    });
    // Start the form from what's saved
    effect(() => {
      const p = this.saved();
      if (!p) return;
      this.name.set(p.hasName ? p.name : '');
      this.prefs.set(p.prefs);
    });
  }

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Your profile',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }

  protected setPref(key: keyof EmailPrefs, on: boolean): void {
    this.prefs.update((prefs) => ({ ...prefs, [key]: on }));
  }

  protected saveName(event: SubmitEvent): void {
    event.preventDefault();
    void this.save('PUT', '/events/profile', { name: this.name().trim() }, 'Name saved.');
  }

  protected savePrefs(event: SubmitEvent): void {
    event.preventDefault();
    void this.save('PUT', '/events/profile', { prefs: this.prefs() }, 'Email preferences saved.');
  }

  protected removePhoto(): void {
    void this.save('DELETE', '/events/profile/avatar', undefined, 'Photo removed.');
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const image = await squareJpeg(file, AVATAR_SIZE);
      await this.save('PUT', '/events/profile/avatar', { image }, 'Photo updated.');
    } catch (error) {
      this.message.set({
        text: error instanceof Error ? error.message : 'That image could not be used.',
        error: true,
      });
    }
  }

  private async save(
    method: 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    done: string,
  ): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      const profile = await this.auth.fetchMembersApi<ProfileInfo>(path, { method, body });
      if (profile) this.data.set(profile);
      this.message.set({ text: done, error: false });
    } catch (error) {
      this.message.set({
        text: error instanceof Error ? error.message : 'Could not save.',
        error: true,
      });
    } finally {
      this.busy.set(false);
    }
  }
}

/** Center-crops an image to a square and encodes it as a small JPEG data URL. */
async function squareJpeg(file: File, size: number): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be opened. Try a JPEG or PNG.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if ((url.length * 3) / 4 < AVATAR_MAX_BYTES) return url;
  }
  throw new Error('That image is too detailed to shrink. Try another one.');
}
