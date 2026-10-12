import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  bestOptionIds,
  canManage,
  type EventDetail,
  eventIcs,
  formatEventDate,
  googleCalendarUrl,
  type GroupEvent,
  invitedMembers,
  isForEveryone,
  isInvited,
  mapLink,
  reminderLabel,
  type Rsvp,
  scoreOptions,
  shortDateLabel,
  type Vote,
} from '../../core/events/events';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';
import { EventComments } from './event-comments';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';
import { NamePrompt } from './name-prompt';

const VOTES: { value: Vote; label: string; symbol: string }[] = [
  { value: 'yes', label: 'Yes', symbol: '✓' },
  { value: 'maybe', label: 'Maybe', symbol: '?' },
  { value: 'no', label: 'No', symbol: '✗' },
];

const RSVPS: { value: Rsvp; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: "Can't make it" },
];

/** One event: the date poll, or the confirmed details with RSVPs. */
@Component({
  selector: 'app-event-page',
  imports: [
    RouterLink,
    NamePrompt,
    EventComments,
    MemberAvatar,
    NotFound,
    LoadingComponent,
    LoadErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.hasValue()) {
      @if (data.value(); as d) {
        @let e = d.event;
        <section class="section">
          <div class="container ev-page">
            <a routerLink="/events" class="back-link">← All events</a>
            <header class="page-header ev-header">
              <div>
                <p class="eyebrow">{{ statusLabel(e) }}</p>
                <h1>{{ e.title }}</h1>
              </div>
              @if (manager() && e.status !== 'cancelled') {
                <div class="button-row">
                  <a routerLink="edit" class="btn btn--secondary">Edit</a>
                  <button
                    type="button"
                    class="btn btn--text"
                    [disabled]="busy()"
                    (click)="cancel()"
                  >
                    Cancel event
                  </button>
                </div>
              } @else if (manager() && e.status === 'cancelled') {
                <div class="button-row">
                  <button
                    type="button"
                    class="btn btn--primary"
                    [disabled]="busy()"
                    (click)="restore(true)"
                  >
                    Restore and email everyone
                  </button>
                  <button
                    type="button"
                    class="btn btn--secondary"
                    [disabled]="busy()"
                    (click)="restore(false)"
                  >
                    Restore quietly
                  </button>
                </div>
              }
            </header>

            @if (!d.me.hasName) {
              <app-name-prompt (saved)="data.reload()" />
            }
            @if (message(); as m) {
              <p
                class="ev-status"
                [class.ev-error]="m.error"
                [attr.role]="m.error ? 'alert' : 'status'"
              >
                {{ m.text }}
              </p>
            }

            <div class="ev-grid">
              <div class="ev-stack">
                <article class="ev-card">
                  @if (e.confirmed && e.status !== 'polling') {
                    <p class="ev-when">{{ when(e) }}</p>
                  }
                  @if (e.location) {
                    <p>
                      <strong>{{ e.location.name }}</strong>
                      @if (e.location.address) {
                        <br />{{ e.location.address }}
                      }
                      <br /><a [href]="map(e)" target="_blank" rel="noopener noreferrer"
                        >Open in Maps</a
                      >
                    </p>
                  }
                  @if (e.details) {
                    <p class="ev-details">{{ e.details }}</p>
                  }
                  <p class="ev-meta">Organized by {{ nameOf(e.createdBy) }}</p>
                  <p class="ev-meta">{{ inviteSummary() }}</p>
                  @if (e.status === 'confirmed') {
                    <p class="ev-meta">Email reminders: {{ remindersText(e) || 'none' }}</p>
                    <div class="button-row">
                      <a
                        class="btn btn--secondary"
                        [href]="google(e)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Add to Google Calendar
                      </a>
                      <button type="button" class="btn btn--secondary" (click)="downloadIcs(e)">
                        Apple / Outlook (.ics)
                      </button>
                    </div>
                    <p class="ev-meta">
                      Or <a routerLink="/profile" fragment="calendar">subscribe</a> to get every
                      event automatically.
                    </p>
                  }
                </article>

                @if (e.status === 'confirmed') {
                  <article class="ev-card">
                    <h2>{{ invited() ? 'Are you coming?' : "Who's coming" }}</h2>
                    @if (!invited()) {
                      <p class="ev-notice">
                        You're not invited to this one, but you can follow along.
                      </p>
                    }
                    <div
                      class="ev-choices"
                      role="group"
                      aria-label="Your RSVP"
                      [hidden]="!invited()"
                    >
                      @for (option of rsvps; track option.value) {
                        <button
                          type="button"
                          class="btn"
                          [class.btn--primary]="e.rsvps[d.me.id] === option.value"
                          [class.btn--secondary]="e.rsvps[d.me.id] !== option.value"
                          [attr.aria-pressed]="e.rsvps[d.me.id] === option.value"
                          [disabled]="busy()"
                          (click)="setRsvp(option.value)"
                        >
                          {{ option.label }}
                        </button>
                      }
                    </div>
                    @for (group of attendance(); track group.label) {
                      <h3 class="ev-subhead">{{ group.label }} ({{ group.people.length }})</h3>
                      @if (group.people.length) {
                        <ul class="ev-people">
                          @for (person of group.people; track person.id) {
                            <li>
                              <app-member-avatar
                                [name]="person.name"
                                [url]="person.avatarUrl"
                                [size]="28"
                              />
                              {{ person.id === d.me.id ? 'You' : person.name }}
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="ev-meta">—</p>
                      }
                    }
                  </article>
                }
              </div>

              @if (e.status === 'polling') {
                <article class="ev-card ev-poll-card">
                  <h2>Which dates work?</h2>
                  @if (!invited()) {
                    <p class="ev-notice">
                      You're not invited to this one, but you can follow along.
                    </p>
                  }
                  <p class="ev-meta">
                    Mark each date. Your answers save as you go.
                    @if (manager()) {
                      Confirm a date when everyone has voted.
                    }
                  </p>
                  <div class="table-scroll">
                    <table class="ev-poll">
                      <thead>
                        <tr>
                          <th scope="col"><span class="visually-hidden">Member</span></th>
                          @for (option of e.options; track option.id) {
                            <th scope="col" [class.is-best]="best().includes(option.id)">
                              {{ optionLabel(option) }}
                            </th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (member of members(); track member.id) {
                          <tr [class.is-me]="member.id === d.me.id">
                            <th scope="row">
                              <span class="ev-person">
                                <app-member-avatar
                                  [name]="member.name"
                                  [url]="member.avatarUrl"
                                  [size]="26"
                                />
                                {{ member.id === d.me.id ? 'You' : member.name }}
                              </span>
                            </th>
                            @for (option of e.options; track option.id) {
                              <td [class.is-best]="best().includes(option.id)">
                                @if (member.id === d.me.id) {
                                  <select
                                    [attr.aria-label]="'Your answer for ' + optionLabel(option)"
                                    [disabled]="busy()"
                                    (change)="setVote(option.id, $any($event.target).value)"
                                  >
                                    <option value="" [selected]="!myVotes()[option.id]">—</option>
                                    @for (v of votes; track v.value) {
                                      <option
                                        [value]="v.value"
                                        [selected]="myVotes()[option.id] === v.value"
                                      >
                                        {{ v.label }}
                                      </option>
                                    }
                                  </select>
                                } @else {
                                  @let v = e.votes[member.id]?.[option.id];
                                  <span [class]="'ev-vote ev-vote--' + (v ?? 'none')">
                                    {{ v ? symbol(v) : '·' }}
                                    <span class="visually-hidden">{{ v ?? 'no answer' }}</span>
                                  </span>
                                }
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Yes / Maybe</th>
                          @for (score of scores(); track score.optionId) {
                            <td [class.is-best]="best().includes(score.optionId)">
                              {{ score.yes }} / {{ score.maybe }}
                            </td>
                          }
                        </tr>
                        @if (manager()) {
                          <tr>
                            <th scope="row"><span class="visually-hidden">Confirm</span></th>
                            @for (option of e.options; track option.id) {
                              <td>
                                <button
                                  type="button"
                                  class="btn btn--text"
                                  [disabled]="busy()"
                                  (click)="confirmDate(option.id)"
                                >
                                  Confirm
                                </button>
                              </td>
                            }
                          </tr>
                        }
                      </tfoot>
                    </table>
                  </div>
                </article>
              }
            </div>

            <app-event-comments class="ev-discussion-wrap" [detail]="d" (changed)="data.reload()" />
          </div>
        </section>
      } @else {
        <app-not-found />
      }
    } @else if (data.error()) {
      <app-load-error />
    } @else if (data.isLoading()) {
      <app-loading />
    }
  `,
  styleUrl: './events.scss',
})
export class EventPage {
  private readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  protected readonly data = resource({
    params: () => this.id(),
    loader: ({ params: id }) =>
      this.auth.fetchMembersApi<EventDetail>(`/events/${encodeURIComponent(id)}`),
  });

  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  protected readonly votes = VOTES;
  protected readonly rsvps = RSVPS;

  private readonly detail = computed(() => (this.data.hasValue() ? this.data.value() : null));

  protected readonly manager = computed(() => {
    const d = this.detail();
    return !!d && canManage(d.event, d.me.id, d.me.isAdmin);
  });

  /** Whether I can vote and RSVP (everyone, unless there's an invite list). */
  protected readonly invited = computed(() => {
    const d = this.detail();
    return !!d && isInvited(d.event, d.me.id);
  });

  /** Invited members for the poll grid and RSVP lists: you first (if invited), then by name. */
  protected readonly members = computed(() => {
    const d = this.detail();
    if (!d) return [];
    const others = invitedMembers(d.event, d.members).filter((m) => m.id !== d.me.id);
    if (!this.invited()) return others;
    const me = d.members.find((m) => m.id === d.me.id) ?? { id: d.me.id, name: d.me.name };
    return [me, ...others];
  });

  protected readonly inviteSummary = computed(() => {
    const d = this.detail();
    if (!d) return '';
    if (isForEveryone(d.event)) return 'Everyone in NEIA Boiz is invited.';
    const count = invitedMembers(d.event, d.members).length;
    return (
      `${count} ${count === 1 ? 'person' : 'people'} invited` +
      (d.event.inviteesOnly ? ' · only they can see this event.' : '.')
    );
  });

  protected readonly myVotes = computed(() => {
    const d = this.detail();
    return d ? (d.event.votes[d.me.id] ?? {}) : {};
  });

  protected readonly scores = computed(() => {
    const d = this.detail();
    return d ? scoreOptions(d.event) : [];
  });

  protected readonly best = computed(() => {
    const d = this.detail();
    return d ? bestOptionIds(d.event) : [];
  });

  protected readonly attendance = computed(() => {
    const d = this.detail();
    if (!d) return [];
    const people = (rsvp: Rsvp | null) =>
      this.members().filter((m) => (d.event.rsvps[m.id] ?? null) === rsvp);
    return [
      { label: 'Going', people: people('going') },
      { label: 'Maybe', people: people('maybe') },
      { label: "Can't make it", people: people('no') },
      { label: 'No reply yet', people: people(null) },
    ];
  });

  protected readonly when = (e: GroupEvent) => formatEventDate(e.confirmed!);
  protected readonly map = (e: GroupEvent) => mapLink(e.location!);
  protected readonly google = (e: GroupEvent) => googleCalendarUrl(e, location.href);
  protected readonly optionLabel = (option: GroupEvent['options'][number]) =>
    option.endDate
      ? shortDateLabel(option)
      : formatEventDate(option)
          .replace(/, \d{4}/, '')
          .replace(' · All day', '');
  protected readonly symbol = (vote: Vote) => VOTES.find((v) => v.value === vote)!.symbol;
  protected readonly remindersText = (e: GroupEvent) =>
    e.reminders.map((r) => reminderLabel(r.offsetMinutes)).join(', ');
  protected readonly statusLabel = (e: GroupEvent) =>
    ({ polling: 'Poll · NEIA Boiz', confirmed: 'NEIA Boiz event', cancelled: 'Cancelled' })[
      e.status
    ];

  constructor() {
    effect(() => {
      const d = this.detail();
      if (d) {
        this.seo.setPage({
          title: d.event.title,
          seo: { title: null, description: null, image: null, noIndex: true },
        });
      }
    });
  }

  protected nameOf(id: string): string {
    const d = this.detail();
    if (d?.me.id === id) return 'you';
    return d?.members.find((m) => m.id === id)?.name ?? 'a former member';
  }

  protected setVote(optionId: string, value: string): void {
    const votes: Record<string, string> = { ...this.myVotes() };
    if (value) votes[optionId] = value;
    else delete votes[optionId];
    void this.run(`/events/${this.id()}/votes`, 'PUT', { votes }, 'Saved.');
  }

  protected setRsvp(rsvp: Rsvp): void {
    void this.run(`/events/${this.id()}/rsvp`, 'PUT', { rsvp }, 'RSVP saved.');
  }

  protected confirmDate(optionId: string): void {
    const option = this.detail()?.event.options.find((o) => o.id === optionId);
    if (!option || !confirm(`Confirm ${formatEventDate(option)} and email everyone?`)) return;
    void this.run(
      `/events/${this.id()}/confirm`,
      'POST',
      { optionId },
      'Confirmed. Everyone has been emailed.',
    );
  }

  protected cancel(): void {
    if (!confirm('Cancel this event and email everyone?')) return;
    void this.run(
      `/events/${this.id()}/cancel`,
      'POST',
      {},
      'Event cancelled. Everyone has been emailed.',
    );
  }

  protected restore(notify: boolean): void {
    const question = notify
      ? 'Restore this event and email everyone that it is back on?'
      : 'Restore this event without emailing anyone?';
    if (!confirm(question)) return;
    void this.run(
      `/events/${this.id()}/restore`,
      'POST',
      { notify },
      notify ? 'Event restored. Everyone has been emailed.' : 'Event restored quietly.',
    );
  }

  protected downloadIcs(event: GroupEvent): void {
    const ics = eventIcs(event, location.href);
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'event'}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async run(
    path: string,
    method: 'PUT' | 'POST',
    body: unknown,
    done: string,
  ): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.auth.fetchMembersApi(path, { method, body });
      this.message.set({ text: done, error: false });
      this.data.reload();
    } catch (error) {
      this.message.set({
        text: error instanceof Error ? error.message : 'Something went wrong.',
        error: true,
      });
      this.data.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
