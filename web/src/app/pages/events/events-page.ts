import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  canJoin,
  type EventsOverview,
  formatDeadline,
  formatEventDate,
  type GroupEvent,
  invitedMembers,
  isInvited,
  lastDay,
  type Rsvp,
  votingOpen,
} from '../../core/events/events';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { EventCalendar, localIsoDate } from './event-calendar';
import { NamePrompt } from './name-prompt';

const RSVP_LABELS: Record<Rsvp, string> = { going: 'Going', maybe: 'Maybe', no: "Can't make it" };

/** NEIA Boiz events: open polls, a calendar of confirmed events, upcoming and past. */
@Component({
  selector: 'app-events-page',
  imports: [RouterLink, EventCalendar, NamePrompt, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container ev-page">
        <header class="page-header ev-header">
          <div>
            <p class="eyebrow">NEIA Boiz</p>
            <h1>Events</h1>
          </div>
          <div class="button-row">
            <a routerLink="/profile" fragment="calendar" class="btn btn--text"
              >Subscribe to calendar</a
            >
            <a routerLink="new" class="btn btn--primary">New event</a>
          </div>
        </header>

        @if (data.hasValue() && data.value(); as d) {
          @if (!d.me.hasName) {
            <app-name-prompt (saved)="data.reload()" />
          }

          <div class="ev-grid">
            <div class="ev-stack">
              <article class="ev-card">
                <h2>Open polls</h2>
                @for (event of polls(); track event.id) {
                  <a class="ev-item" [class.has-thumb]="event.image?.url" [routerLink]="[event.id]">
                    @if (event.image?.url) {
                      <img class="ev-thumb" [src]="event.image!.url" alt="" loading="lazy" />
                    }
                    <strong>{{ event.title }}</strong>
                    <span class="ev-meta">
                      {{ event.options.length }} dates proposed · {{ voterCount(event) }} of
                      {{ invitedCount(event, d.members) }} voted
                    </span>
                    @if (event.voteBy) {
                      <span class="ev-meta">
                        {{ isOpen(event) ? 'Voting closes' : 'Voting closed' }}
                        {{ deadline(event) }}
                      </span>
                    }
                    @if (event.invitees) {
                      <span class="ev-invite-badge">Invite only</span>
                    }
                    @if (invited(event) && isOpen(event) && !hasVoted(event)) {
                      <span class="ev-badge">You haven't voted</span>
                    }
                  </a>
                } @empty {
                  <p class="empty">No open polls.</p>
                }
              </article>

              <article class="ev-card">
                <h2>Upcoming</h2>
                @for (event of upcoming(); track event.id) {
                  <a class="ev-item" [class.has-thumb]="event.image?.url" [routerLink]="[event.id]">
                    @if (event.image?.url) {
                      <img class="ev-thumb" [src]="event.image!.url" alt="" loading="lazy" />
                    }
                    <strong>{{ event.title }}</strong>
                    <span class="ev-meta">{{ when(event) }}</span>
                    @if (event.location) {
                      <span class="ev-meta">{{ event.location.name }}</span>
                    }
                    <span class="ev-meta">
                      {{ goingCount(event) }} going
                      @if (myRsvp(event); as r) {
                        · you: {{ rsvpLabel(r) }}
                      } @else if (invited(event)) {
                        · <span class="ev-badge">RSVP</span>
                      } @else {
                        · {{ joinable(event) ? 'open to join' : 'not invited' }}
                      }
                    </span>
                  </a>
                } @empty {
                  <p class="empty">Nothing on the calendar yet.</p>
                }
              </article>
            </div>

            <article class="ev-card">
              <h2>Calendar</h2>
              <app-event-calendar [events]="confirmed()" />
            </article>
          </div>

          @if (past().length) {
            <details class="ev-past">
              <summary>Past and cancelled ({{ past().length }})</summary>
              @for (event of past(); track event.id) {
                <a class="ev-item" [class.has-thumb]="event.image?.url" [routerLink]="[event.id]">
                  @if (event.image?.url) {
                    <img class="ev-thumb" [src]="event.image!.url" alt="" loading="lazy" />
                  }
                  <strong>{{ event.title }}</strong>
                  <span class="ev-meta">
                    {{ event.status === 'cancelled' ? 'Cancelled' : when(event) }}
                  </span>
                </a>
              }
            </details>
          }
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
export class EventsPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  protected readonly data = resource({
    loader: () => this.auth.fetchMembersApi<EventsOverview>('/events'),
  });

  private readonly events = computed(() =>
    this.data.hasValue() ? (this.data.value()?.events ?? []) : [],
  );
  private readonly myId = computed(() => (this.data.hasValue() ? this.data.value()?.me.id : null));
  private readonly today = localIsoDate(new Date());

  protected readonly polls = computed(() => this.events().filter((e) => e.status === 'polling'));
  protected readonly confirmed = computed(() =>
    this.events().filter((e) => e.status === 'confirmed'),
  );
  protected readonly upcoming = computed(() =>
    this.confirmed()
      .filter((e) => lastDay(e.confirmed!) >= this.today)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
  );
  protected readonly past = computed(() =>
    this.events()
      .filter(
        (e) =>
          e.status === 'cancelled' ||
          (e.status === 'confirmed' && lastDay(e.confirmed!) < this.today),
      )
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a))),
  );

  protected readonly when = (event: GroupEvent) => formatEventDate(event.confirmed!);
  protected readonly rsvpLabel = (rsvp: Rsvp) => RSVP_LABELS[rsvp];
  protected readonly voterCount = (event: GroupEvent) => Object.keys(event.votes).length;
  protected readonly hasVoted = (event: GroupEvent) => !!event.votes[this.myId() ?? ''];
  protected readonly invited = (event: GroupEvent) => isInvited(event, this.myId() ?? '');
  protected readonly joinable = (event: GroupEvent) => canJoin(event, this.myId() ?? '');
  protected readonly isOpen = (event: GroupEvent) => votingOpen(event);
  protected readonly deadline = (event: GroupEvent) => formatDeadline(event.voteBy!);
  protected readonly invitedCount = (event: GroupEvent, members: { id: string }[]) =>
    invitedMembers(event, members).length;
  protected readonly myRsvp = (event: GroupEvent) => event.rsvps[this.myId() ?? ''] ?? null;
  protected readonly goingCount = (event: GroupEvent) =>
    Object.values(event.rsvps).filter((r) => r === 'going').length;

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Events',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }
}

const sortKey = (event: GroupEvent) =>
  `${event.confirmed?.date ?? event.createdAt}${event.confirmed?.startTime ?? ''}`;
