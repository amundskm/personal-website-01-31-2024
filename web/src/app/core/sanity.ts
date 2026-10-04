import { HttpClient, httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { isSanityConfigured, sanityConfig } from './sanity.config';

export type QueryParams = Record<string, string | number | boolean>;

/**
 * Builds a GET URL for Sanity's HTTP query API.
 *
 * Content is queried through Angular's HttpClient rather than @sanity/client so
 * that server-side prerendering waits for it automatically and the responses are
 * replayed during hydration by the built-in HTTP transfer cache.
 */
export function sanityQueryUrl(query: string, params: QueryParams = {}): string {
  const { projectId, dataset, apiVersion, useCdn } = sanityConfig;
  const host = useCdn ? 'apicdn.sanity.io' : 'api.sanity.io';
  const search = new URLSearchParams({ query, perspective: 'published' });
  for (const [key, value] of Object.entries(params)) {
    search.set(`$${key}`, JSON.stringify(value));
  }
  return `https://${projectId}.${host}/v${apiVersion}/data/query/${dataset}?${search}`;
}

/**
 * Reactive GROQ query. Re-runs whenever the signals read in `params` change.
 * Return `undefined` from `params` to skip the request (e.g. while a route
 * parameter is not yet available).
 */
export function sanityResource<T>(query: string, params?: () => QueryParams | undefined) {
  return httpResource<T>(
    () => {
      if (!isSanityConfigured) return undefined;
      const resolved = params ? params() : {};
      return resolved === undefined ? undefined : sanityQueryUrl(query, resolved);
    },
    { parse: (raw) => (raw as { result: T }).result },
  );
}

/** One-off GROQ query, used where signals are not needed (e.g. prerender params). */
export async function sanityFetch<T>(
  http: HttpClient,
  query: string,
  params: QueryParams = {},
): Promise<T> {
  const response = await firstValueFrom(http.get<{ result: T }>(sanityQueryUrl(query, params)));
  return response.result;
}
