import { type EmailDetail, renderEmail, SITE_URL } from '../../../../amplify/shared/email-layout';
import {
  type EventDate,
  formatDeadline,
  formatEventDate,
  type GroupEvent,
  mapLink,
  reminderLabel,
  shortDateLabel,
} from './events';

export type EmailKind = 'poll' | 'confirmed' | 'updated' | 'cancelled' | 'restored' | 'reminder';

export interface Email {
  subject: string;
  text: string;
  html: string;
  /** One-click unsubscribe URL for the List-Unsubscribe header. */
  unsubscribeUrl?: string;
}

/** Per-recipient links in the footer of every event email. */
export interface RecipientLinks {
  preferences: string;
  unsubscribe: string;
}

function footerLinks(links?: RecipientLinks) {
  return links
    ? [
        { href: links.preferences, text: 'Email preferences' },
        { href: links.unsubscribe, text: 'Unsubscribe' },
      ]
    : undefined;
}

function footerText(footer: string, links?: RecipientLinks): string[] {
  return links
    ? [footer, `Email preferences: ${links.preferences}`, `Unsubscribe: ${links.unsubscribe}`]
    : [footer];
}

const FOOTER = "You're getting this because you're in NEIA Boiz on neiaboiz.com.";

/** Every event email also links to the site's events page. */
const EVENTS_LINK = { label: 'All NEIA Boiz events:', href: `${SITE_URL}/events` };

/** A role someone was just given on an event, which their email announces. */
export type EventRole = 'coOrganizer' | 'organizer';

/**
 * The email sent to members about an event, in the site's style. With a
 * `role`, a 'poll' or 'confirmed' email instead tells them they were made the
 * co-organizer, or were handed the event as its organizer.
 */
