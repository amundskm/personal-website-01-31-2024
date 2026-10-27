import { ROLE_LABELS, ROLES } from '../core/auth/roles';
import {
  asList,
  asObject,
  type Field,
  type JsonObject,
  type ObjectType,
  type Option,
  richTextSummary,
} from './schema';

// The admin's forms, one per document type, plus the page sections. These
// replace the Sanity Studio schemas (studio/schemaTypes) field for field.

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const THEMES: Option[] = [
  { value: 'light', title: 'Denim' },
  { value: 'dark', title: 'Midnight' },
  { value: 'accent', title: 'Arcane glow' },
];

const MONTHS: Option[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
  (title, i) => ({ value: i + 1, title }),
);

const plain = (...values: string[]): Option[] => values.map((value) => ({ value, title: value }));

const theme = (initial: string): Field => ({
  name: 'theme',
  title: 'Theme',
  kind: 'select',
  options: THEMES,
  radio: true,
  initial,
});

// ---------------------------------------------------------------------------
// Shared objects
// ---------------------------------------------------------------------------

export const LINK: ObjectType = {
  type: 'link',
  title: 'Link',
  fields: [
    { name: 'label', title: 'Label', kind: 'string', required: true },
    {
      name: 'kind',
      title: 'Links to',
      kind: 'select',
      radio: true,
      options: [
        { value: 'internal', title: 'Page on this site' },
        { value: 'external', title: 'External URL' },
      ],
      initial: 'internal',
    },
    {
      name: 'internal',
      title: 'Page',
      kind: 'reference',
      to: ['page', 'post', 'project'],
      hidden: (link) => link['kind'] === 'external',
    },
    {
      name: 'path',
      title: 'Path',
      kind: 'string',
      help: 'Optional: link to a fixed route such as /blog or /projects instead of a page.',
      hidden: (link) => link['kind'] === 'external',
    },
    { name: 'url', title: 'URL', kind: 'url', hidden: (link) => link['kind'] !== 'external' },
    {
      name: 'style',
      title: 'Style',
      kind: 'select',
      radio: true,
      options: plain('primary', 'secondary', 'text'),
      help: 'How the link looks when shown as a button.',
      initial: 'primary',
    },
  ],
  summary: (link) => text(link['label']) || 'Link',
};

const SEO: Field = {
  name: 'seo',
  title: 'SEO',
  kind: 'object',
  collapsed: true,
  fields: [
    {
      name: 'title',
      title: 'Meta title',
      kind: 'string',
      help: 'Overrides the title in search results and browser tabs. Keep it under 70 characters.',
    },
    {
      name: 'description',
      title: 'Meta description',
      kind: 'text',
      rows: 3,
      help: 'Keep it under 160 characters.',
    },
    { name: 'image', title: 'Social share image', kind: 'image', help: 'Cropped to 1200×630.' },
    { name: 'noIndex', title: 'Hide from search engines', kind: 'boolean' },
  ],
};

const IMAGE_HELP = 'Click the preview to set the focal point: crops keep it in view.';

// ---------------------------------------------------------------------------
// Page sections
// ---------------------------------------------------------------------------

const column = (name: string, title: string): Field => ({
  name,
  title,
  kind: 'object',
  fields: [
    { name: 'content', title: 'Text', kind: 'richText' },
    { name: 'image', title: 'Image', kind: 'image', caption: true, help: 'Shown instead of the text when set.' },
  ],
});

