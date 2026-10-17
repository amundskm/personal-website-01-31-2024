/**
 * Group events domain logic, shared by the group-events Lambda (storage,
 * permissions, emails, reminders) and the /events pages.
 *
 * Event dates are local calendar dates and times in the event's time zone;
 * `zonedToUtc` turns them into instants for reminders and calendar files.
 */

import type { EventComment } from './comments';
import type { EmailPrefs } from './profile';

export const DEFAULT_TIME_ZONE = 'America/Chicago';

/** All-day events are treated as starting at this local time for reminders. */
export const ALL_DAY_REFERENCE_TIME = '09:00';

/** Calendar files use this length when an event has a start time but no end. */
export const DEFAULT_DURATION_MINUTES = 180;

export type Vote = 'yes' | 'maybe' | 'no';
export type Rsvp = 'going' | 'maybe' | 'no';
export type EventStatus = 'polling' | 'confirmed' | 'cancelled';

/** A proposed (or the confirmed) date. Times are local `HH:MM`; none = all day. */
/**
 * A proposed (or the confirmed) date: one day, or a range of days. Times are
 * local `HH:MM`; with a range, the start time is on the first day and the end
 * time on the last. No start time = all day.
 */
export interface EventDate {
  /** The (first) day. */
  date: string;
  /** The last day of a range; absent for a single day. */
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/** Longest allowed range, in days. */
export const MAX_RANGE_DAYS = 30;

/** The last day an event happens on. */
export const lastDay = (when: EventDate) => when.endDate || when.date;

/** Every day (`YYYY-MM-DD`) the event covers, first to last. */
export function daysOf(when: EventDate): string[] {
  const days: string[] = [];
  const [y, m, d] = when.date.split('-').map(Number);
  const last = lastDay(when);
  for (let i = 0; i <= MAX_RANGE_DAYS; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (day > last) break;
    days.push(day);
  }
  return days;
}

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

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
  /** What a cancelled event was before, so it can be restored. */
  cancelledFrom?: Exclude<EventStatus, 'cancelled'> | null;
  createdBy: string;
  createdAt: string;
  options: EventOption[];
  /** By member id (Cognito sub), then option id. */
  votes: Record<string, Record<string, Vote>>;
  confirmed: EventDate | null;
  rsvps: Record<string, Rsvp>;
  reminders: Reminder[];
  /** Invited member ids; null or missing = everyone in NEIA Boiz. The organizer is always invited. */
  invitees?: string[] | null;
  /** With invitees: hide the event from members who aren't invited. */
  inviteesOnly?: boolean;
  /** Polls only: when voting closes (local date and time). */
  voteBy?: VoteDeadline | null;
  /** When the organizer was told voting closed (so it's sent once). */
  voteClosedNotified?: string | null;
  /** Cover image shown on the event. */
  image?: Attachment | null;
  /** Up to MAX_FILES files to download. */
  attachments?: Attachment[];
}

/** A poll's voting deadline: a local date, and a time (end of day if none). */
export interface VoteDeadline {
  date: string;
  time?: string | null;
}

/** A deadline without a time closes at the end of that day. */
export const END_OF_DAY = '23:59';

export interface Member {
  id: string;
  name: string;
  /** Signed, short-lived link to their photo. */
  avatarUrl?: string | null;
  /** The INVITE_GROUPS they're in. */
  groups?: string[];
}

/**
 * Subgroups the event form can invite in one click. Each is a Cognito group
 * (see ROLES); people in them must also be in `neia-boiz` to use events.
 */
export const INVITE_GROUPS = [
  { id: 'da-boiz', label: 'Da Boiz' },
  { id: 'da-girls', label: 'Da Girls' },
] as const;

/** The signed-in member, as the API describes them. */
export interface MeInfo extends Member {
  hasName: boolean;
  isAdmin: boolean;
}

/** GET/PUT /events/profile. */
export interface ProfileInfo extends MeInfo {
  email: string;
  prefs: EmailPrefs;
  /** Signs this member's calendar subscription URL. */
  calendarToken: string;
}

/** What the events list receives. */
export interface EventsOverview {
  me: MeInfo;
  members: Member[];
  events: GroupEvent[];
}

