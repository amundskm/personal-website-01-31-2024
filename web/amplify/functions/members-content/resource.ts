import { defineFunction, secret } from '@aws-amplify/backend';

/** Serves gated content from the private Sanity dataset to signed-in users. */
export const membersContent = defineFunction({
  name: 'members-content',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 10,
  environment: {
    SANITY_DATASET: 'private',
    // Set with `npx ampx sandbox secret set SANITY_PRIVATE_READ_TOKEN` (or in the Amplify console)
    SANITY_READ_TOKEN: secret('SANITY_PRIVATE_READ_TOKEN'),
  },
});
