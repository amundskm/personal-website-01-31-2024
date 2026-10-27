import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of, throwError, type Observable } from 'rxjs';

declare const CONTENT_API_URL: string | undefined;

/**
 * Origin of the content API (the Rails app in api/). Each environment's build
 * sets it with `ng build --define CONTENT_API_URL='"https://…"'` (see
 * amplify.yml); otherwise it's the local Docker API.
 */
export const contentApiUrl: string = (
  typeof CONTENT_API_URL === 'string' ? CONTENT_API_URL : 'http://localhost:3000'
).replace(/\/$/, '');

/**
 * GETs public content. A 404 becomes `null`, which pages show as "not found".
 *
 * Uses HttpClient so prerendering waits for the response and hydration reuses
 * it through the HTTP transfer cache instead of requesting it again.
 */
function get<T>(http: HttpClient, path: string): Observable<T | null> {
  return http
    .get<T>(`${contentApiUrl}${path}`)
    .pipe(
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404
          ? of(null)
          : throwError(() => error),
      ),
    );
}

/**
 * Reactive content request. Re-runs when the signals read in `path` change;
 * return `undefined` to skip the request (e.g. before a route param is known).
 */
export function contentResource<T>(path: string | (() => string | undefined)) {
  const http = inject(HttpClient);
  return rxResource<T | null, string | undefined>({
    params: typeof path === 'string' ? () => path : path,
    stream: ({ params }) => get<T>(http, params),
  });
}

/** One-off content request, used where signals aren't needed (prerender params). */
export function contentFetch<T>(http: HttpClient, path: string): Promise<T | null> {
  return firstValueFrom(get<T>(http, path));
}

/** A path segment, e.g. a slug from the URL. */
export const segment = (value: string) => encodeURIComponent(value);
