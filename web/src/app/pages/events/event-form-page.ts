import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  canManage,
  DEFAULT_REMINDERS,
  type EventDate,
  type EventDetail,
  type EventInput,
  type GroupEvent,
  REMINDER_PRESETS,
  validateEventInput,
} from '../../core/events/events';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';

interface DateRow {
  key: number;
  date: string;
  /** Optional last day, for a range. */
  endDate: string;
  startTime: string;
  endTime: string;
}

/** Create an event (poll or fixed date), or edit one you organize. */
@Component({
  selector: 'app-event-form-page',
  imports: [RouterLink, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container container--narrow">
        <a [routerLink]="id() ? ['/events', id()] : '/events'" class="back-link">← Back</a>
        <header class="page-header">
          <p class="eyebrow">NEIA Boiz</p>
          <h1>{{ id() ? 'Edit event' : 'New event' }}</h1>
        </header>

        @if (id() && existing.isLoading()) {
          <app-loading />
        } @else if (id() && existing.error()) {
          <app-load-error />
        } @else if (id() && !allowed()) {
          <p class="empty">Only the organizer can edit this event.</p>
        } @else {
          <form class="ev-form" (submit)="submit($event)">
            <label class="ev-field">
              <span>What are we doing?</span>
              <input
                [value]="title()"
                (input)="title.set($any($event.target).value)"
                required
                maxlength="120"
                placeholder="e.g. Summer lake weekend"
              />
            </label>

            <label class="ev-field">
              <span>Details</span>
              <textarea
                rows="5"
                maxlength="5000"
                [value]="details()"
                (input)="details.set($any($event.target).value)"
                placeholder="Plans, what to bring, cost, who's driving…"
              ></textarea>
            </label>

            <div class="ev-row">
              <label class="ev-field">
                <span>Place</span>
                <input
                  [value]="placeName()"
                  (input)="placeName.set($any($event.target).value)"
                  maxlength="200"
                  placeholder="e.g. Mike's cabin"
                />
              </label>
              <label class="ev-field">
                <span>Address</span>
                <input
                  [value]="address()"
                  (input)="address.set($any($event.target).value)"
                  maxlength="300"
                  autocomplete="street-address"
                />
              </label>
            </div>

            <fieldset class="ev-fieldset">
              <legend>When</legend>
              @if (!lockedToFixed()) {
                <div class="ev-choices" role="radiogroup" aria-label="How to pick the date">
                  <label
                    ><input
                      type="radio"
                      name="mode"
                      [checked]="mode() === 'poll'"
                      (change)="setMode('poll')"
                    />
                    Poll the group on dates</label
                  >
                  <label
                    ><input
                      type="radio"
                      name="mode"
                      [checked]="mode() === 'fixed'"
                      (change)="setMode('fixed')"
                    />
                    The date is set</label
                  >
                </div>
              }
              @for (row of dates(); track row.key; let i = $index) {
                <div class="ev-date-row">
                  <label class="ev-field">
                    <span>{{ row.endDate ? 'First day' : 'Date' }}</span>
                    <input
                      type="date"
                      required
                      [value]="row.date"
                      (input)="updateDate(row.key, { date: $any($event.target).value })"
                    />
                  </label>
                  <label class="ev-field">
                    <span>Last day <small>(for a range)</small></span>
                    <input
                      type="date"
                      [value]="row.endDate"
                      [min]="nextDay(row.date)"
                      [disabled]="!row.date"
                      (input)="updateDate(row.key, { endDate: $any($event.target).value })"
                    />
                  </label>
                  <label class="ev-field">
                    <span>{{ row.endDate ? 'Starts' : 'Start' }} <small>(optional)</small></span>
                    <input
                      type="time"
                      [value]="row.startTime"
                      (input)="updateDate(row.key, { startTime: $any($event.target).value })"
                    />
                  </label>
                  <label class="ev-field">
                    <span
                      >{{ row.endDate ? 'Ends (last day)' : 'End' }} <small>(optional)</small></span
                    >
                    <input
                      type="time"
                      [value]="row.endTime"
                      [disabled]="!row.startTime"
                      (input)="updateDate(row.key, { endTime: $any($event.target).value })"
                    />
                  </label>
                  @if (mode() === 'poll' && dates().length > 1) {
                    <button
                      type="button"
                      class="btn btn--text"
                      (click)="removeDate(row.key)"
                      [attr.aria-label]="'Remove date ' + (i + 1)"
                    >
                      Remove
                    </button>
                  }
                </div>
              }
              @if (mode() === 'poll' && dates().length < 20) {
                <button type="button" class="btn btn--text" (click)="addDate()">
                  + Add another date
                </button>
              }
              <p class="ev-meta">
                Times are Central. Add a last day for a weekend or trip. Leave the start time empty
                for all day.
              </p>
            </fieldset>

            <fieldset class="ev-fieldset">
              <legend>Email reminders</legend>
              @for (preset of presets; track preset.minutes) {
                <label class="ev-check">
                  <input
                    type="checkbox"
                    [checked]="reminders().includes(preset.minutes)"
                    (change)="toggleReminder(preset.minutes, $any($event.target).checked)"
                  />
                  {{ preset.label }}
                </label>
              }
              <p class="ev-meta">Sent to everyone except people who said they can't make it.</p>
            </fieldset>

            @if (error(); as e) {
              <p class="ev-error" role="alert">{{ e }}</p>
            }
            <div class="button-row">
              <button type="submit" class="btn btn--primary" [disabled]="busy()">
                {{ busy() ? 'Saving…' : submitLabel() }}
              </button>
            </div>
            <p class="ev-meta">
              Everyone in NEIA Boiz gets an email {{ id() ? 'if the date changes' : 'about it' }}.
            </p>
          </form>
        }
      </div>
    </section>
  `,
  styleUrl: './events.scss',
})
export class EventFormPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  /** Bound from the `:id` route param when editing. */
  readonly id = input<string>();

  protected readonly existing = resource({
    params: () => this.id(),
    loader: ({ params: id }) =>
      this.auth.fetchMembersApi<EventDetail>(`/events/${encodeURIComponent(id)}`),
  });

  protected readonly title = signal('');
  protected readonly details = signal('');
  protected readonly placeName = signal('');
  protected readonly address = signal('');
  protected readonly mode = signal<'poll' | 'fixed'>('poll');
  protected readonly dates = signal<DateRow[]>([newRow(), newRow()]);
  protected readonly reminders = signal<number[]>([...DEFAULT_REMINDERS]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly presets = REMINDER_PRESETS;

  private readonly event = computed(() =>
    this.existing.hasValue() ? (this.existing.value()?.event ?? null) : null,
  );
  protected readonly allowed = computed(() => {
    const d = this.existing.hasValue() ? this.existing.value() : null;
    return !!d && canManage(d.event, d.me.id, d.me.isAdmin) && d.event.status !== 'cancelled';
  });
  /** A confirmed event just has its date edited; it can't go back to a poll. */
  protected readonly lockedToFixed = computed(() => this.event()?.status === 'confirmed');

  protected readonly submitLabel = computed(() => {
    if (!this.id()) return this.mode() === 'poll' ? 'Start the poll' : 'Create event';
    return this.mode() === 'fixed' && this.event()?.status === 'polling'
      ? 'Save and confirm'
      : 'Save';
  });

  constructor() {
    // Fill the form from the event being edited
    effect(() => {
      const event = this.event();
      if (event) this.fill(event);
    });
  }

  ngOnInit(): void {
    this.seo.setPage({
      title: this.id() ? 'Edit event' : 'New event',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }

  protected setMode(mode: 'poll' | 'fixed'): void {
    this.mode.set(mode);
    if (mode === 'fixed') this.dates.update((rows) => rows.slice(0, 1));
    else if (this.dates().length < 2) this.addDate();
  }

  protected addDate(): void {
    this.dates.update((rows) => [...rows, newRow()]);
  }

  protected removeDate(key: number): void {
    this.dates.update((rows) => rows.filter((r) => r.key !== key));
  }

  protected updateDate(key: number, changes: Partial<DateRow>): void {
    this.dates.update((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...changes };
        // A range must end after it starts
        if (next.endDate && next.endDate <= next.date) next.endDate = '';
        return next.startTime ? next : { ...next, endTime: '' };
      }),
    );
  }

  /** The day after `date`: the earliest last day for a range. */
  protected nextDay(date: string): string | null {
    if (!date) return null;
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }

  protected toggleReminder(minutes: number, on: boolean): void {
    this.reminders.update((list) => (on ? [...list, minutes] : list.filter((m) => m !== minutes)));
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const input: EventInput = {
      title: this.title().trim(),
      details: this.details().trim(),
      location: this.placeName().trim()
        ? { name: this.placeName().trim(), address: this.address().trim() || null }
        : null,
      options: this.dates()
        .filter((r) => r.date)
        .map((r): EventDate => ({
          date: r.date,
          endDate: r.endDate && r.endDate > r.date ? r.endDate : null,
          startTime: r.startTime || null,
          endTime: (r.startTime && r.endTime) || null,
        })),
      confirmNow: this.mode() === 'fixed',
      reminderOffsets: this.reminders(),
    };
    const problem =
      this.mode() === 'poll' && input.options.length < 2
        ? 'Add at least two dates to poll on, or choose "The date is set".'
        : validateEventInput(input);
    if (problem) {
      this.error.set(problem);
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const saved = await this.auth.fetchMembersApi<GroupEvent>(
        id ? `/events/${encodeURIComponent(id)}` : '/events',
        { method: id ? 'PUT' : 'POST', body: input },
      );
      await this.router.navigate(['/events', saved?.id ?? id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The event could not be saved.');
    } finally {
      this.busy.set(false);
    }
  }

  private fill(event: GroupEvent): void {
    this.title.set(event.title);
    this.details.set(event.details);
    this.placeName.set(event.location?.name ?? '');
    this.address.set(event.location?.address ?? '');
    this.reminders.set(event.reminders.map((r) => r.offsetMinutes));
    const dates =
      event.status === 'confirmed' && event.confirmed ? [event.confirmed] : event.options;
    this.mode.set(event.status === 'confirmed' ? 'fixed' : 'poll');
    this.dates.set(
      dates.map((d) => ({
        key: nextKey++,
        date: d.date,
        endDate: d.endDate ?? '',
        startTime: d.startTime ?? '',
        endTime: d.endTime ?? '',
      })),
    );
  }
}

let nextKey = 0;
const newRow = (): DateRow => ({
  key: nextKey++,
  date: '',
  endDate: '',
  startTime: '',
  endTime: '',
});
