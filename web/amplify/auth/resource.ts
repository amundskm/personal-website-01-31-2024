import { defineAuth } from '@aws-amplify/backend';
import { renderEmail, SITE_URL } from '../shared/email-layout';

/**
 * Cognito user pool. Accounts are invite-only (self sign-up is disabled in
 * `backend.ts`): create users in the Cognito console and add them to groups.
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      userInvitation: {
        emailSubject: "You're invited to neiaboiz.com",
        // Cognito fills in {username} and {####} (the temporary password)
        emailBody: (username, code) =>
          renderEmail({
            eyebrow: "You're invited",
            heading: 'Welcome to neiaboiz.com',
            preheader: 'Your account is ready. Here is how to log in.',
            paragraphs: [
              'An account has been made for you on neiaboiz.com, the home for NEIA Boiz events and plans.',
            ],
            details: [
              { label: 'Email', value: username() },
              { label: 'Password', value: code() },
            ],
            note:
              "That password is temporary. You'll pick your own the first time you log in. " +
              'After that, bookmark neiaboiz.com: events, polls and RSVPs are all there.',
            button: { href: `${SITE_URL}/login`, text: 'Log in' },
            siteLink: { label: 'Or go to', href: `${SITE_URL}/login` },
            footer: "You're getting this because someone added you to neiaboiz.com.",
          }),
      },
    },
  },
  // Must match ROLES in src/app/core/auth/roles.ts. (Not imported from there:
  // the deployer loads src/ as CommonJS, so its named exports can't be read.)
  groups: ['admin', 'wife', 'neia-boiz'],
});
