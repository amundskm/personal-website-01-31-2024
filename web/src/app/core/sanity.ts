import { HttpClient, httpResource } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isSanityConfigured, sanityConfig } from './sanity.config';

export type QueryParams = Record<string, string | number | boolean>;

/**
 * Whether queries go through Sanity's edge cache (CDN). Browsers use it for
 * speed; the server config turns it off so builds triggered right after a
 * publish never prerender a stale cached response.
 */
export const SANITY_USE_CDN = new InjectionToken<boolean>('SANITY_USE_CDN', {
  factory: () => sanityConfig.useCdn,
});

/** The API origin, e.g. `https://<projectId>.apicdn.sanity.io`. */
export function sanityOrigin(useCdn: boolean): string {
  return `https://${sanityConfig.projectId}.${useCdn ? 'apicdn' : 'api'}.sanity.io`;
}

/**
 * Builds a GET URL for Sanity's HTTP query API.
 *
 * Content is queried through Angular's HttpClient rather than @sanity/client so
 * that server-side prerendering waits for it automatically and the responses are
 * replayed during hydration by the built-in HTTP transfer cache.
 */
export function sanityQueryUrl(
  query: string,
  params: QueryParams = {},
  useCdn: boolean = sanityConfig.useCdn,
): string {
  const { dataset, apiVersion } = sanityConfig;
  const search = new URLSearchParams({ query, perspective: 'published' });
  for (const [key, value] of Object.entries(params)) {
    search.set(`$${key}`, JSON.stringify(value));
  }
  return `${sanityOrigin(useCdn)}/v${apiVersion}/data/query/${dataset}?${search}`;
}

/**
 * Reactive GROQ query. Re-runs whenever the signals read in `params` change.
 * Return `undefined` from `params` to skip the request (e.g. while a route
 * parameter is not yet available).
 */
export function sanityResource<T>(query: string, params?: () => QueryParams | undefined) {
  const useCdn = inject(SANITY_USE_CDN);
  return httpResource<T>(
    () => {
      if (!isSanityConfigured) return undefined;
      const resolved = params ? params() : {};
      return resolved === undefined ? undefined : sanityQueryUrl(query, resolved, useCdn);
    },
    { parse: (raw) => (raw as { result: T }).result },
  );
}

/**
 * One-off GROQ query, used where signals are not needed (prerender params).
 * Always reads from the live API, since it only runs at build time.
 */
export async function sanityFetch<T>(
  http: HttpClient,
  query: string,
  params: QueryParams = {},
): Promise<T> {
  const response = await firstValueFrom(
    http.get<{ result: T }>(sanityQueryUrl(query, params, false)),
  );
  return response.result;
}
