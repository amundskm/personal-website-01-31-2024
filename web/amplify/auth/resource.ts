import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito user pool. Accounts are invite-only (self sign-up is disabled in
 * `backend.ts`): create users in the Cognito console and add them to groups.
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      userInvitation: {
        emailSubject: "You've been invited to Keith's website",
        emailBody: (username, code) =>
          `You've been given an account. Use "Log in" at the top of the site with ${username()} ` +
          `and the temporary password ${code()} — you'll be asked to choose a new one.`,
      },
    },
  },
  // Must match ROLES in src/app/core/auth/roles.ts. (Not imported from there:
  // the deployer loads src/ as CommonJS, so its named exports can't be read.)
  groups: ['admin', 'wife', 'neia-boiz'],
});
