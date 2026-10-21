import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  bestOptionIds,
  canJoin,
  canLeave,
  canHandOff,
  canManage,
  type EventDetail,
  eventIcs,
  formatDeadline,
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
  voteDeadline,
  votingOpen,
} from '../../core/events/events';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { NotFound } from '../not-found/not-found';
import { EventAttachments } from './event-attachments';
import { EventComments } from './event-comments';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';
import { NamePrompt } from './name-prompt';

/** How often an open event page checks for other people's changes. */
const REFRESH_MS = 25_000;

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
    EventAttachments,
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
                  @if (canHandOff()) {
                    <button
                      type="button"
                      class="btn btn--text"
                      [disabled]="busy()"
                      (click)="handOff()"
                    >
                      Hand off to {{ nameOf(e.coOrganizer!) }}
                    </button>
                  }
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
                  @if (e.image?.url) {
                    <a class="ev-cover" [href]="e.image!.url" target="_blank" rel="noopener">
                      <img [src]="e.image!.url" [alt]="'Image for ' + e.title" loading="lazy" />
                    </a>
                  }
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
                  <p class="ev-meta">
                    Organized by {{ nameOf(e.createdBy) }}
                    @if (e.coOrganizer) {
                      with {{ nameOf(e.coOrganizer) }}
                    }
                  </p>
                  <p class="ev-meta">
                    {{ inviteSummary() }}
                    @if (leavable()) {
                      <button type="button" class="ev-leave" [disabled]="busy()" (click)="leave()">
                        Leave event
                      </button>
                    }
                  </p>
                  @if (e.status !== 'cancelled') {
                    <app-event-attachments [detail]="d" (changed)="replaceEvent($event)" />
                  }
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
                        @if (joinable()) {
                          <button
                            type="button"
                            class="btn btn--primary ev-join"
                            [disabled]="busy()"
                            (click)="join()"
                          >
                            Join this event
                          </button>
                        }
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
                      @if (joinable()) {
                        <button
                          type="button"
                          class="btn btn--primary ev-join"
                          [disabled]="busy()"
                          (click)="join()"
                        >
                          Join this event
                        </button>
                      }
                    </p>
                  }
                  @if (e.voteBy) {
                    <p class="ev-deadline" [class.is-closed]="!open()">
                      @if (open()) {
                        Voting closes {{ deadline(e) }} ({{ deadlineIn() }})
                      } @else {
                        Voting closed {{ deadline(e) }}.
                        @if (manager()) {
                          Pick a date below, or edit the event to extend the deadline.
                        }
                      }
                    </p>
                  }
                  <p class="ev-meta">
                    @if (open()) {
                      Mark each date. Your answers save as you go.
                    }
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
                                    [disabled]="busy() || !open()"
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
  private refreshing = false;

  /**
   * Re-fetches the event in the background. Skipped while hidden, loading or
   * mid-action; a failed check is ignored (the next one tries again), so a
   * network blip never replaces the page with an error.
   */
  private async refreshQuietly(): Promise<void> {
    if (
      this.refreshing ||
      this.busy() ||
      document.visibilityState !== 'visible' ||
      !this.data.hasValue() ||
      this.data.isLoading()
    ) {
      return;
    }
    this.refreshing = true;
    const id = this.id();
    try {
      const latest = await this.auth.fetchMembersApi<EventDetail>(
        `/events/${encodeURIComponent(id)}`,
      );
      // Ignore the answer if the user moved to another event or started an action meanwhile
      if (latest && id === this.id() && !this.busy()) this.data.set(latest);
    } catch {
      // Try again on the next tick
    } finally {
      this.refreshing = false;
    }
  }
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  protected readonly votes = VOTES;
  protected readonly rsvps = RSVPS;

  private readonly detail = computed(() => (this.data.hasValue() ? this.data.value() : null));

  protected readonly manager = computed(() => {
    const d = this.detail();
    return !!d && canManage(d.event, d.me.id, d.me.isAdmin);
  });

  /** Only the organizer can hand the event to the co-organizer. */
  protected readonly canHandOff = computed(() => {
    const d = this.detail();
    return !!d && canHandOff(d.event, d.me.id);
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

  protected readonly joinable = computed(() => {
    const d = this.detail();
    return !!d && canJoin(d.event, d.me.id);
  });
  protected readonly leavable = computed(() => {
    const d = this.detail();
    return !!d && canLeave(d.event, d.me.id);
  });

  protected join(): void {
    void this.run(
      `/events/${this.id()}/join`,
      'POST',
      {},
      "You're in. You'll get this event's emails now.",
    );
  }

  protected leave(): void {
    if (!confirm('Leave this event? Your votes and RSVP will be removed.')) return;
    void this.run(`/events/${this.id()}/leave`, 'POST', {}, 'You left this event.');
  }

  protected readonly inviteSummary = computed(() => {
    const d = this.detail();
    if (!d) return '';
    if (isForEveryone(d.event)) return 'Everyone in NEIA Boiz is invited.';
    const count = invitedMembers(d.event, d.members).length;
    return (
      `${count} ${count === 1 ? 'person' : 'people'} invited` +
      (d.event.inviteesOnly ? ' · only they can see this event.' : ' · any member can join.')
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
  protected readonly deadline = (e: GroupEvent) => formatDeadline(e.voteBy!);

  /** Whether voting is open (re-checked every minute so the page closes on time). */
  private readonly now = signal(new Date());
  protected readonly open = computed(() => {
    const d = this.detail();
    return !!d && votingOpen(d.event, this.now());
  });
  /** "in 3 days", "in 5 hours", "in 20 minutes". */
  protected readonly deadlineIn = computed(() => {
    const d = this.detail();
    const end = d ? voteDeadline(d.event) : null;
    if (!end) return '';
    const minutes = Math.max(0, Math.round((end.getTime() - this.now().getTime()) / 60_000));
    if (minutes >= 48 * 60) return `in ${Math.round(minutes / (24 * 60))} days`;
    if (minutes >= 60) return `in ${Math.round(minutes / 60)} hours`;
    return `in ${minutes} minutes`;
  });
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
    // Coming from the form: report any files that didn't upload
    const failed = (history.state as { failedUploads?: string[] } | null)?.failedUploads;
    if (failed?.length) {
      this.message.set({
        text: `The event was saved, but ${failed.join(', ')} didn't upload. Add ${
          failed.length === 1 ? 'it' : 'them'
        } again below.`,
        error: true,
      });
    }
    const tick = setInterval(() => this.now.set(new Date()), 60_000);

    // Pick up other people's comments, votes and RSVPs while the page is open:
    // every 25 seconds while the tab is visible, and right away on returning to it
    const document = inject(DOCUMENT);
    const poll = setInterval(() => void this.refreshQuietly(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.refreshQuietly();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    });
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

  protected handOff(): void {
    const coOrganizer = this.detail()?.event.coOrganizer;
    if (!coOrganizer) return;
    const name = this.nameOf(coOrganizer);
    if (
      !confirm(
        `Hand this event off to ${name}? They become the organizer, and you stay invited but can't edit it anymore.`,
      )
    )
      return;
    void this.run(
      `/events/${this.id()}/handoff`,
      'POST',
      {},
      `${name} is the organizer now. They've been emailed.`,
    );
  }

  /** Swaps in the event an attachment change returned, keeping everything else. */
  protected replaceEvent(event: GroupEvent): void {
    const current = this.data.hasValue() ? this.data.value() : null;
    if (current) this.data.set({ ...current, event });
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
