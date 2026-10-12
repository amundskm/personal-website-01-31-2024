import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { auth } from './auth/resource';
import { finances } from './functions/finances/resource';
import { membersContent } from './functions/members-content/resource';

const backend = defineBackend({ auth, membersContent, finances });

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
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.PUT,
      CorsHttpMethod.PATCH,
      CorsHttpMethod.DELETE,
    ],
    allowHeaders: ['Authorization', 'Content-Type'],
  },
});

const integration = new HttpLambdaIntegration(
  'MembersContentIntegration',
  backend.membersContent.resources.lambda,
);

for (const path of ['/pages', '/pages/{slug}']) {
  httpApi.addRoutes({ path, methods: [HttpMethod.GET], integration, authorizer });
}

// Family finances: uploaded card statements, one item per statement. Only the
// finances Lambda can read it; it's kept if the backend is ever torn down.
const financesStack = backend.createStack('finances-data');
const statementsTable = new Table(financesStack, 'FinanceStatements', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
});
const financesLambda = backend.finances.resources.lambda;
statementsTable.grantReadWriteData(financesLambda);
backend.finances.addEnvironment('FINANCES_TABLE', statementsTable.tableName);

const financesIntegration = new HttpLambdaIntegration('FinancesIntegration', financesLambda);
httpApi.addRoutes({
  path: '/finances',
  methods: [HttpMethod.GET],
  integration: financesIntegration,
  authorizer,
});
httpApi.addRoutes({
  path: '/finances/months/{month}',
  methods: [HttpMethod.GET],
  integration: financesIntegration,
  authorizer,
});
httpApi.addRoutes({
  path: '/finances/statements/{id}/lines/{line}',
  methods: [HttpMethod.PATCH],
  integration: financesIntegration,
  authorizer,
});
httpApi.addRoutes({
  path: '/finances/admin',
  methods: [HttpMethod.GET],
  integration: financesIntegration,
  authorizer,
});
httpApi.addRoutes({
  path: '/finances/statements/{id}',
  methods: [HttpMethod.PUT, HttpMethod.DELETE],
  integration: financesIntegration,
  authorizer,
});

backend.addOutput({
  custom: { membersApiUrl: httpApi.apiEndpoint },
});
