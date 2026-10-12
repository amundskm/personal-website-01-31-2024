import { renderEmail } from '../../../../amplify/shared/email-layout';
import { eventEmail } from './event-email';
import type { GroupEvent } from './events';

// Made-up event only: the repository is public.
const event: GroupEvent = {
  id: 'evt1',
  title: 'Lake <weekend>',
  details: 'Bring a chair',
  location: { name: 'The cabin', address: '1 Example Rd' },
  timeZone: 'America/Chicago',
  status: 'confirmed',
  createdBy: 'alice',
  createdAt: '2030-05-01T00:00:00Z',
  options: [
    { id: 'a', date: '2030-06-01' },
    { id: 'b', date: '2030-06-08', startTime: '18:00' },
  ],
  votes: {},
  confirmed: { date: '2030-06-01', startTime: '18:00' },
  rsvps: {},
  reminders: [{ offsetMinutes: 10080 }],
};
const url = 'https://neiaboiz.com/events/evt1';

describe('eventEmail', () => {
  it('lists every proposed date in a poll email', () => {
    const email = eventEmail('poll', { ...event, status: 'polling', confirmed: null }, url, {
      by: 'Bob',
    });
    expect(email.subject).toBe('Vote on a date: Lake <weekend>');
    expect(email.text).toContain('Bob wants to plan this.');
    expect(email.text).toContain('Date 1: Sat, Jun 1, 2030 · All day');
    expect(email.text).toContain('Date 2: Sat, Jun 8, 2030 · 6:00 PM');
    expect(email.html).toContain('Vote on dates');
  });

  it('says how far away the event is in a reminder', () => {
    const email = eventEmail('reminder', event, url, { reminderOffset: 10080 });
    expect(email.subject).toBe('Reminder: Lake <weekend> (Sat, Jun 1)');
    expect(email.text).toContain("It's 1 week away. See you there!");
    expect(email.text).toContain('When: Sat, Jun 1, 2030 · 6:00 PM');
    expect(email.text).toContain('Where: The cabin, 1 Example Rd');
  });

  it('links a cancellation to the events list, without the details', () => {
    const email = eventEmail('cancelled', { ...event, status: 'cancelled' }, url);
    expect(email.text).not.toContain('Bring a chair');
    expect(email.text).toContain('See all events: https://neiaboiz.com/events\n');
  });

  it('escapes event text in the HTML and brands it as neiaboiz.com', () => {
    const email = eventEmail('confirmed', event, url);
    expect(email.html).toContain('Lake &lt;weekend&gt;');
    expect(email.html).not.toContain('Lake <weekend>');
    expect(email.html).toContain('NEIA BOIZ');
    expect(email.html).toContain('neiaboiz.com');
    expect(email.text.startsWith('NEIA BOIZ · neiaboiz.com')).toBe(true);
  });
});

describe('renderEmail', () => {
  it('keeps Cognito placeholders intact for the invitation', () => {
    const html = renderEmail({
      eyebrow: 'Invite',
      heading: 'Welcome',
      preheader: 'x',
      details: [
        { label: 'Email', value: '{username}' },
        { label: 'Password', value: '{####}' },
      ],
      footer: 'f',
    });
    expect(html).toContain('{username}');
    expect(html).toContain('{####}');
    expect(html.length).toBeLessThan(20_000); // Cognito's invitation limit
  });
});