/** What an event page receives. */
export interface EventDetail {
  me: MeInfo;
  members: Member[];
  event: GroupEvent;
  comments: EventComment[];
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
  /** Null = everyone; otherwise the member ids to invite. */
  invitees: string[] | null;
  /** With invitees: only they (plus the organizer and admins) can see it. */
  inviteesOnly: boolean;
  /** Polls: when voting closes; null for no deadline. */
  voteBy: VoteDeadline | null;
}

/** Most people a single event can invite individually. */
export const MAX_INVITEES = 200;

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
/** When voting closes, as an instant; null if the poll has no deadline. */
export function voteDeadline(event: Pick<GroupEvent, 'voteBy' | 'timeZone'>): Date | null {
  return event.voteBy
    ? zonedToUtc(event.voteBy.date, event.voteBy.time || END_OF_DAY, event.timeZone)
    : null;
}

/** Whether people can still vote: a poll whose deadline (if any) hasn't passed. */
export function votingOpen(
  event: Pick<GroupEvent, 'status' | 'voteBy' | 'timeZone'>,
  now = new Date(),
): boolean {
  const deadline = voteDeadline(event);
  return event.status === 'polling' && (!deadline || now < deadline);
}

/** A poll whose deadline has passed and whose organizer hasn't been told yet. */
export function pollJustClosed(event: GroupEvent, now = new Date()): boolean {
  const deadline = voteDeadline(event);
  return event.status === 'polling' && !!deadline && now >= deadline && !event.voteClosedNotified;
}

/** "Fri, Jul 2, 5:00 PM" (or "…, 11:59 PM" at the end of the day). */
export function formatDeadline(voteBy: VoteDeadline): string {
  const day = new Date(`${voteBy.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${day}, ${formatTime(voteBy.time || END_OF_DAY)}`;
}

/** Whether the event is for everyone, or a chosen list. */
export const isForEveryone = (event: Pick<GroupEvent, 'invitees'>) => !event.invitees;

/** Whether `memberId` is invited: everyone is, unless there's a list (the organizer always is). */
export function isInvited(
  event: Pick<GroupEvent, 'invitees' | 'createdBy'>,
  memberId: string,
): boolean {
  return !event.invitees || event.createdBy === memberId || event.invitees.includes(memberId);
}

/**
 * Whether `memberId` can add themselves: a visible event with an invite list
 * that they aren't on yet (and that isn't cancelled).
 */
export function canJoin(
  event: Pick<GroupEvent, 'invitees' | 'inviteesOnly' | 'createdBy' | 'status'>,
  memberId: string,
): boolean {
  return (
    !!event.invitees &&
    !event.inviteesOnly &&
    event.status !== 'cancelled' &&
    !isInvited(event, memberId)
  );
}

/** Whether `memberId` can take themselves off the invite list (never the organizer). */
export function canLeave(
  event: Pick<GroupEvent, 'invitees' | 'createdBy' | 'status'>,
  memberId: string,
): boolean {
  return (
    !!event.invitees &&
    event.status !== 'cancelled' &&
    event.createdBy !== memberId &&
    event.invitees.includes(memberId)
  );
}

/** Whether `memberId` can see the event at all. */
export function canSee(
  event: Pick<GroupEvent, 'invitees' | 'inviteesOnly' | 'createdBy'>,
  memberId: string,
  isAdmin: boolean,
): boolean {
  return isAdmin || !event.inviteesOnly || isInvited(event, memberId);
}

/** The members who are invited, in the given order. */
export function invitedMembers<T extends { id: string }>(
  event: Pick<GroupEvent, 'invitees' | 'createdBy'>,
  members: T[],
): T[] {
  return members.filter((m) => isInvited(event, m.id));
}

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
    if (option.endDate != null && option.endDate !== '') {
      if (!DATE.test(String(option.endDate))) return 'Invalid end date';
      if (option.endDate <= option.date) return 'An end date must be after its start date.';
      if (dayCount(option.date, option.endDate) > MAX_RANGE_DAYS)
        return `Date ranges can be up to ${MAX_RANGE_DAYS} days.`;
    }
    for (const time of [option.startTime, option.endTime]) {
      if (time != null && time !== '' && !TIME.test(String(time))) return 'Times must be HH:MM.';
    }
    if (option.endTime && !option.startTime) return 'An end time needs a start time.';
  }
  if (input.invitees !== null) {
    if (
      !Array.isArray(input.invitees) ||
      input.invitees.length > MAX_INVITEES ||
      !input.invitees.every((id) => typeof id === 'string' && id.length <= 100)
    )
      return 'Invalid invitees';
    if (!input.invitees.length) return 'Pick at least one person to invite, or invite everyone.';
  }
  if (typeof input.inviteesOnly !== 'boolean') return 'Invalid visibility';
  if (input.voteBy !== null && input.voteBy !== undefined) {
    if (typeof input.voteBy !== 'object' || !DATE.test(String(input.voteBy.date)))
      return 'Pick a day for voting to close.';
    if (input.voteBy.time && !TIME.test(String(input.voteBy.time))) return 'Times must be HH:MM.';
    if (input.confirmNow) return "A set date doesn't need a voting deadline.";
    const firstDate = [...input.options].map((o) => o.date).sort()[0];
    if (firstDate && input.voteBy.date > firstDate)
      return 'Voting should close before the first proposed date.';
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
  const format = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  if (when.endDate) {
    // "Fri, Jul 12, 4:00 PM – Sun, Jul 14, 2030, 11:00 AM", or "… · All days"
    const sameYear = when.date.slice(0, 4) === when.endDate.slice(0, 4);
    const first = format(when.date, !sameYear);
    const last = format(when.endDate, true);
    if (!when.startTime) return `${first} – ${last} · All days`;
    return (
      `${first}, ${formatTime(when.startTime)} – ${last}` +
      (when.endTime ? `, ${formatTime(when.endTime)}` : '')
    );
  }
  const day = format(when.date, true);
  if (!when.startTime) return `${day} · All day`;
  return `${day} · ${formatTime(when.startTime)}${when.endTime ? ` – ${formatTime(when.endTime)}` : ''}`;
}

