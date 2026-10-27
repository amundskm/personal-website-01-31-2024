/**
 * Migration check: runs the site's GROQ queries against Sanity and compares
 * each result with the matching Rails endpoint. Delete after the cutover.
 *
 *   npx tsx api/script/compare-with-sanity.mts [api-origin]     (from the repo root)
 *
 * Uses your `sanity login` session for the private dataset, and SERVICE_TOKEN
 * from api/.env for the spending plan. Image assets are compared by
 * dimensions only: their ids, URLs and placeholders differ by design.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as q from '../../web/src/app/core/queries';
import { sanityConfig } from '../../web/src/app/core/sanity.config';

const API = process.argv[2] ?? 'http://localhost:3000';
const SERVICE_TOKEN = /^SERVICE_TOKEN=(.*)$/m.exec(readFileSync('api/.env', 'utf8'))?.[1];

function groq(query: string, dataset: string, params: Record<string, unknown> = {}): unknown {
  // The CLI has no parameter flag, so inline them as GROQ literals
  const inlined = query.replace(/\$(\w+)/g, (_, name: string) => JSON.stringify(params[name]));
  const out = execFileSync(
    process.execPath,
    ['../node_modules/sanity/bin/sanity', 'documents', 'query', inlined, '--dataset', dataset,
      '--api-version', `v${sanityConfig.apiVersion}`],
    { cwd: 'studio', encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

async function rails(path: string, token?: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'string' && ISO_DATE.test(value)) return new Date(value).toISOString();
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (key === 'asset' && item && typeof item === 'object' && 'metadata' in item) {
        const dims = (item as { metadata?: { dimensions?: { width: number; height: number } } }).metadata?.dimensions;
        return [key, { width: dims?.width, height: dims?.height }];
      }
      return [key, normalize(item)];
    });
    return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return value;
}

function differences(a: unknown, b: unknown, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((key) =>
      differences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}/${key}`),
    );
  }
  return [`${path || '/'}: sanity=${JSON.stringify(a)} rails=${JSON.stringify(b)}`];
}

const slugs = (query: string) => (groq(query, 'production') as string[]).filter(Boolean);

const checks: [string, () => unknown, () => Promise<unknown>][] = [
  ['settings', () => groq(q.SETTINGS_QUERY, 'production'), () => rails('/settings')],
  ['page slugs', () => groq(q.PAGE_SLUGS_QUERY, 'production'), () => rails('/pages/slugs')],
  ['posts', () => groq(q.POSTS_QUERY, 'production'), () => rails('/posts')],
  ['post slugs', () => groq(q.POST_SLUGS_QUERY, 'production'), () => rails('/posts/slugs')],
  ['projects', () => groq(q.PROJECTS_QUERY, 'production'), () => rails('/projects')],
  ['project slugs', () => groq(q.PROJECT_SLUGS_QUERY, 'production'), () => rails('/projects/slugs')],
  ...['home', ...slugs(q.PAGE_SLUGS_QUERY)].map((slug): (typeof checks)[number] => [
    `page ${slug}`, () => groq(q.PAGE_QUERY, 'production', { slug }), () => rails(`/pages/${slug}`),
  ]),
  ...slugs(q.POST_SLUGS_QUERY).map((slug): (typeof checks)[number] => [
    `post ${slug}`, () => groq(q.POST_QUERY, 'production', { slug }), () => rails(`/posts/${slug}`),
  ]),
  ...slugs(q.PROJECT_SLUGS_QUERY).map((slug): (typeof checks)[number] => [
    `project ${slug}`, () => groq(q.PROJECT_QUERY, 'production', { slug }), () => rails(`/projects/${slug}`),
  ]),
  ['spending plan', () => groq(q.SPENDING_PLAN_QUERY, 'private'), () => rails('/service/spending-plan', SERVICE_TOKEN)],
];

let failed = 0;
for (const [name, fromSanity, fromRails] of checks) {
  const diffs = differences(normalize(fromSanity()), normalize(await fromRails()));
  console.log(`${diffs.length ? 'DIFF' : 'same'}  ${name}`);
  for (const diff of diffs) console.log(`      ${diff.slice(0, 300)}`);
  if (diffs.length) failed++;
}

// Wrapped in an object: the CLI treats a bare 0 as "no results"
const { memberPages } = groq('{ "memberPages": count(*[_type == "memberPage"]) }', 'private') as { memberPages: number };
console.log(`\nMember pages in Sanity: ${memberPages} (compared by tests, not here)`);
process.exit(failed ? 1 : 0);
