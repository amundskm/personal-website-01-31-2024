/**
 * Group events domain logic, shared by the group-events Lambda (storage,
 * permissions, emails, reminders) and the /events pages.
 *
 * Event dates are local calendar dates and times in the event's time zone;
 * `zonedToUtc` turns them into instants for reminders and calendar files.
 */

export const DEFAULT_TIME_ZONE = 'America/Chicago';

/** All-day events are treated as starting at this local time for reminders. */
export const ALL_DAY_REFERENCE_TIME = '09:00';

/** Calendar files use this length when an event has a start time but no end. */
export const DEFAULT_DURATION_MINUTES = 180;

export type Vote = 'yes' | 'maybe' | 'no';
export type Rsvp = 'going' | 'maybe' | 'no';
export type EventStatus = 'polling' | 'confirmed' | 'cancelled';

/** A proposed (or the confirmed) date. Times are local `HH:MM`; none = all day. */
export interface EventDate {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface EventOption extends EventDate {
  id: string;
}

export interface Reminder {
  /** Minutes before the start. */
  offsetMinutes: number;
  /** ISO time it was sent, or "skipped" if it was already due when the date was set. */
  sentAt?: string | null;
}

export interface EventLocation {
  name: string;
  address?: string | null;
}

export interface GroupEvent {
  id: string;
  title: string;
  /** Plain text: what we're doing, what to bring, cost… */
  details: string;
  location: EventLocation | null;
  timeZone: string;
  status: EventStatus;
  createdBy: string;
  createdAt: string;
  options: EventOption[];
  /** By member id (Cognito sub), then option id. */
  votes: Record<string, Record<string, Vote>>;
  confirmed: EventDate | null;
  rsvps: Record<string, Rsvp>;
  reminders: Reminder[];
}

export interface Member {
  id: string;
  name: string;
}

/** What the events list receives. */
export interface EventsOverview {
  me: Member & { hasName: boolean; isAdmin: boolean };
  members: Member[];
  events: GroupEvent[];
}

/** What an event page receives. */
export interface EventDetail {
  me: Member & { hasName: boolean; isAdmin: boolean };
  members: Member[];
  event: GroupEvent;
}

/** Body of POST /events and PUT /events/{id}. */
export interface EventInput {
  title: string;
  details: string;
  location: EventLocation | null;
  /** One option and `confirmNow` = a fixed date, no poll. */
  options: EventDate[];
  confirmNow: boolean;
  reminderOffsets: number[];
}

/** Choices offered on the event form. */
export const REMINDER_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 14 * 24 * 60, label: '2 weeks before' },
  { minutes: 7 * 24 * 60, label: '1 week before' },
  { minutes: 3 * 24 * 60, label: '3 days before' },
  { minutes: 24 * 60, label: '1 day before' },
  { minutes: 3 * 60, label: '3 hours before' },
];

/** Reminders a new event starts with: one email a week before. */
export const DEFAULT_REMINDERS = [7 * 24 * 60];

export function reminderLabel(minutes: number): string {
  return (
    REMINDER_PRESETS.find((p) => p.minutes === minutes)?.label ??
    (minutes % (24 * 60) === 0
      ? `${minutes / (24 * 60)} days before`
      : `${Math.round(minutes / 60)} hours before`)
  );
}

/** Whether `memberId` may edit, confirm or cancel the event. */
export const canManage = (
  event: Pick<GroupEvent, 'createdBy'>,
  memberId: string,
  isAdmin: boolean,
) => isAdmin || event.createdBy === memberId;

/**
 * The UTC instant of a local date and time in `timeZone`
 * (e.g. 2030-06-01 18:00 in America/Chicago → 2030-06-01T23:00:00Z).
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Correct by the zone's offset at that moment; twice to settle DST transitions
  let instant = asUtc - offsetMs(asUtc, timeZone);
  instant = asUtc - offsetMs(instant, timeZone);
  return new Date(instant);
}

/** The zone's offset from UTC at `instant`, in milliseconds. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(instant / 1000) * 1000;
}

/** When reminders count back from: the start time, or 9 am for an all-day event. */
export function referenceStart(when: EventDate, timeZone: string): Date {
  return zonedToUtc(when.date, when.startTime || ALL_DAY_REFERENCE_TIME, timeZone);
}

/** Reminders whose time has come and that haven't been sent, for a confirmed upcoming event. */
export function dueReminders(event: GroupEvent, now: Date): number[] {
  if (event.status !== 'confirmed' || !event.confirmed) return [];
  const start = referenceStart(event.confirmed, event.timeZone).getTime();
  if (now.getTime() >= start) return [];
  return event.reminders.flatMap((reminder, index) =>
    !reminder.sentAt && start - reminder.offsetMinutes * 60_000 <= now.getTime() ? [index] : [],
  );
}

/**
 * Marks reminders that were already due when the date was set as skipped, so
 * confirming an event 2 days out doesn't fire its "1 week before" email.
 */
