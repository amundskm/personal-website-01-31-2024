import { type EmailDetail, renderEmail, SITE_URL } from '../../../../amplify/shared/email-layout';
import {
  type EventDate,
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

/** The email sent to members about an event, in the site's style. */
export function eventEmail(
  kind: EmailKind,
  event: GroupEvent,
  url: string,
  extra: { by?: string; reminderOffset?: number; links?: RecipientLinks } = {},
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
  const c = copy[kind];
  const buttonUrl = kind === 'cancelled' ? `${SITE_URL}/events` : url;

  const details: EmailDetail[] = [];
  if (kind === 'poll' || (kind === 'restored' && event.status === 'polling')) {
    event.options.forEach((option, i) =>
      details.push({ label: `Date ${i + 1}`, value: formatEventDate(option) }),
    );
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
    footer: FOOTER,
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
    ...footerText(FOOTER, extra.links),
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
      footer: "You're getting this because you organize this event on neiaboiz.com.",
    },
    suggestion: {
      subject: `${author} suggested a change to ${event.title}`,
      eyebrow: 'New suggestion',
      intro: `${author} suggested a change to your event:`,
      footer: "You're getting this because you organize this event on neiaboiz.com.",
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
