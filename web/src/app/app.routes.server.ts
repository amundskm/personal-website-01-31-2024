import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { contentFetch } from './core/content-api';

/**
 * Fetches every slug for a document type at build time so each one is
 * prerendered to static HTML. Unknown slugs fall back to client rendering.
 */
function slugParams(path: string) {
  return async () => {
    const slugs = (await contentFetch<string[]>(inject(HttpClient), path)) ?? [];
    return slugs.map((slug) => ({ slug }));
  };
}

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'blog', renderMode: RenderMode.Prerender },
  { path: 'projects', renderMode: RenderMode.Prerender },
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: slugParams('/posts/slugs'),
    fallback: PrerenderFallback.Client,
  },
  {
    path: 'projects/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: slugParams('/projects/slugs'),
    fallback: PrerenderFallback.Client,
  },
  { path: 'login', renderMode: RenderMode.Prerender },
  // Members-only content is never prerendered; it's fetched after signing in
  { path: 'members', renderMode: RenderMode.Client },
  { path: 'members/**', renderMode: RenderMode.Client },
  { path: 'family/**', renderMode: RenderMode.Client },
  { path: 'events', renderMode: RenderMode.Client },
  { path: 'events/**', renderMode: RenderMode.Client },
  { path: 'profile', renderMode: RenderMode.Client },
  { path: 'unsubscribe', renderMode: RenderMode.Client },
  {
    path: ':slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: slugParams('/pages/slugs'),
    fallback: PrerenderFallback.Client,
  },
  // Everything else (e.g. 404s) is rendered in the browser from index.csr.html
  { path: '**', renderMode: RenderMode.Client },
];
