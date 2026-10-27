# API

Rails API that serves the website's content (replacing Sanity): pages, posts,
projects, site settings, members-only pages and the spending plan, plus images.
Responses keep the shapes the old GROQ queries returned, so the Angular
components didn't need to change.

## Run locally

Needs Docker. From `api/`:

```sh
cp .env.example .env           # optional: Cognito ids for /members, SERVICE_TOKEN for /service
docker compose up              # Postgres + API on http://localhost:3000
docker compose run --rm api bin/rails test
```

Load content from a Sanity export (`db/import/` is git-ignored):

```sh
docker compose run --rm api bin/rails "sanity:import[db/import/production]"   # extracted export dir
docker compose run --rm api bin/rails "sanity:import[db/import/sample.ndjson]" # or a bare .ndjson
```

## Endpoints

| Route | Auth | Returns |
|---|---|---|
| `GET /settings` | public | Site settings (navigation, footer, default SEO) |
| `GET /pages/slugs`, `/pages/:slug` | public | Page slugs to prerender (not `home`); one page with resolved sections |
| `GET /posts`, `/posts/slugs`, `/posts/:slug` | public | Post cards newest first; slugs; one post |
| `GET /projects`, `/projects/slugs`, `/projects/:slug` | public | Project cards in display order; slugs; one project |
| `GET /images/:id?w=&h=&crop=&hotspot=` | public | Resized WebP (cropped around the hotspot when `h` is set) |
| `GET /members/pages`, `/members/pages/:slug` | Cognito access token | Member pages shared with the caller's groups (admins: all) |
| `GET /service/spending-plan` | `SERVICE_TOKEN` | Spending plan for the finances Lambda |
| `POST /service/spending-plan/rules` | `SERVICE_TOKEN` | Remember merchant patterns: `{ rules: [{ categoryKey, pattern }] }` |

## How content is stored

Each table has columns for the fields that are queried or sorted on (slug,
`published_at`, `featured`, `position`, `audiences`). Nested structures
(sections, rich text, links, image usages) are JSON, in the shape Sanity
stored them, including references: `asset: { _ref }` for images and
`internal: { _ref }` for links. `ContentResolver` swaps those references for
image URLs and slugs when building a response.

## Configuration

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Postgres connection |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | Verify members' access tokens (each environment has its own pool) |
| `SERVICE_TOKEN` | Shared secret for `/service/*` |
| `CORS_ORIGINS` | Comma-separated site origins allowed to call the API |
| `PUBLIC_API_URL` | Public origin used in image URLs (defaults to the request's) |
