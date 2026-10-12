import { type EmailDetail, renderEmail, SITE_URL } from '../../../../amplify/shared/email-layout';
import { type EventDate, formatEventDate, type GroupEvent, mapLink, reminderLabel } from './events';

export type EmailKind = 'poll' | 'confirmed' | 'updated' | 'cancelled' | 'reminder';

export interface Email {
  subject: string;
  text: string;
  html: string;
}

const FOOTER = "You're getting this because you're in NEIA Boiz on neiaboiz.com.";

/** The email sent to members about an event, in the site's style. */
export function eventEmail(
  kind: EmailKind,
  event: GroupEvent,
  url: string,
  extra: { by?: string; reminderOffset?: number } = {},
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
  if (kind === 'poll') {
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
    footer: FOOTER,
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
    '',
    FOOTER,
  ].join('\n');

  return { subject: c.subject, text, html };
}

function shortDate(when: EventDate): string {
  return new Date(`${when.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
