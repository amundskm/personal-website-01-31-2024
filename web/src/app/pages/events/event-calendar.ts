import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatTime, type GroupEvent } from '../../core/events/events';

interface Day {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  events: GroupEvent[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A month grid of confirmed events, starting at the current month. */
@Component({
  selector: 'app-event-calendar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal-header">
      <button type="button" class="btn btn--text" (click)="shift(-1)" aria-label="Previous month">
        ‹
      </button>
      <h3 aria-live="polite">{{ title() }}</h3>
      <button type="button" class="btn btn--text" (click)="shift(1)" aria-label="Next month">
        ›
      </button>
    </div>
    <table class="cal">
      <thead>
        <tr>
          @for (name of weekdays; track name) {
            <th scope="col">{{ name }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (week of weeks(); track week[0].date) {
          <tr>
            @for (day of week; track day.date) {
              <td [class.is-out]="!day.inMonth" [class.is-today]="day.isToday">
                <span class="cal-day">{{ day.day }}</span>
                @for (event of day.events; track event.id) {
                  <a class="cal-event" [routerLink]="['/events', event.id]">
                    @if (event.confirmed?.startTime) {
                      <span class="cal-time">{{ time(event.confirmed!.startTime!) }}</span>
                    }
                    {{ event.title }}
                  </a>
                }
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
    }
    .cal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3);
    }
    .cal-header h3 {
      margin: 0;
      font-size: var(--text-lg);
    }
    .cal-header .btn {
      font-size: var(--text-2xl);
      padding: 0 var(--space-3);
    }
    .cal {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    th {
      padding: var(--space-1);
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-muted);
    }
    td {
      height: 5.5rem;
      padding: var(--space-1);
      vertical-align: top;
      border: 1px solid var(--color-border);
    }
    .is-out {
      opacity: 0.45;
    }
    .is-today .cal-day {
      background: var(--color-accent);
      color: var(--color-accent-contrast);
    }
    .cal-day {
      display: inline-grid;
      place-items: center;
      min-width: 1.6rem;
      height: 1.6rem;
      border-radius: var(--radius-full);
      font-size: var(--text-sm);
    }
    .cal-event {
      display: block;
      margin-top: 2px;
      padding: 1px var(--space-1);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.8rem;
      color: var(--color-accent-contrast);
      background: var(--color-arcane);
      border-radius: var(--radius-sm);
      text-decoration: none;
    }
    .cal-event:hover {
      background: var(--color-arcane-hover);
    }
    .cal-time {
      font-weight: 700;
    }
  `,
})
export class EventCalendar {
  /** Confirmed events to show. */
  readonly events = input.required<GroupEvent[]>();

  protected readonly weekdays = WEEKDAYS;
  private readonly today = localIsoDate(new Date());
  /** First day of the shown month. */
  private readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  protected readonly title = computed(() =>
    this.month().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );

  protected readonly weeks = computed<Day[][]>(() => {
    const first = this.month();
    const byDate = new Map<string, GroupEvent[]>();
    for (const event of this.events()) {
      if (!event.confirmed) continue;
      const list = byDate.get(event.confirmed.date) ?? [];
      list.push(event);
      byDate.set(event.confirmed.date, list);
    }
    for (const list of byDate.values()) {
      list.sort((a, b) =>
        (a.confirmed?.startTime ?? '').localeCompare(b.confirmed?.startTime ?? ''),
      );
    }

    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back to Sunday
    const weeks: Day[][] = [];
    const cursor = new Date(start);
    do {
      const week: Day[] = [];
      for (let i = 0; i < 7; i++) {
        const date = localIsoDate(cursor);
        week.push({
          date,
          day: cursor.getDate(),
          inMonth: cursor.getMonth() === first.getMonth(),
          isToday: date === this.today,
          events: byDate.get(date) ?? [],
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    } while (cursor.getMonth() === first.getMonth());
    return weeks;
  });

  protected readonly time = formatTime;

  protected shift(months: number): void {
    this.month.update((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));
  }
}

/** `YYYY-MM-DD` in the browser's local time. */
export function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
