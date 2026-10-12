import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { finances } from './functions/finances/resource';
import { EVENTS_FROM_ADDRESS, groupEvents } from './functions/group-events/resource';
import { membersContent } from './functions/members-content/resource';

const backend = defineBackend({ auth, membersContent, finances, groupEvents });

// Invite-only: accounts are created by an admin in the Cognito console. Set
// just this flag: replacing adminCreateUserConfig would drop the invitation email.
const { userPool, userPoolClient, cfnResources } = backend.auth.resources;
cfnResources.cfnUserPool.addPropertyOverride(
  'AdminCreateUserConfig.AllowAdminCreateUserOnly',
  true,
);

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
      CorsHttpMethod.POST,
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

// NEIA Boiz group events: polls, confirmed events and RSVPs, plus emails.
const eventsStack = backend.createStack('group-events-data');
const eventsTable = new Table(eventsStack, 'GroupEvents', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
});
const eventsLambda = backend.groupEvents.resources.lambda;
eventsTable.grantReadWriteData(eventsLambda);
backend.groupEvents.addEnvironment('EVENTS_TABLE', eventsTable.tableName);
// Members are read from the user pool groups, so emails go to their sign-in addresses
backend.groupEvents.addEnvironment('USER_POOL_ID', userPool.userPoolId);
eventsLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:ListUsersInGroup'],
    resources: [userPool.userPoolArn],
  }),
);
eventsLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail'],
    resources: ['*'],
    conditions: { StringEquals: { 'ses:FromAddress': EVENTS_FROM_ADDRESS } },
  }),
);
// Emails are sent through the existing, already verified neiaboiz.com SES
// identity (DKIM + MAIL FROM admin.neiaboiz.com), managed outside this app.
// Reminders: check every 15 minutes (in the function's own stack, avoiding a cross-stack cycle)
new Rule(Stack.of(eventsLambda), 'EventRemindersSchedule', {
  schedule: Schedule.rate(Duration.minutes(15)),
  targets: [new LambdaFunction(eventsLambda)],
});

const eventsIntegration = new HttpLambdaIntegration('GroupEventsIntegration', eventsLambda);
httpApi.addRoutes({
  path: '/events',
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration: eventsIntegration,
  authorizer,
});
httpApi.addRoutes({
  path: '/events/{proxy+}',
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.POST],
  integration: eventsIntegration,
  authorizer,
});

backend.addOutput({
  custom: { membersApiUrl: httpApi.apiEndpoint },
});
