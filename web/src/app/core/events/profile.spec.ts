import {
  DEFAULT_PREFS,
  formatPhone,
  initials,
  NO_EMAILS,
  normalizePhone,
  normalizePrefs,
  prefFor,
  wantsEmail,
} from './profile';

describe('email preferences', () => {
  it('maps each email to its preference', () => {
    expect(prefFor('poll')).toBe('polls');
    expect(prefFor('invited')).toBe('polls');
    expect(prefFor('confirmed')).toBe('updates');
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

describe('phone numbers', () => {
  it('accepts US and Canadian numbers in common formats', () => {
    expect(normalizePhone('(515) 555-0123')).toBe('+15155550123');
    expect(normalizePhone('515.555.0123')).toBe('+15155550123');
    expect(normalizePhone('+1 515 555 0123')).toBe('+15155550123');
    expect(normalizePhone('15155550123')).toBe('+15155550123');
  });

  it('rejects anything else', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('555-0123')).toBeNull();
    expect(normalizePhone('+44 20 7946 0958')).toBeNull();
    // Area codes and exchanges can't start with 0 or 1
    expect(normalizePhone('015-555-0123')).toBeNull();
    expect(normalizePhone('515-155-0123')).toBeNull();
  });

  it('formats a stored number for display', () => {
    expect(formatPhone('+15155550123')).toBe('(515) 555-0123');
  });
});
