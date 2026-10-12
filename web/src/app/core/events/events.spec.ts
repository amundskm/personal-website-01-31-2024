import {
  bestOptionIds,
  canManage,
  dueReminders,
  eventIcs,
  formatEventDate,
  type GroupEvent,
  scoreOptions,
  skipPastReminders,
  validateEventInput,
  zonedToUtc,
} from './events';

// Made-up events only: the repository is public.
const event = (overrides: Partial<GroupEvent> = {}): GroupEvent => ({
  id: 'evt1',
  title: 'Lake weekend',
  details: 'Bring a chair, $20 for food',
  location: { name: 'The cabin', address: '1 Example Rd, Anytown' },
  timeZone: 'America/Chicago',
  status: 'confirmed',
  createdBy: 'alice',
  createdAt: '2030-05-01T00:00:00Z',
  options: [],
  votes: {},
  confirmed: { date: '2030-06-01', startTime: '18:00', endTime: '21:00' },
  rsvps: {},
  reminders: [{ offsetMinutes: 7 * 24 * 60 }, { offsetMinutes: 24 * 60 }],
  ...overrides,
});

describe('zonedToUtc', () => {
  it('converts local Central time, across daylight saving', () => {
    expect(zonedToUtc('2030-06-01', '18:00', 'America/Chicago').toISOString()).toBe(
      '2030-06-01T23:00:00.000Z', // CDT, UTC-5
    );
    expect(zonedToUtc('2030-01-15', '18:00', 'America/Chicago').toISOString()).toBe(
      '2030-01-16T00:00:00.000Z', // CST, UTC-6
    );
  });
});

describe('dueReminders', () => {
  it('returns unsent reminders whose time has come, before the event', () => {
    const e = event();
    expect(dueReminders(e, new Date('2030-05-20T00:00:00Z'))).toEqual([]);
    expect(dueReminders(e, new Date('2030-05-26T00:00:00Z'))).toEqual([0]);
    expect(dueReminders(e, new Date('2030-06-01T00:00:00Z'))).toEqual([0, 1]);
    expect(
      dueReminders(
        event({
          reminders: [{ offsetMinutes: 7 * 24 * 60, sentAt: 'x' }, { offsetMinutes: 24 * 60 }],
        }),
        new Date('2030-06-01T00:00:00Z'),
      ),
    ).toEqual([1]);
  });

  it('sends nothing for polls, cancelled or past events', () => {
    const late = new Date('2030-06-01T00:00:00Z');
    expect(dueReminders(event({ status: 'polling' }), late)).toEqual([]);
    expect(dueReminders(event({ status: 'cancelled' }), late)).toEqual([]);
    expect(dueReminders(event(), new Date('2030-06-02T00:00:00Z'))).toEqual([]);
  });

  it('times all-day events from 9 am local', () => {
    const allDay = event({
      confirmed: { date: '2030-06-01' },
      reminders: [{ offsetMinutes: 24 * 60 }],
    });
    // 9 am CDT on May 31 = 14:00 UTC
    expect(dueReminders(allDay, new Date('2030-05-31T13:59:00Z'))).toEqual([]);
    expect(dueReminders(allDay, new Date('2030-05-31T14:00:00Z'))).toEqual([0]);
  });
});

describe('skipPastReminders', () => {
  it('skips reminders that were already due when the date was set', () => {
    const e = event();
    expect(
      skipPastReminders(e.reminders, e.confirmed!, e.timeZone, new Date('2030-05-29T00:00:00Z')),
    ).toEqual([{ offsetMinutes: 7 * 24 * 60, sentAt: 'skipped' }, { offsetMinutes: 24 * 60 }]);
  });
});