export const BLOCKS: ObjectType[] = [
  {
    type: 'heroBlock',
    title: 'Hero',
    summary: (b) => text(b['heading']),
    fields: [
      { name: 'eyebrow', title: 'Eyebrow', kind: 'string', help: 'Small text above the heading.' },
      { name: 'heading', title: 'Heading', kind: 'string', required: true },
      { name: 'tagline', title: 'Tagline', kind: 'string', help: 'A short punchline shown in gold under the heading.' },
      { name: 'subheading', title: 'Subheading', kind: 'text', rows: 3 },
      { name: 'image', title: 'Image', kind: 'image', caption: true, help: IMAGE_HELP },
      {
        name: 'showMascot',
        title: 'Show wizard mascot',
        kind: 'boolean',
        help: 'Shows the wizard beside the heading.',
        hidden: (b) => !!asObject(b['image'])['asset'],
      },
      { name: 'buttons', title: 'Buttons', kind: 'list', of: LINK, help: 'Up to three.' },
      { name: 'layout', title: 'Layout', kind: 'select', radio: true, options: plain('centered', 'split'), initial: 'centered' },
      theme('light'),
    ],
  },
  {
    type: 'richTextBlock',
    title: 'Rich text',
    summary: (b) => richTextSummary(b['content']),
    fields: [
      { name: 'content', title: 'Text', kind: 'richText' },
      { name: 'width', title: 'Width', kind: 'select', radio: true, options: plain('narrow', 'wide'), initial: 'narrow' },
    ],
  },
  {
    type: 'imageBlock',
    title: 'Image',
    summary: (b) => text(asObject(b['image'])['caption']) || text(asObject(b['image'])['alt']),
    fields: [
      { name: 'image', title: 'Image', kind: 'image', caption: true, required: true, help: IMAGE_HELP },
      { name: 'width', title: 'Width', kind: 'select', radio: true, options: plain('content', 'wide', 'full'), initial: 'content' },
    ],
  },
  {
    type: 'twoColumnBlock',
    title: 'Two columns',
    summary: (b) => text(b['heading']),
    fields: [
      { name: 'heading', title: 'Heading', kind: 'string' },
      {
        name: 'layout',
        title: 'Layout',
        kind: 'select',
        radio: true,
        options: [
          { value: 'even', title: 'Even columns' },
          { value: 'aside', title: 'Text with sidebar' },
        ],
        help: 'Text with sidebar lines the left column up with the other text and moves the right column into the margin.',
        initial: 'even',
      },
      column('left', 'Left column'),
      column('right', 'Right column'),
      {
        name: 'verticalAlign',
        title: 'Vertical alignment',
        kind: 'select',
        radio: true,
        options: plain('top', 'center'),
        initial: 'center',
        hidden: (b) => b['layout'] === 'aside',
      },
      {
        name: 'reverseOnMobile',
        title: 'Right column first on small screens',
        kind: 'boolean',
        hidden: (b) => b['layout'] === 'aside',
      },
    ],
  },
  {
    type: 'projectGridBlock',
    title: 'Project grid',
    summary: (b) => text(b['heading']) || `Projects (${text(b['mode']) || 'featured'})`,
    fields: [
      { name: 'heading', title: 'Heading', kind: 'string' },
      { name: 'intro', title: 'Intro', kind: 'text', rows: 2 },
      {
        name: 'mode',
        title: 'Projects',
        kind: 'select',
        radio: true,
        options: [
          { value: 'featured', title: 'Featured projects' },
          { value: 'all', title: 'All projects' },
          { value: 'manual', title: 'Pick manually' },
        ],
        initial: 'featured',
      },
      { name: 'projects', title: 'Projects', kind: 'references', to: ['project'], hidden: (b) => b['mode'] !== 'manual' },
      {
        name: 'limit',
        title: 'Maximum projects',
        kind: 'number',
        initial: 6,
        hidden: (b) => b['mode'] === 'manual',
      },
      { name: 'showViewAll', title: 'Show "View all" link', kind: 'boolean', initial: true },
    ],
  },
  {
    type: 'postListBlock',
    title: 'Latest posts',
    summary: (b) => text(b['heading']) || 'Latest posts',
    fields: [
      { name: 'heading', title: 'Heading', kind: 'string', initial: 'Latest writing' },
      { name: 'count', title: 'Number of posts', kind: 'number', initial: 3, help: '1 to 12.' },
      { name: 'showViewAll', title: 'Show "View all" link', kind: 'boolean', initial: true },
    ],
  },
  {
    type: 'skillsBlock',
    title: 'Skills',
    summary: (b) => text(b['heading']) || 'Skills',
    fields: [
      { name: 'heading', title: 'Heading', kind: 'string', initial: 'Skills' },
      { name: 'intro', title: 'Intro', kind: 'text', rows: 2 },
      {
        name: 'groups',
        title: 'Skill groups',
        kind: 'list',
        help: 'For example "Software" and "Making". Each group shows its skills as tags.',
        of: {
          type: 'skillGroup',
          title: 'Skill group',
          summary: (g) => text(g['title']),
          fields: [
            { name: 'title', title: 'Title', kind: 'string', required: true },
            { name: 'skills', title: 'Skills', kind: 'tags' },
          ],
        },
      },
      theme('light'),
    ],
  },
  {
    type: 'ctaBlock',
    title: 'Call to action',
    summary: (b) => text(b['heading']),
    fields: [
      { name: 'heading', title: 'Heading', kind: 'string', required: true },
      { name: 'text', title: 'Text', kind: 'text', rows: 3 },
      { name: 'button', title: 'Button', kind: 'object', fields: LINK.fields },
      theme('accent'),
    ],
  },
];

