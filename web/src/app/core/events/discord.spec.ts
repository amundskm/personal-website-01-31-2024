import { discordMessage, isDiscordWebhook, postsToDiscord } from './discord';
import type { GroupEvent } from './events';

// Made-up event only: the repository is public.
const poll: GroupEvent = {
  id: 'evt1',
  title: 'Lake weekend',
  details: 'Secret cabin code 1234',
  location: { name: 'The cabin', address: '1 Example Rd' },
  timeZone: 'America/Chicago',
  status: 'polling',
  createdBy: 'me',
  createdAt: '2030-01-01T00:00:00Z',
  options: [
    { id: 'a', date: '2030-07-12', endDate: '2030-07-14' },
    { id: 'b', date: '2030-07-20', startTime: '18:00' },
  ],
  votes: {},
  confirmed: null,
  rsvps: {},
  reminders: [],
  voteBy: { date: '2030-07-01', time: '17:00' },
};
const url = 'https://neiaboiz.com/events/evt1';

describe('Discord posts', () => {
  it('posts new polls and set-date events for everyone, never ones for specific people', () => {
    expect(postsToDiscord(poll)).toBe(true);
    expect(postsToDiscord({ ...poll, status: 'confirmed' })).toBe(true);
    expect(postsToDiscord({ ...poll, invitees: ['bob'] })).toBe(false);
    expect(postsToDiscord({ ...poll, status: 'cancelled' })).toBe(false);
  });

  it('shows a poll\u2019s title, dates, deadline and link, but not its location or details', () => {
    const message = discordMessage(poll, 'Mike', url);
    const [embed] = message.embeds;
    expect(message.content).toBe('🗳️ Mike started a poll');
    expect(embed.title).toBe('Lake weekend');
    expect(embed.url).toBe(url);
    expect(embed.description).toContain('**Dates:** Jul 12 – 14 · Sat, Jul 20');
    expect(embed.description).toContain('**Vote by:** Mon, Jul 1, 5:00 PM');
    expect(embed.description).toContain(`[Vote on neiaboiz.com](${url})`);
    expect(JSON.stringify(message)).not.toContain('cabin');
    expect(JSON.stringify(message)).not.toContain('1234');
  });

  it('shows a set-date event with its date', () => {
    const message = discordMessage(
      {
        ...poll,
        status: 'confirmed',
        confirmed: { date: '2030-07-20', startTime: '18:00' },
        voteBy: null,
      },
      'Mike',
      url,
    );
    expect(message.content).toBe('📅 Mike planned an event');
    expect(message.embeds[0].description).toContain('**When:** Sat, Jul 20, 2030 · 6:00 PM');
    expect(message.embeds[0].description).toContain(`[See it on neiaboiz.com](${url})`);
  });

  it("can't ping anyone or be formatted by a name", () => {
    const message = discordMessage({ ...poll, title: '@everyone party' }, '*Mike*', url);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.content).toBe(String.raw`🗳️ \*Mike\* started a poll`);
  });

  it('only accepts real Discord webhook URLs', () => {
    expect(isDiscordWebhook('https://discord.com/api/webhooks/123/abc-DEF_9')).toBe(true);
    expect(isDiscordWebhook('https://discordapp.com/api/webhooks/123/abc')).toBe(true);
    expect(isDiscordWebhook('https://evil.example/api/webhooks/123/abc')).toBe(false);
    expect(isDiscordWebhook('http://discord.com/api/webhooks/123/abc')).toBe(false);
  });
});
