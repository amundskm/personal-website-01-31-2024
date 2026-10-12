import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { env } from '$amplify/env/members-content';
import { MEMBER_PAGE_QUERY, MEMBER_PAGES_QUERY } from '../../../src/app/core/queries';
import { callerGroups, json } from '../shared/http';
import { sanityClient } from '../shared/sanity';

const sanity = sanityClient(env.SANITY_DATASET, env.SANITY_READ_TOKEN);

/**
 * GET /pages        → members-only pages the caller may see
 * GET /pages/{slug} → one page, or 404 if it doesn't exist or isn't shared with them
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const groups = callerGroups(event);
  if (!groups.length) return json(403, { message: 'Your account has no permissions yet.' });

  const slug = event.pathParameters?.['slug'];
  const params = { groups, isAdmin: groups.includes('admin'), ...(slug ? { slug } : {}) };

  try {
    const result = await sanity.query(slug ? MEMBER_PAGE_QUERY : MEMBER_PAGES_QUERY, params);
    return result === null ? json(404, { message: 'Not found' }) : json(200, result);
  } catch (error) {
    console.error(error);
    return json(502, { message: 'Content could not be loaded.' });
  }
};
