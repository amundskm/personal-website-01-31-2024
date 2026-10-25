import { defineFunction, secret } from '@aws-amplify/backend';

/** Sender for event emails; the neiaboiz.com SES identity is created in backend.ts. */
export const EVENTS_FROM_ADDRESS = 'events@neiaboiz.com';

/**
 * The registered toll-free number texts come from, in E.164 (e.g. '+18335550123'),
 * set up in AWS End User Messaging SMS (see the README). Texts aren't sent while it's ''.
 */
export const SMS_ORIGINATION = '+18447914811';

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
    SITE_URL: 'https://neiaboiz.com',
    MAIL_FROM: `NEIA Boiz <${EVENTS_FROM_ADDRESS}>`,
    SMS_ORIGINATION,
    // A Discord channel webhook; new polls and events for everyone are posted there.
    // Set in the Amplify console (Hosting → Secrets) or `npx ampx sandbox secret set`.
    // Loaded when the function starts: redeploy to apply a changed URL right away.
    // Keep it defined (deploys require every referenced secret to exist).
    DISCORD_WEBHOOK_URL: secret('DISCORD_WEBHOOK_URL'),
  },
});
