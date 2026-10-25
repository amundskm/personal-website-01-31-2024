/**
 * Member profiles: display name, photo and email preferences. Shared by the
 * group-events Lambda and the profile/unsubscribe pages.
 */

/** Which event emails a member wants. */
export interface EmailPrefs {
  /** Being invited to a new event or date poll (the key predates set-date invitations). */
  polls: boolean;
  /** An event you're invited to getting its date, changing, or being cancelled or restored. */
  updates: boolean;
  reminders: boolean;
  /** Comments and suggestions on events you organize. */
  organizer: boolean;
  /** Replies to your comments. */
  replies: boolean;
}

export const DEFAULT_PREFS: EmailPrefs = {
  polls: true,
  updates: true,
  reminders: true,
  organizer: true,
  replies: true,
};

export const NO_EMAILS: EmailPrefs = {
  polls: false,
  updates: false,
  reminders: false,
  organizer: false,
  replies: false,
};

export const PREF_LABELS: { key: keyof EmailPrefs; label: string; hint: string }[] = [
  {
    key: 'polls',
    label: 'New events and polls',
    hint: "When you're invited to a new event or date poll",
  },
  {
    key: 'updates',
    label: 'Event updates',
    hint: "When an event you're invited to gets its date, changes, or is cancelled or restored",
  },
  {
    key: 'reminders',
    label: 'Reminders',
    hint: "Before events, unless you said you can't make it",
  },
  {
    key: 'organizer',
    label: 'Activity on my events',
    hint: 'Being made a co-organizer, and comments, suggestions, closed polls and people joining events you organize',
  },
  { key: 'replies', label: 'Replies to my comments', hint: 'When someone replies to you' },
];

/** Every kind of event email, and the preference that controls it. */
export type NotificationKind =
  | 'poll'
  | 'invited'
  | 'confirmed'
  | 'updated'
  | 'cancelled'
  | 'restored'
  | 'reminder'
  | 'comment'
  | 'suggestion'
  | 'pollClosed'
  | 'joined'
  | 'coOrganizer'
  | 'reply';

export function prefFor(kind: NotificationKind): keyof EmailPrefs {
  switch (kind) {
    case 'poll':
    case 'invited':
      return 'polls';
    case 'confirmed':
    case 'updated':
    case 'cancelled':
    case 'restored':
      return 'updates';
    case 'reminder':
      return 'reminders';
    case 'comment':
    case 'suggestion':
    case 'pollClosed':
    case 'joined':
    case 'coOrganizer':
      return 'organizer';
    case 'reply':
      return 'replies';
  }
}

/** Fills in missing preferences (new ones default to on). */
export function normalizePrefs(value: unknown): EmailPrefs {
  const prefs = { ...DEFAULT_PREFS };
  if (value && typeof value === 'object') {
    for (const key of Object.keys(DEFAULT_PREFS) as (keyof EmailPrefs)[]) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === 'boolean') prefs[key] = v;
    }
  }
  return prefs;
}

export const wantsEmail = (prefs: EmailPrefs, kind: NotificationKind) => prefs[prefFor(kind)];

/** Body of PUT /events/profile; every field optional. */
export interface ProfileInput {
  name?: string;
  prefs?: EmailPrefs;
  /** Also text the notifications chosen in prefs; needs a phone number. */
  sms?: boolean;
  /** A US or Canadian number in any common format; '' removes it. */
  phone?: string;
}

/**
 * A US or Canadian phone number in E.164 form (+15155550123), or null if it
 * isn't one. Accepts "(515) 555-0123", "515.555.0123", "+1 515 555 0123", ….
 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  const match = /^(?:\+?1)?([2-9]\d{2}[2-9]\d{6})$/.exec(digits);
  return match ? `+1${match[1]}` : null;
}

/** +15155550123 → "(515) 555-0123". */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Shown under the texting checkbox: the opt-in wording carriers expect before texting someone. */
export const SMS_CONSENT =
  'NEIA Boiz will text you the notifications checked above. Message and data rates may apply. Reply STOP to stop or HELP for help.';

/** Profile photos: uploaded as a small square JPEG data URL. */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 150_000;

/** Initials for a name, e.g. "Mike O'Neil" → "MO". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}