/** Blocks that list public posts/projects make no sense on members pages. */
const PUBLIC_ONLY_BLOCKS = new Set(['projectGridBlock', 'postListBlock']);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type Collection = 'pages' | 'posts' | 'projects' | 'member-pages';

export interface DocumentSchema {
  title: string;
  singular: string;
  fields: Field[];
  /** Where the document appears on the site. */
  path: (doc: JsonObject) => string;
}

const slugField = (help: string, prefix: string): Field => ({
  name: 'slug',
  title: 'Slug',
  kind: 'slug',
  source: 'title',
  prefix,
  required: true,
  help,
});

export const DOCUMENTS: Record<Collection, DocumentSchema> = {
  pages: {
    title: 'Pages',
    singular: 'page',
    path: (doc) => (doc['slug'] === 'home' ? '/' : `/${text(doc['slug'])}`),
    fields: [
      { name: 'title', title: 'Title', kind: 'string', required: true },
      slugField('Use "home" for the homepage. Other pages are served at /<slug>.', '/'),
      { name: 'sections', title: 'Page sections', kind: 'blocks', of: BLOCKS },
      SEO,
    ],
  },
  posts: {
    title: 'Blog posts',
    singular: 'post',
    path: (doc) => `/blog/${text(doc['slug'])}`,
    fields: [
      { name: 'title', title: 'Title', kind: 'string', required: true },
      slugField('Served at /blog/<slug>.', '/blog/'),
      { name: 'excerpt', title: 'Excerpt', kind: 'text', rows: 3, help: 'Short summary shown in post lists.' },
      { name: 'coverImage', title: 'Cover image', kind: 'image', caption: true, help: IMAGE_HELP },
      { name: 'body', title: 'Body', kind: 'richText' },
      { name: 'publishedAt', title: 'Published', kind: 'datetime', required: true, initial: () => new Date().toISOString() },
      { name: 'tags', title: 'Tags', kind: 'tags' },
      SEO,
    ],
  },
  projects: {
    title: 'Projects',
    singular: 'project',
    path: (doc) => `/projects/${text(doc['slug'])}`,
    fields: [
      { name: 'title', title: 'Title', kind: 'string', required: true },
      slugField('Served at /projects/<slug>.', '/projects/'),
      { name: 'summary', title: 'Summary', kind: 'text', rows: 3, help: 'One or two sentences shown on project cards.' },
      { name: 'coverImage', title: 'Cover image', kind: 'image', caption: true, help: IMAGE_HELP },
      { name: 'body', title: 'Body', kind: 'richText' },
      { name: 'gallery', title: 'Gallery', kind: 'images' },
      { name: 'techStack', title: 'Tech stack', kind: 'tags' },
      { name: 'repoUrl', title: 'Repository URL', kind: 'url' },
      { name: 'liveUrl', title: 'Live URL', kind: 'url' },
      { name: 'year', title: 'Year', kind: 'number' },
      { name: 'featured', title: 'Featured', kind: 'boolean', help: 'Featured projects appear in "featured" project grids.' },
      { name: 'order', title: 'Order', kind: 'number', help: 'Lower numbers are shown first.', initial: 100 },
      SEO,
    ],
  },
  'member-pages': {
    title: 'Members pages',
    singular: 'members page',
    path: (doc) => `/members/${text(doc['slug'])}`,
    fields: [
      { name: 'title', title: 'Title', kind: 'string', required: true },
      slugField('Served at /members/<slug>.', '/members/'),
      {
        name: 'audiences',
        title: 'Who can see this?',
        kind: 'checkboxes',
        // Every permission group; admins can always see every page
        options: ROLES.filter((role) => role !== 'admin').map((role) => ({ value: role, title: ROLE_LABELS[role] })),
        help: 'Leave empty for admin-only.',
      },
      { name: 'summary', title: 'Summary', kind: 'text', rows: 2, help: 'Shown on the members home page.' },
      { name: 'sections', title: 'Page sections', kind: 'blocks', of: BLOCKS.filter((b) => !PUBLIC_ONLY_BLOCKS.has(b.type)) },
    ],
  },
};

