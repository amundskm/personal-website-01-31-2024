import {
  formatBytes,
  safeFileName,
  validateUploadRequest,
  formatDeadline,
  pollJustClosed,
  voteDeadline,
  votingOpen,
  calendarFeedIcs,
  daysOf,
  googleCalendarUrl,
  lastDay,
  shortDateLabel,
  bestOptionIds,
  canInviteGroup,
  canJoin,
  canLeave,
  canManage,
  canSee,
  invitedMembers,
  isInvited,
  matchingGroup,
  dueReminders,
  eventIcs,
  formatEventDate,
  restoredStatus,
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
    invitees: null,
    inviteesOnly: false,
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
    expect(validateEventInput({ ...valid, invitees: [] })).toMatch(/at least one/);
    expect(validateEventInput({ ...valid, invitees: [5] })).toMatch(/invitees/);
    expect(validateEventInput({ ...valid, invitees: ['bob'], inviteesOnly: 'yes' })).toMatch(
      /visibility/,
    );
    expect(validateEventInput({ ...valid, invitees: ['bob'], inviteesOnly: true })).toBeNull();
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

describe('restoredStatus', () => {
  it('goes back to what the event was, else confirmed if it has a date', () => {
    expect(restoredStatus({ cancelledFrom: 'polling', confirmed: null })).toBe('polling');
    expect(restoredStatus({ cancelledFrom: 'confirmed', confirmed: { date: '2030-06-01' } })).toBe(
      'confirmed',
    );
    expect(restoredStatus({ confirmed: { date: '2030-06-01' } })).toBe('confirmed');
    expect(restoredStatus({ confirmed: null })).toBe('polling');
  });
});

describe('date ranges', () => {
  const weekend = { date: '2030-07-12', endDate: '2030-07-14' };

  it('knows every day a range covers', () => {
    expect(daysOf(weekend)).toEqual(['2030-07-12', '2030-07-13', '2030-07-14']);
    expect(daysOf({ date: '2030-12-31', endDate: '2031-01-01' })).toEqual([
      '2030-12-31',
      '2031-01-01',
    ]);
    expect(daysOf({ date: '2030-07-12' })).toEqual(['2030-07-12']);
    expect(lastDay(weekend)).toBe('2030-07-14');
  });

  it('formats ranges, all day or with times on the first and last day', () => {
    expect(formatEventDate(weekend)).toBe('Fri, Jul 12 – Sun, Jul 14, 2030 · All days');
    expect(formatEventDate({ ...weekend, startTime: '16:00', endTime: '11:00' })).toBe(
      'Fri, Jul 12, 4:00 PM – Sun, Jul 14, 2030, 11:00 AM',
    );
    expect(formatEventDate({ date: '2030-12-30', endDate: '2031-01-02' })).toBe(
      'Mon, Dec 30, 2030 – Thu, Jan 2, 2031 · All days',
    );
    expect(shortDateLabel(weekend)).toBe('Jul 12 – 14');
    expect(shortDateLabel({ date: '2030-06-30', endDate: '2030-07-02' })).toBe('Jun 30 – Jul 2');
    expect(shortDateLabel({ date: '2030-06-01' })).toBe('Sat, Jun 1');
  });

  it('validates ranges', () => {
    const input = (endDate: string) => ({
      title: 'Trip',
      details: '',
      location: null,
      options: [{ date: '2030-07-12', endDate }],
      confirmNow: true,
      reminderOffsets: [],
      invitees: null,
      inviteesOnly: false,
    });
    expect(validateEventInput(input('2030-07-14'))).toBeNull();
    expect(validateEventInput(input('2030-07-12'))).toMatch(/after/);
    expect(validateEventInput(input('2030-07-10'))).toMatch(/after/);
    expect(validateEventInput(input('2030-08-20'))).toMatch(/30 days/);
    expect(validateEventInput(input('bad'))).toMatch(/end date/);
  });

  it('writes calendar files spanning the range', () => {
    const now = new Date('2030-05-01T12:00:00Z');
    const allDay = eventIcs(event({ confirmed: weekend }), 'https://example.com', now);
    expect(allDay).toContain('DTSTART;VALUE=DATE:20300712');
    expect(allDay).toContain('DTEND;VALUE=DATE:20300715');
    const timed = eventIcs(
      event({ confirmed: { ...weekend, startTime: '16:00', endTime: '11:00' } }),
      'https://example.com',
      now,
    );
    expect(timed).toContain('DTSTART:20300712T210000Z');
    expect(timed).toContain('DTEND:20300714T160000Z');
  });
});

describe('calendar links', () => {
  it('builds a Google Calendar link for timed and all-day events', () => {
    const timed = new URL(googleCalendarUrl(event(), 'https://example.com/events/evt1'));
    expect(timed.origin + timed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(timed.searchParams.get('action')).toBe('TEMPLATE');
    expect(timed.searchParams.get('text')).toBe('Lake weekend');
    expect(timed.searchParams.get('dates')).toBe('20300601T230000Z/20300602T020000Z');
    expect(timed.searchParams.get('location')).toBe('The cabin, 1 Example Rd, Anytown');
    expect(timed.searchParams.get('details')).toContain('https://example.com/events/evt1');

    const allDay = new URL(
      googleCalendarUrl(event({ confirmed: { date: '2030-07-12', endDate: '2030-07-14' } }), 'x'),
    );
    expect(allDay.searchParams.get('dates')).toBe('20300712/20300715');
  });

  it('builds a subscription feed of confirmed and cancelled events, without polls', () => {
    const now = new Date('2030-05-01T12:00:00Z');
    const feed = calendarFeedIcs(
      [
        event({ id: 'on' }),
        event({ id: 'off', status: 'cancelled' }),
        event({ id: 'poll', status: 'polling', confirmed: null }),
      ],
      'https://example.com',
      now,
    ).replace(/\r\n /g, '');
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(feed).toContain('UID:on@neiaboiz.com');
    expect(feed).toContain('UID:off@neiaboiz.com');
    expect(feed).not.toContain('UID:poll@');
    expect(feed).toContain('STATUS:CANCELLED');
    expect(feed).toContain('X-WR-CALNAME:NEIA Boiz');
    expect(feed).toContain('URL:https://example.com/events/on');
  });
});

describe('invitations', () => {
  const members = [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }];

  it('invites everyone when there is no list', () => {
    const open = event({ invitees: null });
    expect(isInvited(open, 'carol')).toBe(true);
    expect(invitedMembers(open, members)).toEqual(members);
  });

  it('invites only the list plus the organizer', () => {
    const picked = event({ invitees: ['bob'] }); // created by alice
    expect(isInvited(picked, 'alice')).toBe(true);
    expect(isInvited(picked, 'bob')).toBe(true);
    expect(isInvited(picked, 'carol')).toBe(false);
    expect(invitedMembers(picked, members).map((m) => m.id)).toEqual(['alice', 'bob']);
  });

  it('hides invite-only events from everyone else except admins', () => {
    const hidden = event({ invitees: ['bob'], inviteesOnly: true });
    expect(canSee(hidden, 'bob', false)).toBe(true);
    expect(canSee(hidden, 'carol', false)).toBe(false);
    expect(canSee(hidden, 'carol', true)).toBe(true);
    expect(canSee({ ...hidden, inviteesOnly: false }, 'carol', false)).toBe(true);
  });
});

describe('voting deadlines', () => {
  const poll = event({
    status: 'polling',
    confirmed: null,
    options: [{ id: 'a', date: '2030-06-20' }],
    voteBy: { date: '2030-06-10', time: '17:00' },
  });

  it('turns the local deadline into an instant (end of day without a time)', () => {
    expect(voteDeadline(poll)!.toISOString()).toBe('2030-06-10T22:00:00.000Z');
    expect(voteDeadline({ ...poll, voteBy: { date: '2030-06-10' } })!.toISOString()).toBe(
      '2030-06-11T04:59:00.000Z',
    );
    expect(voteDeadline({ ...poll, voteBy: null })).toBeNull();
    expect(formatDeadline({ date: '2030-06-10', time: '17:00' })).toBe('Mon, Jun 10, 5:00 PM');
    expect(formatDeadline({ date: '2030-06-10' })).toBe('Mon, Jun 10, 11:59 PM');
  });

  it('keeps voting open until the deadline, and always without one', () => {
    expect(votingOpen(poll, new Date('2030-06-10T21:59:00Z'))).toBe(true);
    expect(votingOpen(poll, new Date('2030-06-10T22:00:00Z'))).toBe(false);
    expect(votingOpen({ ...poll, voteBy: null }, new Date('2031-01-01T00:00:00Z'))).toBe(true);
    expect(votingOpen({ ...poll, status: 'confirmed' }, new Date('2030-06-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('flags a poll to report once its deadline passes', () => {
    const after = new Date('2030-06-11T00:00:00Z');
    expect(pollJustClosed(poll, new Date('2030-06-09T00:00:00Z'))).toBe(false);
    expect(pollJustClosed(poll, after)).toBe(true);
    expect(pollJustClosed({ ...poll, voteClosedNotified: '2030-06-10T22:15:00Z' }, after)).toBe(
      false,
    );
    expect(pollJustClosed({ ...poll, voteBy: null }, after)).toBe(false);
  });

  it('validates deadlines', () => {
    const input = {
      title: 'Trip',
      details: '',
      location: null,
      options: [{ date: '2030-06-20' }, { date: '2030-06-27' }],
      confirmNow: false,
      reminderOffsets: [],
      invitees: null,
      inviteesOnly: false,
    };
    expect(validateEventInput({ ...input, voteBy: null })).toBeNull();
    expect(validateEventInput({ ...input, voteBy: { date: '2030-06-15' } })).toBeNull();
    expect(validateEventInput({ ...input, voteBy: { date: '2030-06-21' } })).toMatch(
      /before the first/,
    );
    expect(validateEventInput({ ...input, voteBy: { date: 'x' } })).toMatch(/day for voting/);
    expect(
      validateEventInput({
        ...input,
        confirmNow: true,
        options: [input.options[0]],
        voteBy: { date: '2030-06-15' },
      }),
    ).toMatch(/set date/);
  });
});

describe('attachments', () => {
  it('makes file names safe for storage and downloads', () => {
    expect(safeFileName('Lake map.pdf')).toBe('Lake map.pdf');
    expect(safeFileName('C:\\Users\\me\\..\\plan.docx')).toBe('plan.docx');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('menu<script>.pdf')).toBe('menu_script_.pdf');
    expect(safeFileName('.hidden')).toBe('hidden');
    expect(safeFileName('   ')).toBe('file');
    const long = safeFileName('x'.repeat(300) + '.pdf');
    expect(long.length).toBe(100);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('checks uploads against type, size and the file limit', () => {
    const file = { kind: 'file', name: 'map.pdf', size: 1000, type: 'application/pdf' };
    expect(validateUploadRequest(file, 0)).toBeNull();
    expect(validateUploadRequest(file, 5)).toMatch(/up to 5/);
    expect(validateUploadRequest({ ...file, size: 11 * 1024 * 1024 }, 0)).toMatch(/10 MB/);
    expect(validateUploadRequest({ ...file, size: 0 }, 0)).toMatch(/empty/);
    const image = { kind: 'image', name: 'cover.jpg', size: 500_000, type: 'image/jpeg' };
    expect(validateUploadRequest(image, 5)).toBeNull(); // the cover image doesn't count
    expect(validateUploadRequest({ ...image, type: 'image/gif' }, 0)).toMatch(/JPEG/);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });
});

describe('joining and leaving', () => {
  const listed = event({ invitees: ['bob'], inviteesOnly: false }); // created by alice

  it('lets members join a visible event with a list, but not a hidden or open-to-all one', () => {
    expect(canJoin(listed, 'carol')).toBe(true);
    expect(canJoin(listed, 'bob')).toBe(false); // already in
    expect(canJoin(listed, 'alice')).toBe(false); // the organizer
    expect(canJoin({ ...listed, inviteesOnly: true }, 'carol')).toBe(false);
    expect(canJoin({ ...listed, invitees: null }, 'carol')).toBe(false);
    expect(canJoin({ ...listed, status: 'cancelled' }, 'carol')).toBe(false);
  });

  it('lets invitees leave, but never the organizer', () => {
    expect(canLeave(listed, 'bob')).toBe(true);
    expect(canLeave(listed, 'alice')).toBe(false);
    expect(canLeave(listed, 'carol')).toBe(false);
    expect(canLeave({ ...listed, invitees: null }, 'bob')).toBe(false);
  });
});

describe('invite groups', () => {
  const members = [
    { id: 'me', groups: ['da-boiz'] },
    { id: 'bob', groups: ['da-boiz'] },
    { id: 'sue', groups: ['da-girls'] },
    { id: 'ann', groups: ['da-girls'] },
  ];

  it('finds the group an invite list is exactly, ignoring the organizer', () => {
    expect(matchingGroup(['bob'], 'me', members)).toBe('da-boiz');
    expect(matchingGroup(['me', 'bob'], 'me', members)).toBe('da-boiz');
    expect(matchingGroup(['sue', 'ann'], 'me', members)).toBe('da-girls');
    expect(matchingGroup(['sue'], 'me', members)).toBeNull();
    expect(matchingGroup(['bob', 'sue'], 'me', members)).toBeNull();
    expect(matchingGroup(null, 'me', members)).toBeNull();
  });

  it('lets only a group’s members (and admins) invite it', () => {
    expect(canInviteGroup(['neia-boiz', 'da-boiz'], false, 'da-boiz')).toBe(true);
    expect(canInviteGroup(['neia-boiz', 'da-boiz'], false, 'da-girls')).toBe(false);
    expect(canInviteGroup(['admin'], true, 'da-girls')).toBe(true);
  });
});