export function eventEmail(
  kind: EmailKind,
  event: GroupEvent,
  url: string,
  extra: {
    by?: string;
    reminderOffset?: number;
    links?: RecipientLinks;
    role?: EventRole;
  } = {},
): Email {
  const when = event.confirmed;
  const away = reminderLabel(extra.reminderOffset ?? 0).replace(' before', ' away');
  const where = event.location
    ? [event.location.name, event.location.address].filter(Boolean).join(', ')
    : null;

  const copy: Record<
    EmailKind,
    { subject: string; eyebrow: string; intro: string; button: string }
  > = {
    poll: {
      subject: `Vote on a date: ${event.title}`,
      eyebrow: 'Date poll',
      intro: `${extra.by ?? 'Someone'} wants to plan this. Mark which dates work for you, it only takes a few seconds.`,
      button: 'Vote on dates',
    },
    confirmed: {
      subject: `It's on: ${event.title}${when ? ` (${shortDate(when)})` : ''}`,
      eyebrow: "It's on",
      intro: "The date is set. Let everyone know if you're coming.",
      button: 'RSVP & add to calendar',
    },
    updated: {
      subject: `Updated: ${event.title}`,
      eyebrow: 'Plans changed',
      intro: 'The date or time changed. Here are the latest details.',
      button: 'See the details',
    },
    restored: {
      subject: `Back on: ${event.title}${when && event.status === 'confirmed' ? ` (${shortDate(when)})` : ''}`,
      eyebrow: "It's back on",
      intro:
        event.status === 'polling'
          ? `${event.title} is back on, and the date poll is open again.`
          : `${event.title} is back on. Here are the details.`,
      button: event.status === 'polling' ? 'Vote on dates' : 'RSVP & add to calendar',
    },
    cancelled: {
      subject: `Cancelled: ${event.title}`,
      eyebrow: 'Cancelled',
      intro: `${event.title} has been cancelled.`,
      button: 'See all events',
    },
    reminder: {
      subject: `Reminder: ${event.title}${when ? ` (${shortDate(when)})` : ''}`,
      eyebrow: `Reminder · ${away}`,
      intro: `It's ${away}. See you there!`,
      button: 'Details & RSVP',
    },
  };
  const by = extra.by ?? 'Someone';
  const canDo = `edit or cancel the event${kind === 'poll' ? ', pick the date when voting is done,' : ''} and you'll get the organizer's emails about it`;
  const roleCopy: Record<EventRole, typeof copy.poll & { footer: string }> = {
    coOrganizer: {
      subject: `You're a co-organizer: ${event.title}`,
      eyebrow: 'Co-organizer',
      intro: `${by} made you the co-organizer. You can ${canDo}.`,
      button: kind === 'poll' ? 'See the poll' : 'See the event',
      footer:
        "You're getting this because you were made the co-organizer of this event on neiaboiz.com.",
    },
    organizer: {
      subject: `You're the organizer now: ${event.title}`,
      eyebrow: 'Handed to you',
      intro: `${by} handed this event to you, so you're the organizer now. You can ${canDo}.`,
      button: kind === 'poll' ? 'See the poll' : 'See the event',
      footer: "You're getting this because you were handed this event on neiaboiz.com.",
    },
  };
  const role = kind === 'poll' || kind === 'confirmed' ? extra.role : undefined;
  const c = role ? roleCopy[role] : copy[kind];
  const footer = role ? roleCopy[role].footer : FOOTER;
  const buttonUrl = kind === 'cancelled' ? `${SITE_URL}/events` : url;

  const details: EmailDetail[] = [];
  if (kind === 'poll' || (kind === 'restored' && event.status === 'polling')) {
    event.options.forEach((option, i) =>
      details.push({ label: `Date ${i + 1}`, value: formatEventDate(option) }),
    );
    if (event.voteBy) details.push({ label: 'Vote by', value: formatDeadline(event.voteBy) });
  } else if (when && kind !== 'cancelled') {
    details.push({ label: 'When', value: formatEventDate(when) });
  }
  if (where && kind !== 'cancelled') {
    details.push({
      label: 'Where',
      value: where,
      link: { href: mapLink(event.location!), text: 'Open in Maps' },
    });
  }
  const note = kind === 'cancelled' ? '' : event.details.trim();

  const html = renderEmail({
    eyebrow: c.eyebrow,
    heading: event.title,
    preheader: c.intro,
    paragraphs: [c.intro],
    details,
    note: note || undefined,
    button: { href: buttonUrl, text: c.button },
    siteLink: EVENTS_LINK,
    footer,
    footerLinks: footerLinks(extra.links),
  });

  const text = [
    `NEIA BOIZ · neiaboiz.com`,
    '',
    c.eyebrow.toUpperCase(),
    event.title,
    '',
    c.intro,
    '',
    ...details.map((d) => `${d.label}: ${d.value}`),
    ...(where && kind !== 'cancelled' ? [`Map: ${mapLink(event.location!)}`] : []),
    ...(note ? ['', note] : []),
    '',
    `${c.button}: ${buttonUrl}`,
    `${EVENTS_LINK.label} ${EVENTS_LINK.href}`,
    '',
    ...footerText(footer, extra.links),
  ].join('\n');

  return { subject: c.subject, text, html, unsubscribeUrl: extra.links?.unsubscribe };
}

const shortDate = (when: EventDate) => shortDateLabel(when);

export type CommentEmailKind = 'comment' | 'suggestion' | 'reply';

/**
 * Tells someone about a new comment: the organizer for a top-level comment or
 * suggestion, or the parent comment's author for a reply.
 */
export function commentEmail(
  kind: CommentEmailKind,
  event: Pick<GroupEvent, 'title'>,
  comment: { body: string },
  author: string,
  url: string,
  links?: RecipientLinks,
): Email {
  const copy: Record<
    CommentEmailKind,
    { subject: string; eyebrow: string; intro: string; footer: string }
  > = {
    comment: {
      subject: `${author} commented on ${event.title}`,
      eyebrow: 'New comment',
      intro: `${author} commented on your event:`,
      footer: "You're getting this because you organize or co-organize this event on neiaboiz.com.",
    },
    suggestion: {
      subject: `${author} suggested a change to ${event.title}`,
      eyebrow: 'New suggestion',
      intro: `${author} suggested a change to your event:`,
      footer: "You're getting this because you organize or co-organize this event on neiaboiz.com.",
    },
    reply: {
      subject: `${author} replied to your comment on ${event.title}`,
      eyebrow: 'New reply',
      intro: `${author} replied to your comment:`,
      footer: "You're getting this because you commented on this event on neiaboiz.com.",
    },
  };
  const c = copy[kind];
  const html = renderEmail({
    eyebrow: c.eyebrow,
    heading: event.title,
    preheader: `${c.intro} ${comment.body.slice(0, 90)}`,
    paragraphs: [c.intro],
    note: comment.body,
    button: { href: url, text: 'View & reply' },
    siteLink: EVENTS_LINK,
    footer: c.footer,
    footerLinks: footerLinks(links),
  });
  const text = [
    'NEIA BOIZ · neiaboiz.com',
    '',
    c.eyebrow.toUpperCase(),
    event.title,
    '',
    c.intro,
    '',
    comment.body,
    '',
    `View & reply: ${url}`,
    `${EVENTS_LINK.label} ${EVENTS_LINK.href}`,
    '',
    ...footerText(c.footer, links),
  ].join('\n');
  return { subject: c.subject, text, html, unsubscribeUrl: links?.unsubscribe };
}