export function skipPastReminders(
  reminders: Reminder[],
  when: EventDate,
  timeZone: string,
  now: Date,
): Reminder[] {
  const start = referenceStart(when, timeZone).getTime();
  return reminders.map((r) =>
    !r.sentAt && start - r.offsetMinutes * 60_000 <= now.getTime()
      ? { ...r, sentAt: 'skipped' }
      : r,
  );
}

export interface OptionScore {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
  /** yes = 2, maybe = 1. */
  score: number;
}

/** Poll results per option, in the event's option order. */
export function scoreOptions(event: Pick<GroupEvent, 'options' | 'votes'>): OptionScore[] {
  return event.options.map((option) => {
    const counts = { yes: 0, maybe: 0, no: 0 };
    for (const answers of Object.values(event.votes)) {
      const vote = answers[option.id];
      if (vote) counts[vote]++;
    }
    return { optionId: option.id, ...counts, score: counts.yes * 2 + counts.maybe };
  });
}

/** The best-scoring option ids (several on a tie); none before anyone votes. */
export function bestOptionIds(event: Pick<GroupEvent, 'options' | 'votes'>): string[] {
  const scores = scoreOptions(event);
  const top = Math.max(0, ...scores.map((s) => s.score));
  return top === 0 ? [] : scores.filter((s) => s.score === top).map((s) => s.optionId);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks an event form submission. Returns an error message, or null if valid. */
export function validateEventInput(value: unknown): string | null {
  const input = value as Partial<EventInput> | null;
  if (!input || typeof input !== 'object') return 'Missing event';
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120)
    return 'Give the event a title (up to 120 characters).';
  if (typeof input.details !== 'string' || input.details.length > 5000)
    return 'Details must be under 5,000 characters.';
  if (
    input.location !== null &&
    (typeof input.location !== 'object' ||
      typeof input.location?.name !== 'string' ||
      input.location.name.length > 200 ||
      (input.location.address != null &&
        (typeof input.location.address !== 'string' || input.location.address.length > 300)))
  )
    return 'Invalid location';
  if (!Array.isArray(input.options) || !input.options.length || input.options.length > 20)
    return 'Add between 1 and 20 dates.';
  for (const option of input.options) {
    if (!option || !DATE.test(String(option.date))) return 'Every date needs a day.';
    for (const time of [option.startTime, option.endTime]) {
      if (time != null && time !== '' && !TIME.test(String(time))) return 'Times must be HH:MM.';
    }
    if (option.endTime && !option.startTime) return 'An end time needs a start time.';
  }
  if (typeof input.confirmNow !== 'boolean') return 'Invalid confirmNow';
  if (input.confirmNow && input.options.length !== 1) return 'A fixed date needs exactly one date.';
  if (
    !Array.isArray(input.reminderOffsets) ||
    input.reminderOffsets.length > 6 ||
    !input.reminderOffsets.every((m) => Number.isInteger(m) && m > 0 && m <= 60 * 24 * 60)
  )
    return 'Invalid reminders';
  return null;
}

/** `HH:MM` → "6:30 PM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Sat, Jun 1, 2030 · 6:00 PM – 9:00 PM", or "· All day". */
export function formatEventDate(when: EventDate): string {
  const day = new Date(`${when.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (!when.startTime) return `${day} · All day`;
  return `${day} · ${formatTime(when.startTime)}${when.endTime ? ` – ${formatTime(when.endTime)}` : ''}`;
}

/** A Google Maps search link for an address or place name. */
export const mapLink = (location: EventLocation) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address || location.name)}`;

/**
 * An iCalendar (.ics) file for a confirmed event, with an alarm per reminder,
 * so phones and calendar apps remind people too.
 */
export function eventIcs(event: GroupEvent, url: string, now = new Date()): string {
  const when = event.confirmed!;
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const dates: string[] = [];
  if (when.startTime) {
    const start = zonedToUtc(when.date, when.startTime, event.timeZone);
    let end = when.endTime
      ? zonedToUtc(when.date, when.endTime, event.timeZone)
      : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000); // ends after midnight
    dates.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
  } else {
    // All day: DTEND is the (exclusive) next day
    const [y, m, d] = when.date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    dates.push(
      `DTSTART;VALUE=DATE:${when.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`,
    );
  }
  const location = event.location
    ? [event.location.name, event.location.address].filter(Boolean).join(', ')
    : '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NEIA Boiz//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@neiaboiz.com`,
    `DTSTAMP:${stamp(now)}`,
    ...dates,
    `SUMMARY:${escapeIcs(event.title)}`,
    ...(location ? [`LOCATION:${escapeIcs(location)}`] : []),
    `DESCRIPTION:${escapeIcs([event.details, url].filter(Boolean).join('\n\n'))}`,
    `URL:${url}`,
    ...event.reminders.flatMap((r) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(event.title)}`,
      `TRIGGER:-PT${r.offsetMinutes}M`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines over 75 octets are folded with CRLF + space (RFC 5545). */
function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);
  return chunks.join('\r\n ');
}
