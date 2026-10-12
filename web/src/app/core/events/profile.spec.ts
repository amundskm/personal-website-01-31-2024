import { DEFAULT_PREFS, initials, NO_EMAILS, normalizePrefs, prefFor, wantsEmail } from './profile';

describe('email preferences', () => {
  it('maps each email to its preference', () => {
    expect(prefFor('poll')).toBe('polls');
    expect(prefFor('cancelled')).toBe('updates');
    expect(prefFor('restored')).toBe('updates');
    expect(prefFor('reminder')).toBe('reminders');
    expect(prefFor('suggestion')).toBe('organizer');
    expect(prefFor('reply')).toBe('replies');
  });

  it('defaults to everything on, filling in missing or bad values', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ reminders: false, polls: 'no' })).toEqual({
      ...DEFAULT_PREFS,
      reminders: false,
    });
  });

  it('respects an unsubscribe', () => {
    expect(wantsEmail(NO_EMAILS, 'reminder')).toBe(false);
    expect(wantsEmail({ ...NO_EMAILS, replies: true }, 'reply')).toBe(true);
  });
});

describe('initials', () => {
  it('uses the first and last names', () => {
    expect(initials('Mike')).toBe('M');
    expect(initials("mike o'neil")).toBe('MO');
    expect(initials('  ')).toBe('?');
  });
});