/** Tells the organizer that someone added themselves to their event. */
export function memberJoinedEmail(
  event: Pick<GroupEvent, 'title'>,
  name: string,
  invitedCount: number,
  url: string,
  links?: RecipientLinks,
): Email {
  const intro = `${name} added themselves to your event. ${invitedCount} people are invited now.`;
  const footer =
    "You're getting this because you organize or co-organize this event on neiaboiz.com.";
  const html = renderEmail({
    eyebrow: 'Someone joined',
    heading: event.title,
    preheader: intro,
    paragraphs: [intro],
    button: { href: url, text: 'See the event' },
    siteLink: EVENTS_LINK,
    footer,
    footerLinks: footerLinks(links),
  });
  const text = [
    'NEIA BOIZ · neiaboiz.com',
    '',
    'SOMEONE JOINED',
    event.title,
    '',
    intro,
    '',
    `See the event: ${url}`,
    `${EVENTS_LINK.label} ${EVENTS_LINK.href}`,
    '',
    ...footerText(footer, links),
  ].join('\n');
  return {
    subject: `${name} joined ${event.title}`,
    text,
    html,
    unsubscribeUrl: links?.unsubscribe,
  };
}

/** One proposed date's results, for the "voting closed" email. */
export interface PollResult {
  label: string;
  yes: number;
  maybe: number;
  no: number;
  best: boolean;
}

/** Tells the organizer their poll's voting has closed, with the results. */
export function pollClosedEmail(
  event: Pick<GroupEvent, 'title'>,
  results: PollResult[],
  voted: number,
  invited: number,
  notVoted: string[],
  url: string,
  links?: RecipientLinks,
): Email {
  const sorted = [...results].sort((a, b) => b.yes * 2 + b.maybe - (a.yes * 2 + a.maybe));
  const best = sorted.filter((r) => r.best);
  const intro =
    `Voting has closed. ${voted} of ${invited} invited ${invited === 1 ? 'person' : 'people'} voted. ` +
    (best.length === 1
      ? `${best[0].label} works best.`
      : best.length > 1
        ? 'A few dates are tied for best.'
        : 'Nobody voted yes or maybe.') +
    ' Pick the date to let everyone know.';
  const details: EmailDetail[] = sorted.map((r) => ({
    label: r.best ? 'Best' : 'Date',
    value: `${r.label}: ${r.yes} yes, ${r.maybe} maybe, ${r.no} no`,
  }));
  const note = notVoted.length ? `Didn't vote: ${notVoted.join(', ')}` : undefined;
  const footer =
    "You're getting this because you organize or co-organize this event on neiaboiz.com.";
  const html = renderEmail({
    eyebrow: 'Voting closed',
    heading: event.title,
    preheader: intro,
    paragraphs: [intro],
    details,
    note,
    button: { href: url, text: 'Pick the date' },
    siteLink: EVENTS_LINK,
    footer,
    footerLinks: footerLinks(links),
  });
  const text = [
    'NEIA BOIZ · neiaboiz.com',
    '',
    'VOTING CLOSED',
    event.title,
    '',
    intro,
    '',
    ...details.map((d) => `${d.label}: ${d.value}`),
    ...(note ? ['', note] : []),
    '',
    `Pick the date: ${url}`,
    `${EVENTS_LINK.label} ${EVENTS_LINK.href}`,
    '',
    ...footerText(footer, links),
  ].join('\n');
  return {
    subject: `Voting closed: ${event.title}`,
    text,
    html,
    unsubscribeUrl: links?.unsubscribe,
  };
}
