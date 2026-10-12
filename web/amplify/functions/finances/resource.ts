import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * Family finances: reads the spending plan from the private Sanity dataset and
 * stores uploaded statements in DynamoDB (table name added in backend.ts).
 */
export const finances = defineFunction({
  name: 'finances',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  environment: {
    SANITY_DATASET: 'private',
    // An Editor token for the private dataset: "Remember" on the upload page adds merchant patterns.
    // Set with `npx ampx sandbox secret set SANITY_PRIVATE_WRITE_TOKEN` (or in the Amplify console)
    SANITY_WRITE_TOKEN: secret('SANITY_PRIVATE_WRITE_TOKEN'),
  },
});
