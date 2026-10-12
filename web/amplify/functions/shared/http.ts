import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

/**
 * The caller's Cognito groups. API Gateway has already verified the access
 * token, so the claim can be trusted. It flattens list claims to a string such
 * as "[admin wife]".
 */
export function callerGroups(event: APIGatewayProxyEventV2WithJWTAuthorizer): string[] {
  const claim: unknown = event.requestContext.authorizer.jwt.claims['cognito:groups'];
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim !== 'string') return [];
  return claim
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .filter(Boolean);
}

export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    body: JSON.stringify(body),
  };
}
