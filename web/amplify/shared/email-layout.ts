/**
 * The neiaboiz.com email look: the site's denim, parchment and stitched gold,
 * as table-based HTML with inline styles so it holds up in Gmail, Outlook and
 * Apple Mail. Used by event emails and the account invitation.
 *
 * Lives under amplify/ (not src/) because amplify/auth/resource.ts imports it,
 * and the backend deployer can only load ES modules from this folder.
 */

export const SITE_URL = 'https://neiaboiz.com';

/** Site design tokens (web/src/styles/_tokens.scss), as email-safe hex colors. */
const C = {
  page: '#111a2b',
  card: '#18243a',
  panel: '#213151',
  border: '#2c4068',
  text: '#efe5cd',
  muted: '#a7b5cc',
  gold: '#e0ad4c',
  goldContrast: '#18243a',
  violet: '#b99cf5',
};

const DISPLAY = "'Cinzel','Trajan Pro',Georgia,'Times New Roman',serif";
const SANS = "'Alegreya Sans','Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif";
const PIXEL = "'VT323','Courier New',monospace";

export interface EmailDetail {
  label: string;
  value: string;
  /** Optional link under the value, e.g. "Open in Maps". */
  link?: { href: string; text: string };
}

export interface EmailContent {
  /** Short label above the heading, e.g. "Event reminder". */
  eyebrow: string;
  heading: string;
  /** Hidden preview text shown in the inbox list. */
  preheader: string;
  /** Paragraphs of plain text (escaped here). */
  paragraphs?: string[];
  details?: EmailDetail[];
  /** Free text shown in a panel, keeping line breaks (e.g. event details). */
  note?: string;
  button?: { href: string; text: string };
  /**
   * A plain link under the button showing the address itself (e.g.
   * "All NEIA Boiz events: neiaboiz.com/events"), for mail apps that hide buttons.
   */
  siteLink?: { label: string; href: string };
  /** Why they got it, shown in the footer. */
  footer: string;
  /** e.g. email preferences and unsubscribe, shown after the footer text. */
  footerLinks?: { href: string; text: string }[];
}

/** A complete HTML email in the site's style. */
export function renderEmail(content: EmailContent): string {
  const paragraphs = (content.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:17px;line-height:1.55;color:${C.text}">${escapeHtml(p)}</p>`,
    )
    .join('');

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-collapse:collapse">${content.details
        .map(
          (d) => `<tr>
<td valign="top" style="padding:10px 14px 10px 0;width:104px;border-top:1px solid ${C.border};font-family:${PIXEL};font-size:16px;letter-spacing:1px;text-transform:uppercase;color:${C.gold}">${escapeHtml(d.label)}</td>
<td valign="top" style="padding:10px 0;border-top:1px solid ${C.border};font-family:${SANS};font-size:17px;line-height:1.45;color:${C.text}"><strong>${escapeHtml(d.value)}</strong>${
            d.link
              ? `<br><a href="${escapeHtml(d.link.href)}" style="color:${C.violet};font-size:15px">${escapeHtml(d.link.text)}</a>`
              : ''
          }</td>
</tr>`,
        )
        .join('')}</table>`
    : '';

  const note = content.note
    ? `<div style="margin:0 0 22px;padding:14px 16px;background:${C.panel};border-radius:8px;font-family:${SANS};font-size:16px;line-height:1.55;color:${C.text};white-space:pre-line">${escapeHtml(content.note)}</div>`
    : '';

  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td style="border-radius:999px;background:${C.gold}">
<a href="${escapeHtml(content.button.href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:17px;font-weight:700;color:${C.goldContrast};text-decoration:none;border-radius:999px">${escapeHtml(content.button.text)}</a>
</td></tr></table>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(content.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Alegreya+Sans:wght@400;700&family=Cinzel:wght@700&family=VT323&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 6px 16px">
  <a href="${SITE_URL}" style="text-decoration:none">
    <span style="font-family:${DISPLAY};font-size:22px;font-weight:700;letter-spacing:4px;color:${C.gold}">NEIA BOIZ</span>
  </a>
  <span style="font-family:${PIXEL};font-size:16px;letter-spacing:1px;color:${C.muted}">&nbsp;&middot;&nbsp;neiaboiz.com</span>
</td></tr>
<tr><td style="background:${C.card};border:2px dashed ${C.gold};border-radius:16px;padding:30px 28px">
  <p style="margin:0 0 10px;font-family:${PIXEL};font-size:19px;letter-spacing:2px;text-transform:uppercase;color:${C.gold}">${escapeHtml(content.eyebrow)}</p>
  <h1 style="margin:0 0 18px;font-family:${DISPLAY};font-size:27px;line-height:1.25;font-weight:700;letter-spacing:1px;color:${C.text}">${escapeHtml(content.heading)}</h1>
  ${paragraphs}${details}${note}${button}${
    content.siteLink
      ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.muted}">${escapeHtml(content.siteLink.label)} <a href="${escapeHtml(content.siteLink.href)}" style="color:${C.violet}">${escapeHtml(displayUrl(content.siteLink.href))}</a></p>`
      : ''
  }
</td></tr>
<tr><td style="padding:18px 8px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${C.muted}">
  ${escapeHtml(content.footer)}<br>
  Sent by <a href="${SITE_URL}" style="color:${C.violet}">neiaboiz.com</a>${(
    content.footerLinks ?? []
  )
    .map(
      (l) =>
        ` &middot; <a href="${escapeHtml(l.href)}" style="color:${C.violet}">${escapeHtml(l.text)}</a>`,
    )
    .join('')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `https://neiaboiz.com/events` → `neiaboiz.com/events`, for showing a link's address. */
export function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