describe('poll scoring', () => {
  const poll = event({
    status: 'polling',
    confirmed: null,
    options: [
      { id: 'a', date: '2030-06-01' },
      { id: 'b', date: '2030-06-08' },
      { id: 'c', date: '2030-06-15' },
    ],
    votes: {
      alice: { a: 'yes', b: 'maybe', c: 'no' },
      bob: { a: 'maybe', b: 'yes' },
      carol: { a: 'no', b: 'yes', c: 'yes' },
    },
  });

  it('counts votes per option (yes = 2, maybe = 1)', () => {
    expect(scoreOptions(poll)).toEqual([
      { optionId: 'a', yes: 1, maybe: 1, no: 1, score: 3 },
      { optionId: 'b', yes: 2, maybe: 1, no: 0, score: 5 },
      { optionId: 'c', yes: 1, maybe: 0, no: 1, score: 2 },
    ]);
  });

  it('picks the best option, all of them on a tie, none before voting', () => {
    expect(bestOptionIds(poll)).toEqual(['b']);
    expect(bestOptionIds({ ...poll, votes: { x: { a: 'yes', c: 'yes' } } })).toEqual(['a', 'c']);
    expect(bestOptionIds({ ...poll, votes: {} })).toEqual([]);
  });
});

describe('canManage', () => {
  it('lets the creator and admins manage an event', () => {
    expect(canManage(event(), 'alice', false)).toBe(true);
    expect(canManage(event(), 'bob', false)).toBe(false);
    expect(canManage(event(), 'bob', true)).toBe(true);
  });
});

describe('validateEventInput', () => {
  const valid = {
    title: 'Lake weekend',
    details: '',
    location: null,
    options: [{ date: '2030-06-01', startTime: '18:00', endTime: null }],
    confirmNow: true,
    reminderOffsets: [1440],
  };

  it('accepts a valid event', () => {
    expect(validateEventInput(valid)).toBeNull();
    expect(
      validateEventInput({
        ...valid,
        confirmNow: false,
        options: [{ date: '2030-06-01' }, { date: '2030-06-08' }],
      }),
    ).toBeNull();
  });

  it('rejects bad input', () => {
    expect(validateEventInput({ ...valid, title: ' ' })).toMatch(/title/);
    expect(validateEventInput({ ...valid, options: [] })).toMatch(/dates/);
    expect(
      validateEventInput({ ...valid, options: [{ date: '2030-06-01', startTime: '25:00' }] }),
    ).toMatch(/HH:MM/);
    expect(
      validateEventInput({ ...valid, options: [{ date: '2030-06-01', endTime: '20:00' }] }),
    ).toMatch(/start time/);
    expect(validateEventInput({ ...valid, options: [{ date: 'a' }, { date: 'b' }] })).toMatch(
      /day/,
    );
    expect(
      validateEventInput({ ...valid, options: [{ date: '2030-06-01' }, { date: '2030-06-08' }] }),
    ).toMatch(/exactly one/);
    expect(validateEventInput({ ...valid, reminderOffsets: [-5] })).toMatch(/reminders/);
  });
});

describe('formatEventDate', () => {
  it('formats timed and all-day dates', () => {
    expect(formatEventDate({ date: '2030-06-01', startTime: '18:00', endTime: '21:30' })).toBe(
      'Sat, Jun 1, 2030 · 6:00 PM – 9:30 PM',
    );
    expect(formatEventDate({ date: '2030-06-01' })).toBe('Sat, Jun 1, 2030 · All day');
  });
});

describe('eventIcs', () => {
  const now = new Date('2030-05-01T12:00:00Z');

  it('builds a calendar file with UTC times and an alarm per reminder', () => {
    const ics = eventIcs(event(), 'https://example.com/events/evt1', now);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DTSTART:20300601T230000Z');
    expect(unfolded).toContain('DTEND:20300602T020000Z');
    expect(unfolded).toContain('LOCATION:The cabin\\, 1 Example Rd\\, Anytown');
    expect(unfolded).toContain(
      'DESCRIPTION:Bring a chair\\, $20 for food\\n\\nhttps://example.com/events/evt1',
    );
    expect(unfolded.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(unfolded).toContain('TRIGGER:-PT10080M');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
  });

  it('uses whole days for all-day events', () => {
    const ics = eventIcs(event({ confirmed: { date: '2030-12-31' } }), 'https://example.com', now);
    expect(ics).toContain('DTSTART;VALUE=DATE:20301231');
    expect(ics).toContain('DTEND;VALUE=DATE:20310101');
  });
});
