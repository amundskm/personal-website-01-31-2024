import {
  formatDeadline,
  formatEventDate,
  type GroupEvent,
  isForEveryone,
  shortDateLabel,
} from './events';

/** Site gold, as Discord's embed color. */
const EMBED_COLOR = 0xe0ad4c;

/** A Discord webhook message body. */
export interface DiscordMessage {
  username: string;
  content: string;
  embeds: {
    title: string;
    url: string;
    description: string;
    color: number;
    footer: { text: string };
  }[];
  /** No pings: titles can't @everyone the server. */
  allowed_mentions: { parse: [] };
}

/**
 * New polls and new set-date events for everyone in NEIA Boiz are posted;
 * events for specific people (visible or hidden) never are.
 */
export const postsToDiscord = (event: Pick<GroupEvent, 'status' | 'invitees'>) =>
  (event.status === 'polling' || event.status === 'confirmed') && isForEveryone(event);

/** Whether a URL is a Discord webhook (so a bad secret can't send data elsewhere). */
export const isDiscordWebhook = (url: string) =>
  /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(
    url,
  );

/**
 * The message for a new poll or event: title, dates (and a poll's deadline)
 * and a link. Location and details stay on the site; the link needs a login.
 */
export function discordMessage(event: GroupEvent, by: string, url: string): DiscordMessage {
  const poll = event.status === 'polling';
  const lines = poll
    ? [
        `**Dates:** ${event.options.map((o) => shortDateLabel(o)).join(' · ')}`,
        ...(event.voteBy ? [`**Vote by:** ${formatDeadline(event.voteBy)}`] : []),
      ]
    : [`**When:** ${formatEventDate(event.confirmed!)}`];
  lines.push('', `[${poll ? 'Vote on neiaboiz.com' : 'See it on neiaboiz.com'}](${url})`);
  return {
    username: 'NEIA Boiz',
    content: poll
      ? `🗳️ ${escapeMarkdown(by)} started a poll`
      : `📅 ${escapeMarkdown(by)} planned an event`,
    embeds: [
      {
        title: event.title.slice(0, 256),
        url,
        description: lines.join('\n'),
        color: EMBED_COLOR,
        footer: { text: 'neiaboiz.com · log in to see more' },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

/** Keeps names like "*Mike*" from turning into Discord formatting. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>[\]()])/g, '\\$1');
}

/** How a post went. Anything but 'sent' is logged; none of them throw. */
export type DiscordResult = 'sent' | 'skipped' | 'gone' | 'rate-limited' | 'failed';

/**
 * Posts a message to a Discord webhook without ever throwing, so a deleted
 * channel, a changed webhook or a Discord outage can't break creating events.
 */
export async function sendToDiscord(
  webhook: string | undefined,
  message: DiscordMessage,
  options: { fetch?: typeof fetch; timeoutMs?: number; log?: (text: string) => void } = {},
): Promise<DiscordResult> {
  const log = options.log ?? ((text: string) => console.warn(text));
  const url = webhook?.trim() ?? '';
  if (!isDiscordWebhook(url)) {
    log(
      'Discord: DISCORD_WEBHOOK_URL is missing or not a Discord webhook URL, so nothing was posted.',
    );
    return 'skipped';
  }
  try {
    const response = await (options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
    if (response.ok) return 'sent';
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      log(
        `Discord: the webhook no longer exists (HTTP ${response.status}); the channel or webhook ` +
          'was probably deleted. Update the DISCORD_WEBHOOK_URL secret and redeploy.',
      );
      return 'gone';
    }
    if (response.status === 429) {
      log('Discord: rate limited (HTTP 429), so this post was skipped.');
      return 'rate-limited';
    }
    log(`Discord: post failed (HTTP ${response.status}).`);
    return 'failed';
  } catch (error) {
    log(
      `Discord: could not reach Discord (${(error as Error)?.name ?? 'error'}), so this post was skipped.`,
    );
    return 'failed';
  }
}
