import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * Family finances: reads the spending plan from the content API (api/) and
 * stores uploaded statements in DynamoDB (table name added in backend.ts).
 */
export const finances = defineFunction({
  name: 'finances',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  environment: {
    // This environment's content API, e.g. https://api.neiaboiz.com. Set with
    // `npx ampx sandbox secret set CONTENT_API_URL` (or in the Amplify console)
    CONTENT_API_URL: secret('CONTENT_API_URL'),
    // The API's SERVICE_TOKEN: "Remember" on the upload page adds merchant patterns.
    // Set with `npx ampx sandbox secret set CONTENT_API_SERVICE_TOKEN` (or in the Amplify console)
    CONTENT_API_SERVICE_TOKEN: secret('CONTENT_API_SERVICE_TOKEN'),
  },
});