export const SETTINGS_FIELDS: Field[] = [
  { name: 'title', title: 'Site title', kind: 'string', required: true },
  { name: 'description', title: 'Default meta description', kind: 'text', rows: 3 },
  { name: 'navigation', title: 'Navigation', kind: 'list', of: LINK, help: 'Links shown in the site header.' },
  {
    name: 'socialLinks',
    title: 'Social links',
    kind: 'list',
    of: {
      type: 'socialLink',
      title: 'Social link',
      summary: (s) => text(s['label']) || text(s['platform']),
      fields: [
        {
          name: 'platform',
          title: 'Platform',
          kind: 'select',
          options: plain('github', 'linkedin', 'x', 'bluesky', 'mastodon', 'youtube', 'email', 'other'),
          required: true,
        },
        { name: 'label', title: 'Label', kind: 'string' },
        { name: 'url', title: 'URL', kind: 'url', required: true },
      ],
    },
  },
  { name: 'footerText', title: 'Footer text', kind: 'string' },
  { ...SEO, title: 'Default SEO' },
];

const dollars = (value: unknown) => `$${typeof value === 'number' ? value : 0}`;

export const SPENDING_PLAN_FIELDS: Field[] = [
  {
    name: 'categories',
    title: 'Categories',
    kind: 'list',
    help: 'Budget lines. Removing one moves its past spending to "Uncategorized" on the dashboard.',
    of: {
      type: 'budgetCategory',
      title: 'Category',
      summary: (c) =>
        `${text(c['name'])} · ${dollars(c['monthlyBudget'])}/mo · ${asList(c['merchantPatterns']).length} merchant patterns`,
      fields: [
        { name: 'name', title: 'Name', kind: 'string', required: true },
        { name: 'monthlyBudget', title: 'Monthly budget ($)', kind: 'number', required: true },
        {
          name: 'merchantPatterns',
          title: 'Merchant patterns',
          kind: 'tags',
          help: 'Statement descriptions containing any of these (ignoring case) go in this category. The longest match wins.',
        },
        {
          name: 'activeMonths',
          title: 'Active months',
          kind: 'checkboxes',
          options: MONTHS,
          help: 'For seasonal spending: the budget only applies in these months. Leave empty for every month.',
        },
        {
          name: 'plannedPurchases',
          title: 'Planned one-time purchases',
          kind: 'list',
          help: "Added to that month's budget every year, e.g. a season pass in March.",
          of: {
            type: 'plannedPurchase',
            title: 'Planned purchase',
            summary: (p) =>
              `${text(p['label'])} · ${MONTHS.find((m) => m.value === p['month'])?.title ?? '?'} · ${dollars(p['amount'])}`,
            fields: [
              { name: 'label', title: 'Label', kind: 'string', required: true },
              { name: 'month', title: 'Month', kind: 'select', options: MONTHS, required: true },
              { name: 'amount', title: 'Amount ($)', kind: 'number', required: true },
            ],
          },
        },
      ],
    },
  },
  {
    name: 'stages',
    title: 'Rollout stages',
    kind: 'list',
    help: "A statement month's target comes from the latest stage started by the end of that month.",
    of: {
      type: 'planStage',
      title: 'Stage',
      summary: (s) => `${text(s['label'])} · from ${text(s['startDate']) || '?'} · ${dollars(s['monthlyTarget'])}/mo`,
      fields: [
        { name: 'label', title: 'Label', kind: 'string', required: true },
        { name: 'startDate', title: 'Start date', kind: 'date', required: true },
        { name: 'monthlyTarget', title: 'Monthly target ($)', kind: 'number', required: true },
      ],
    },
  },
];
