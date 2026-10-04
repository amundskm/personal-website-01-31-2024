import type { SanityLink } from './models';
import { documentPath, resolveLink } from './paths';

const link = (overrides: Partial<SanityLink>): SanityLink => ({
  label: 'Link',
  kind: 'internal',
  path: null,
  url: null,
  style: null,
  internal: null,
  ...overrides,
});

describe('documentPath', () => {
  it('maps document types to routes', () => {
    expect(documentPath('page', 'home')).toBe('/');
    expect(documentPath('page', 'about')).toBe('/about');
    expect(documentPath('post', 'hello')).toBe('/blog/hello');
    expect(documentPath('project', 'site')).toBe('/projects/site');
  });
});

describe('resolveLink', () => {
  it('resolves references to documents', () => {
    expect(resolveLink(link({ internal: { _type: 'post', slug: 'hi' } }))).toEqual({
      kind: 'internal',
      path: '/blog/hi',
    });
  });

  it('falls back to a fixed path', () => {
    expect(resolveLink(link({ path: '/projects' }))).toEqual({
      kind: 'internal',
      path: '/projects',
    });
  });

  it('opens http(s) links in a new tab but not mailto', () => {
    expect(resolveLink(link({ kind: 'external', url: 'https://x.dev' }))).toEqual({
      kind: 'external',
      href: 'https://x.dev',
      newTab: true,
    });
    expect(resolveLink(link({ kind: 'external', url: 'mailto:me@x.dev' }))).toMatchObject({
      newTab: false,
    });
  });

  it('returns null for incomplete links', () => {
    expect(resolveLink(null)).toBeNull();
    expect(resolveLink(link({ kind: 'external' }))).toBeNull();
    expect(resolveLink(link({}))).toBeNull();
  });
});
