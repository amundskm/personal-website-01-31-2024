import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { PAGE_SLUGS_QUERY, POST_SLUGS_QUERY, PROJECT_SLUGS_QUERY } from './core/queries';
import { sanityFetch } from './core/sanity';
import { isSanityConfigured } from './core/sanity.config';

/**
 * Fetches every slug for a document type at build time so each one is
 * prerendered to static HTML. Unknown slugs fall back to client rendering.
 */
function slugParams(query: string) {
  return async () => {
    if (!isSanityConfigured) return [];
    const slugs = await sanityFetch<(string | null)[]>(inject(HttpClient), query);
    return slugs.filter((slug): slug is string => !!slug).map((slug) => ({ slug }));
  };
}

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'blog', renderMode: RenderMode.Prerender },
  { path: 'projects', renderMode: RenderMode.Prerender },
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: slugParams(POST_SLUGS_QUERY),
    fallback: PrerenderFallback.Client,
  },
  {
    path: 'projects/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: slugParams(PROJECT_SLUGS_QUERY),
    fallback: PrerenderFallback.Client,
  },
  {
    path: ':slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: slugParams(PAGE_SLUGS_QUERY),
    fallback: PrerenderFallback.Client,
  },
  // Everything else (e.g. 404s) is rendered in the browser from index.csr.html
  { path: '**', renderMode: RenderMode.Client },
];
