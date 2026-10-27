import { defineFunction, secret } from '@aws-amplify/backend';

/** Sender for event emails; the neiaboiz.com SES identity is created in backend.ts. */
export const EVENTS_FROM_ADDRESS = 'events@neiaboiz.com';

/**
 * NEIA Boiz group events: polls, confirmed events, RSVPs, and email
 * notifications/reminders. Also runs every 15 minutes to send due reminders.
 * The table name and user pool id are added in backend.ts.
 */
export const groupEvents = defineFunction({
  name: 'group-events',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 60,
  environment: {
    // Links in emails: this branch's site (Amplify build variable SITE_URL), else production
    SITE_URL: process.env['SITE_URL'] || 'https://neiaboiz.com',
    MAIL_FROM: `NEIA Boiz <${EVENTS_FROM_ADDRESS}>`,
    // A Discord channel webhook; new polls and events for everyone are posted there.
    // Set in the Amplify console (Hosting → Secrets) or `npx ampx sandbox secret set`.
    // Loaded when the function starts: redeploy to apply a changed URL right away.
    // Keep it defined (deploys require every referenced secret to exist).
    DISCORD_WEBHOOK_URL: secret('DISCORD_WEBHOOK_URL'),
  },
});
