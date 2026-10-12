/**
 * Member profiles: display name, photo and email preferences. Shared by the
 * group-events Lambda and the profile/unsubscribe pages.
 */

/** Which event emails a member wants. */
export interface EmailPrefs {
  /** A new date poll. */
  polls: boolean;
  /** An event confirmed, changed or cancelled. */
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
  { key: 'polls', label: 'New date polls', hint: 'When someone starts planning an event' },
  { key: 'updates', label: 'Event updates', hint: 'Confirmed, changed, cancelled or restored' },
  {
    key: 'reminders',
    label: 'Reminders',
    hint: "Before events, unless you said you can't make it",
  },
  {
    key: 'organizer',
    label: 'Activity on my events',
    hint: 'Comments and suggestions on events you organize',
  },
  { key: 'replies', label: 'Replies to my comments', hint: 'When someone replies to you' },
];

/** Every kind of event email, and the preference that controls it. */
export type NotificationKind =
  | 'poll'
  | 'confirmed'
  | 'updated'
  | 'cancelled'
  | 'restored'
  | 'reminder'
  | 'comment'
  | 'suggestion'
  | 'reply';

export function prefFor(kind: NotificationKind): keyof EmailPrefs {
  switch (kind) {
    case 'poll':
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
}

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
