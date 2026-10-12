import { discordMessage, isDiscordWebhook, postsToDiscord, sendToDiscord } from './discord';
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

describe('sendToDiscord fails gracefully', () => {
  const webhook = 'https://discord.com/api/webhooks/123/abc';
  const message = discordMessage(poll, 'Mike', url);
  const run = async (fetchImpl: typeof fetch, hook = webhook) => {
    const logs: string[] = [];
    const result = await sendToDiscord(hook, message, {
      fetch: fetchImpl,
      timeoutMs: 50,
      log: (text) => logs.push(text),
    });
    return { result, logs };
  };
  const respond = (status: number) =>
    (() => Promise.resolve(new Response(null, { status }))) as typeof fetch;

  it('posts normally', async () => {
    expect((await run(respond(204))).result).toBe('sent');
  });

  it('says the webhook is gone when the channel or webhook was deleted', async () => {
    const { result, logs } = await run(respond(404));
    expect(result).toBe('gone');
    expect(logs[0]).toContain('Update the DISCORD_WEBHOOK_URL secret');
    expect((await run(respond(401))).result).toBe('gone');
  });

  it('skips when rate limited or Discord errors', async () => {
    expect((await run(respond(429))).result).toBe('rate-limited');
    expect((await run(respond(500))).result).toBe('failed');
  });

  it('never throws on network errors or timeouts', async () => {
    const offline = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    expect((await run(offline)).result).toBe('failed');
    const hangs = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
      )) as typeof fetch;
    expect((await run(hangs)).result).toBe('failed');
  });

  it('skips without a valid webhook URL', async () => {
    let called = false;
    const spy = (() => {
      called = true;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    expect((await run(spy, '')).result).toBe('skipped');
    expect((await run(spy, 'https://evil.example/hook')).result).toBe('skipped');
    expect(called).toBe(false);
  });
});
