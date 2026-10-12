import { defineFunction } from '@aws-amplify/backend';

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
    SITE_URL: 'https://neiaboiz.com',
    MAIL_FROM: `NEIA Boiz <${EVENTS_FROM_ADDRESS}>`,
  },
});
