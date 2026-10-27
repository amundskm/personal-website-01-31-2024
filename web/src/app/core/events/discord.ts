import { renderEmail } from '../../../../amplify/shared/email-layout';
import type { Email } from './event-email';
import {
  formatDeadline,
  formatEventDate,
  type GroupEvent,
  isForEveryone,
  type Member,
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

/** The one invite group whose events also go to the Discord channel. */
export const DISCORD_GROUP = 'da-boiz';

/**
 * New polls and new set-date events for everyone in NEIA Boiz (no invite list,
 * or a list of every member), or for exactly Da Boiz, are posted; events for
 * any other group or list (visible or hidden) never are.
 *
 * `members` is everyone in neia-boiz, each with the invite groups they're in.
 */
export function postsToDiscord(
  event: Pick<GroupEvent, 'status' | 'invitees' | 'createdBy'>,
  members: Pick<Member, 'id' | 'groups'>[],
): boolean {
  if (event.status !== 'polling' && event.status !== 'confirmed') return false;
  if (isForEveryone(event)) return true;
  const isExactly = (ids: string[]) => isExactList(event.invitees!, event.createdBy, ids);
  return (
    isExactly(members.map((m) => m.id)) ||
    isExactly(members.filter((m) => m.groups?.includes(DISCORD_GROUP)).map((m) => m.id))
  );
}

/** Whether an invite list is exactly these people, ignoring the (always invited) organizer. */
function isExactList(invitees: readonly string[], organizerId: string, ids: string[]): boolean {
  const invited = new Set(invitees.filter((id) => id !== organizerId));
  const expected = new Set(ids.filter((id) => id !== organizerId));
  return (
    expected.size > 0 &&
    expected.size === invited.size &&
    [...expected].every((id) => invited.has(id))
  );
}

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

/** What went wrong, and what to do about it, for each way a post can fail. */
const FAILURES: Record<Exclude<DiscordResult, 'sent'>, { problem: string; fix: string }> = {
  skipped: {
    problem:
      "No Discord webhook is set for this branch: its DISCORD_WEBHOOK_URL secret is missing or isn't a Discord webhook address.",
    fix: "Set the branch's own DISCORD_WEBHOOK_URL secret in Amplify (Hosting, Secrets), then redeploy the branch.",
  },
  gone: {
    problem:
      'Discord says the webhook no longer exists: its channel or the webhook itself was probably deleted.',
    fix: "Create a new webhook in the Discord channel, put it in the branch's DISCORD_WEBHOOK_URL secret, then redeploy.",
  },
  'rate-limited': {
    problem: 'Discord rate-limited the post.',
    fix: 'Nothing to change; if it keeps happening, post less often.',
  },
  failed: {
    problem: "Discord couldn't be reached or returned an error.",
    fix: 'Check that Discord is up. The event itself was created.',
  },
};

/**
 * The email admins get when an event couldn't be posted to Discord. There is
 * no fallback channel, so a failure is reported instead of posted elsewhere.
 */
export function discordFailureEmail(
  result: Exclude<DiscordResult, 'sent'>,
  event: { title: string },
  eventUrl: string,
  branch: string,
): Email {
  const { problem, fix } = FAILURES[result];
  const subject = `Discord post failed: ${event.title}`;
  const where = `on the ${branch} branch`;
  return {
    subject,
    text: [
      `"${event.title}" was created ${where}, but it wasn't posted to Discord.`,
      '',
      problem,
      fix,
      '',
      eventUrl,
    ].join('\n'),
    html: renderEmail({
      eyebrow: 'Discord',
      heading: 'A Discord post failed',
      preheader: `"${event.title}" wasn't posted to Discord`,
      paragraphs: [
        `"${event.title}" was created ${where}, but it wasn't posted to Discord.`,
        problem,
        fix,
      ],
      button: { href: eventUrl, text: 'Open the event' },
      footer: "You're getting this because you're an admin of neiaboiz.com.",
    }),
  };
}
