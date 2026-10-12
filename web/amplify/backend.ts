import { defineBackend } from '@aws-amplify/backend';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { auth } from './auth/resource';
import { membersContent } from './functions/members-content/resource';

const backend = defineBackend({ auth, membersContent });

// Invite-only: accounts are created by an admin in the Cognito console
const { userPool, userPoolClient, cfnResources } = backend.auth.resources;
cfnResources.cfnUserPool.adminCreateUserConfig = { allowAdminCreateUserOnly: true };

// HTTP API for gated content. API Gateway rejects requests without a valid
// Cognito token, and the Lambda filters content by the caller's groups.
const apiStack = backend.createStack('members-api');

const authorizer = new HttpJwtAuthorizer(
  'CognitoAuthorizer',
  `https://cognito-idp.${apiStack.region}.amazonaws.com/${userPool.userPoolId}`,
  { jwtAudience: [userPoolClient.userPoolClientId] },
);

const httpApi = new HttpApi(apiStack, 'MembersApi', {
  apiName: 'members-api',
  corsPreflight: {
    // Bearer tokens, not cookies, so any origin (localhost, Amplify preview, your domain) is fine
    allowOrigins: ['*'],
    allowMethods: [CorsHttpMethod.GET],
    allowHeaders: ['Authorization'],
  },
});

const integration = new HttpLambdaIntegration(
  'MembersContentIntegration',
  backend.membersContent.resources.lambda,
);

for (const path of ['/pages', '/pages/{slug}']) {
  httpApi.addRoutes({ path, methods: [HttpMethod.GET], integration, authorizer });
}

backend.addOutput({
  custom: { membersApiUrl: httpApi.apiEndpoint },
});
