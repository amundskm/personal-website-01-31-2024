import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { env } from '$amplify/env/members-content';
import { MEMBER_PAGE_QUERY, MEMBER_PAGES_QUERY } from '../../../src/app/core/queries';
import { sanityConfig } from '../../../src/app/core/sanity.config';

/**
 * GET /pages        → members-only pages the caller may see
 * GET /pages/{slug} → one page, or 404 if it doesn't exist or isn't shared with them
 *
 * API Gateway has already verified the Cognito access token before this runs,
 * so the groups claim can be trusted.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const groups = parseGroups(event.requestContext.authorizer.jwt.claims['cognito:groups']);
  if (!groups.length) return json(403, { message: 'Your account has no permissions yet.' });

  const slug = event.pathParameters?.['slug'];
  const params = { groups, isAdmin: groups.includes('admin'), ...(slug ? { slug } : {}) };

  try {
    const result = await query(slug ? MEMBER_PAGE_QUERY : MEMBER_PAGES_QUERY, params);
    return result === null ? json(404, { message: 'Not found' }) : json(200, result);
  } catch (error) {
    console.error(error);
    return json(502, { message: 'Content could not be loaded.' });
  }
};

/** API Gateway flattens list claims to a string such as "[admin wife]". */
function parseGroups(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim !== 'string') return [];
  return claim
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .filter(Boolean);
}

async function query(groq: string, params: Record<string, unknown>): Promise<unknown> {
  const search = new URLSearchParams({ query: groq, perspective: 'published' });
  for (const [key, value] of Object.entries(params)) {
    search.set(`$${key}`, JSON.stringify(value));
  }
  const url =
    `https://${sanityConfig.projectId}.api.sanity.io/v${sanityConfig.apiVersion}` +
    `/data/query/${env.SANITY_DATASET}?${search}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.SANITY_READ_TOKEN}` },
  });
  if (!response.ok)
    throw new Error(`Sanity responded ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { result: unknown }).result;
}

function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    body: JSON.stringify(body),
  };
}