/** A compact label: "Sat, Jun 1" or "Jul 12 – 14" / "Jun 30 – Jul 2". */
export function shortDateLabel(when: EventDate): string {
  const md = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', opts);
  if (!when.endDate) return md(when.date, { weekday: 'short', month: 'short', day: 'numeric' });
  const sameMonth = when.date.slice(0, 7) === when.endDate.slice(0, 7);
  return `${md(when.date, { month: 'short', day: 'numeric' })} – ${md(
    when.endDate,
    sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
  )}`;
}

/** A Google Maps search link for an address or place name. */
export const mapLink = (location: EventLocation) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address || location.name)}`;

/**
 * An iCalendar (.ics) file for a confirmed event, with an alarm per reminder,
 * so phones and calendar apps remind people too.
 */
/** UTC `YYYYMMDDTHHMMSSZ`, as calendar files and Google links use. */
const icsStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/**
 * When a confirmed event starts and ends: instants for timed events, or
 * whole days (end exclusive) for all-day ones.
 */
function eventSpan(
  when: EventDate,
  timeZone: string,
): { allDay: false; start: Date; end: Date } | { allDay: true; start: string; end: string } {
  if (when.startTime) {
    const start = zonedToUtc(when.date, when.startTime, timeZone);
    let end: Date;
    if (when.endDate) {
      // A range runs to the end time on its last day (or the end of that day)
      end = zonedToUtc(when.endDate, when.endTime || '23:59', timeZone);
    } else {
      end = when.endTime
        ? zonedToUtc(when.date, when.endTime, timeZone)
        : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
      if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000); // ends after midnight
    }
    return { allDay: false, start, end };
  }
  const [y, m, d] = lastDay(when).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { allDay: true, start: when.date.replace(/-/g, ''), end: next.replace(/-/g, '') };
}

const locationText = (event: GroupEvent) =>
  event.location ? [event.location.name, event.location.address].filter(Boolean).join(', ') : '';

/** One VEVENT for a confirmed (or cancelled) event, with an alarm per reminder. */
function vevent(event: GroupEvent, url: string, now: Date): string[] {
  const span = eventSpan(event.confirmed!, event.timeZone);
  const location = locationText(event);
  return [
    'BEGIN:VEVENT',
    `UID:${event.id}@neiaboiz.com`,
    `DTSTAMP:${icsStamp(now)}`,
    ...(span.allDay
      ? [`DTSTART;VALUE=DATE:${span.start}`, `DTEND;VALUE=DATE:${span.end}`]
      : [`DTSTART:${icsStamp(span.start)}`, `DTEND:${icsStamp(span.end)}`]),
    `SUMMARY:${escapeIcs(event.title)}`,
    ...(location ? [`LOCATION:${escapeIcs(location)}`] : []),
    `DESCRIPTION:${escapeIcs([event.details, url].filter(Boolean).join('\n\n'))}`,
    `URL:${url}`,
    `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...event.reminders.flatMap((r) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(event.title)}`,
      `TRIGGER:-PT${r.offsetMinutes}M`,
      'END:VALARM',
    ]),
    'END:VEVENT',
  ];
}

function calendar(lines: string[], extra: string[] = []): string {
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NEIA Boiz//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...extra,
      ...lines,
      'END:VCALENDAR',
    ]
      .map(foldIcsLine)
      .join('\r\n') + '\r\n'
  );
}

/**
 * An iCalendar (.ics) file for a confirmed event, with an alarm per reminder,
 * so phones and calendar apps remind people too.
 */
export function eventIcs(event: GroupEvent, url: string, now = new Date()): string {
  return calendar(vevent(event, url, now));
}

/**
 * The subscribable NEIA Boiz calendar: every confirmed event, plus cancelled
 * ones marked CANCELLED so subscribed calendars drop them. Polls are left out.
 */
export function calendarFeedIcs(events: GroupEvent[], siteUrl: string, now = new Date()): string {
  const lines = events
    .filter((e) => e.confirmed && (e.status === 'confirmed' || e.status === 'cancelled'))
    .flatMap((e) => vevent(e, `${siteUrl}/events/${e.id}`, now));
  return calendar(lines, [
    'X-WR-CALNAME:NEIA Boiz',
    'X-WR-CALDESC:Events from neiaboiz.com',
    `X-WR-TIMEZONE:${DEFAULT_TIME_ZONE}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]);
}

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(event: GroupEvent, url: string): string {
  const span = eventSpan(event.confirmed!, event.timeZone);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: span.allDay
      ? `${span.start}/${span.end}`
      : `${icsStamp(span.start)}/${icsStamp(span.end)}`,
    details: [event.details, url].filter(Boolean).join('\n\n'),
    ...(event.location ? { location: locationText(event) } : {}),
    ctz: event.timeZone,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
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

/** The status a cancelled event goes back to: what it was, else confirmed if it has a date. */
export function restoredStatus(
  event: Pick<GroupEvent, 'cancelledFrom' | 'confirmed'>,
): Exclude<EventStatus, 'cancelled'> {
  return event.cancelledFrom ?? (event.confirmed ? 'confirmed' : 'polling');
}

// ---------------------------------------------------------------------------
// Attachments: one cover image and up to 5 files per event
// ---------------------------------------------------------------------------

export interface Attachment {
  id: string;
  /** Shown and used for the download name. */
  name: string;
  /** Bytes. */
  size: number;
  /** MIME type. */
  type: string;
  uploadedAt: string;
  /** Storage key; the API adds a signed `url` when sending it out. */
  key?: string;
  url?: string;
}

export type AttachmentKind = 'image' | 'file';

/** POST /events/{id}/attachments: ask for an upload link. */
export interface UploadRequest {
  kind: AttachmentKind;
  name: string;
  size: number;
  type: string;
}

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Cover images are resized in the browser first, so they're small. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** A file name safe for storage keys and downloads: no paths, odd characters or huge lengths. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!cleaned) return 'file';
  if (cleaned.length <= 100) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, 100 - ext.length) + ext;
}

/** Checks an upload request. Returns an error message, or null if valid. */
export function validateUploadRequest(value: unknown, fileCount: number): string | null {
  const input = value as Partial<UploadRequest> | null;
  if (!input || typeof input !== 'object') return 'Missing upload';
  if (input.kind !== 'image' && input.kind !== 'file') return 'Invalid upload type';
  if (typeof input.name !== 'string' || !input.name.trim()) return 'The file needs a name.';
  if (typeof input.type !== 'string' || input.type.length > 200) return 'Invalid file type';
  if (!Number.isInteger(input.size) || input.size! <= 0) return 'That file is empty.';
  if (input.kind === 'image') {
    if (!IMAGE_TYPES.includes(input.type)) return 'Use a JPEG, PNG or WebP image.';
    if (input.size! > MAX_IMAGE_BYTES) return 'That image is too large.';
  } else {
    if (fileCount >= MAX_FILES) return `An event can have up to ${MAX_FILES} files.`;
    if (input.size! > MAX_FILE_BYTES) return 'Files can be up to 10 MB.';
  }
  return null;
}

/** "512 KB", "3.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
