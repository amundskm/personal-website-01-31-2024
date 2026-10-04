import type { SanityLink } from './models';

/** The site URL for a document of the given type. */
export function documentPath(type: 'page' | 'post' | 'project', slug: string | null): string {
  if (!slug) return '/';
  switch (type) {
    case 'page':
      return slug === 'home' ? '/' : `/${slug}`;
    case 'post':
      return `/blog/${slug}`;
    case 'project':
      return `/projects/${slug}`;
  }
}

export type ResolvedLink =
  { kind: 'internal'; path: string } | { kind: 'external'; href: string; newTab: boolean };

/** Turns a CMS link into either a router path or an external href. */
export function resolveLink(link: SanityLink | null | undefined): ResolvedLink | null {
  if (!link) return null;
  if (link.kind === 'external') {
    if (!link.url) return null;
    return { kind: 'external', href: link.url, newTab: /^https?:/.test(link.url) };
  }
  if (link.internal)
    return { kind: 'internal', path: documentPath(link.internal._type, link.internal.slug) };
  if (link.path) return { kind: 'internal', path: link.path };
  return null;
}
