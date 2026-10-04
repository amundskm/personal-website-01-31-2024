# Personal Website

A personal site built with **Angular 22** and **Sanity** as a headless, block-based CMS.
Pages are assembled in Sanity Studio from reusable sections (hero, rich text, project grid, …),
each rendered by its own Angular component. The site is prerendered to static HTML and hosted on
**AWS Amplify**.

```
personal-website/
├── web/        Angular app (prerendered/static, SCSS)
├── studio/     Sanity Studio (content editor + schemas)
└── amplify.yml AWS Amplify build spec
```

## Prerequisites

- Node.js **24.15+** (`nvm use` reads `.nvmrc`)
- A free Sanity account: https://www.sanity.io

## 1. Connect Sanity

1. Create a project at https://www.sanity.io/manage and copy its **Project ID**.
2. Configure the Studio:
   ```sh
   cp studio/.env.example studio/.env   # then set SANITY_STUDIO_PROJECT_ID
   ```
3. Configure the website: set `projectId` in `web/src/app/core/sanity.config.ts`.
   The ID is public, so committing it is fine.
4. Log in, create the dataset and allow the dev server to query it:
   ```sh
   cd studio
   npx sanity login
   npx sanity dataset create production        # skip if it already exists
   npx sanity cors add http://localhost:4200 --no-credentials
   ```
5. *(Optional)* Import sample content: a home page, an about page, posts, projects and site settings.
   ```sh
   npx sanity dataset import seed/sample-content.ndjson production --replace
   ```

## 2. Run locally

```sh
npm install           # from the repo root (installs both workspaces)
npm run dev:studio    # Studio  → http://localhost:3333
npm run dev:web       # Website → http://localhost:4200
```

Publish a change in the Studio and refresh the site to see it.
In dev mode the site queries Sanity live.

## How pages are built

| Studio document | URL | Angular component |
|---|---|---|
| Page with slug `home` | `/` | `pages/cms-page` |
| Page with any other slug | `/<slug>` | `pages/cms-page` |
| Blog post | `/blog/<slug>` (list at `/blog`) | `pages/blog/*` |
| Project | `/projects/<slug>` (list at `/projects`) | `pages/projects/*` |
| Site settings | header nav, footer, social links, default SEO | `layout/*` |

A page's **sections** are rendered by `web/src/app/blocks/block-renderer.ts`.
It looks up each section's `_type` in `blocks/block-registry.ts`.

### Adding a new block type

1. **Schema:** create `studio/schemaTypes/blocks/myBlock.ts` and add it to `studio/schemaTypes/blocks/index.ts`.
2. **Query:** if the block contains images, links or references, project them in `PAGE_QUERY` (`web/src/app/core/queries.ts`).
3. **Types:** run `npm run typegen` to regenerate `web/src/app/core/sanity.types.ts`.
   `BLOCK_REGISTRY` won't compile until step 4 is done.
4. **Component:** create `web/src/app/blocks/my-block/my-block.ts` with a `block = input.required<SectionOf<'myBlock'>>()`.
   Register it in `block-registry.ts`.

### Styling

Global design tokens are CSS custom properties in `web/src/styles/_tokens.scss`, covering colors, spacing, type scale and dark mode.
Components use `@use 'mixins' as *;` for breakpoints (`@include from(md) { … }`).
Section themes (`theme-light`, `theme-dark` and `theme-accent`) remap the palette inside a block.

## Scripts (repo root)

| Script | What it does |
|---|---|
| `npm run dev:web` / `dev:studio` | Start the website / Studio dev servers |
| `npm run build:web` | Prerender the site to `web/dist/web/browser` |
| `npm test` | Run the Angular unit tests (Vitest) |
| `npm run typegen` | Regenerate TypeScript types from the schemas and GROQ queries |
| `npm run deploy:studio` | Deploy the Studio to `https://<name>.sanity.studio` |

## 3. Deploy

### Studio

```sh
npm run deploy:studio
```

The first deploy asks you to pick a hostname, e.g. `yourname.sanity.studio`.
Add that URL as a CORS origin with credentials: `npx sanity cors add https://yourname.sanity.studio --credentials`.

### Website on AWS Amplify

1. Push this repo to GitHub, GitLab, Bitbucket or CodeCommit.
2. In the AWS Amplify console, choose **Create new app**, pick the repo and branch, and tick **"My app is a monorepo"** with root `web`.
   Amplify picks up `amplify.yml` automatically.
3. Under **Hosting → Rewrites and redirects**, add a rule so unknown URLs get the client-side 404 page:

   | Source | Target | Type |
   |---|---|---|
   | `/<*>` | `/index.csr.html` | `404 (Rewrite)` |

4. Add your production domain as a Sanity CORS origin:
   `npx sanity cors add https://your-domain.com --no-credentials`.

### Rebuild when content is published

The site is static, so content changes go live on the next build.
To rebuild automatically on publish:

1. In Amplify, go to **Hosting → Build settings → Incoming webhooks**, create a webhook for your branch and copy its URL.
2. In https://www.sanity.io/manage, go to **API → Webhooks → Create webhook** and set:
   - **URL:** the Amplify webhook URL
   - **Dataset:** `production`
   - **Trigger on:** Create, Update, Delete
   - **Filter:** `_type in ["page", "post", "project", "siteSettings"]`
   - **HTTP method:** POST

Publishing in the Studio now redeploys the site in a couple of minutes.
