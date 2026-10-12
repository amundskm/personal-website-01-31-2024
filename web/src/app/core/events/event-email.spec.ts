import { displayUrl, renderEmail } from '../../../../amplify/shared/email-layout';
import { commentEmail, eventEmail, memberJoinedEmail, pollClosedEmail } from './event-email';
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

describe('restored and comment emails', () => {
  const links = {
    preferences: 'https://neiaboiz.com/profile',
    unsubscribe: 'https://neiaboiz.com/unsubscribe?m=x&t=y',
  };

  it('announces a restored event, with per-recipient links and an unsubscribe header URL', () => {
    const email = eventEmail('restored', event, url, { links });
    expect(email.subject).toBe('Back on: Lake <weekend> (Sat, Jun 1)');
    expect(email.text).toContain('Lake <weekend> is back on. Here are the details.');
    expect(email.text).toContain('Unsubscribe: https://neiaboiz.com/unsubscribe?m=x&t=y');
    expect(email.html).toContain('Email preferences');
    expect(email.unsubscribeUrl).toBe(links.unsubscribe);
  });

  it('reopens a restored poll with its dates', () => {
    const email = eventEmail('restored', { ...event, status: 'polling', confirmed: null }, url);
    expect(email.text).toContain('the date poll is open again');
    expect(email.text).toContain('Date 2: Sat, Jun 8, 2030 · 6:00 PM');
  });

  it('quotes a comment for the organizer and a reply for the parent author', () => {
    const suggestion = commentEmail(
      'suggestion',
      event,
      { body: 'Start at 7?' },
      'Bob',
      url,
      links,
    );
    expect(suggestion.subject).toBe('Bob suggested a change to Lake <weekend>');
    expect(suggestion.text).toContain('Start at 7?');
    expect(suggestion.text).toContain('because you organize this event');

    const reply = commentEmail('reply', event, { body: 'Agreed' }, 'Carol', url);
    expect(reply.subject).toBe('Carol replied to your comment on Lake <weekend>');
    expect(reply.text).toContain('because you commented on this event');
    expect(reply.unsubscribeUrl).toBeUndefined();
  });
});

describe('links to the site', () => {
  it('shows the events page address under the button in every event and comment email', () => {
    for (const email of [
      eventEmail('poll', { ...event, status: 'polling', confirmed: null }, url),
      eventEmail('reminder', event, url, { reminderOffset: 10080 }),
      commentEmail('reply', event, { body: 'Hi' }, 'Bob', url),
    ]) {
      expect(email.text).toContain('All NEIA Boiz events: https://neiaboiz.com/events');
      expect(email.html).toContain('href="https://neiaboiz.com/events"');
      expect(email.html).toContain('>neiaboiz.com/events</a>');
    }
  });

  it('displays addresses without the scheme', () => {
    expect(displayUrl('https://neiaboiz.com/login')).toBe('neiaboiz.com/login');
    expect(displayUrl('https://neiaboiz.com/')).toBe('neiaboiz.com');
  });
});

describe('poll emails with a deadline', () => {
  it('shows the vote-by time in the poll email', () => {
    const email = eventEmail(
      'poll',
      {
        ...event,
        status: 'polling',
        confirmed: null,
        voteBy: { date: '2030-05-25', time: '17:00' },
      },
      url,
    );
    expect(email.text).toContain('Vote by: Sat, May 25, 5:00 PM');
  });

  it('sends the organizer the results, best date first', () => {
    const email = pollClosedEmail(
      event,
      [
        { label: 'Sat, Jun 1', yes: 1, maybe: 0, no: 2, best: false },
        { label: 'Sat, Jun 8', yes: 3, maybe: 1, no: 0, best: true },
      ],
      4,
      5,
      ['Zed'],
      url,
    );
    expect(email.subject).toBe('Voting closed: Lake <weekend>');
    expect(email.text).toContain('4 of 5 invited people voted. Sat, Jun 8 works best.');
    expect(email.text.indexOf('Sat, Jun 8: 3 yes')).toBeLessThan(
      email.text.indexOf('Sat, Jun 1: 1 yes'),
    );
    expect(email.text).toContain("Didn't vote: Zed");
    expect(email.text).toContain('Pick the date: https://neiaboiz.com/events/evt1');
  });
});

describe('memberJoinedEmail', () => {
  it('tells the organizer who joined', () => {
    const email = memberJoinedEmail(event, 'Carol', 4, url);
    expect(email.subject).toBe('Carol joined Lake <weekend>');
    expect(email.text).toContain('Carol added themselves to your event. 4 people are invited now.');
    expect(email.text).toContain('See the event: https://neiaboiz.com/events/evt1');
  });
});
