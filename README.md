# Personal Website

A personal site built with **Angular 22**, with content served by a **Rails + PostgreSQL** API.
Pages are assembled from reusable sections (hero, rich text, project grid, …),
each rendered by its own Angular component. The site is prerendered to static HTML and hosted on
**AWS Amplify**.

```
personal-website/
├── web/        Angular app (prerendered/static, SCSS)
│   └── amplify/  Amplify Gen 2 backend: Cognito login + members API (finances, events)
├── api/        Content API: Rails + Postgres (pages, posts, projects, members pages, spending plan, images)
└── amplify.yml AWS Amplify build spec
```

## Prerequisites

- Node.js **24.15+** (`nvm use` reads `.nvmrc`)
- Docker (the content API and its database run in containers)

## Run locally

```sh
npm install                         # from the repo root (installs the workspaces)
cd api && docker compose up -d      # Content API → http://localhost:3000 (see api/README.md)
npm run dev:web                     # Website     → http://localhost:4200
```

The site reads `http://localhost:3000` unless a build sets `CONTENT_API_URL` (see Deploy).
To load content, import the sample content into the API (`api/README.md`).

## Editing content

Content lives in the content API's database and is edited at **`/admin`** (admins only: "Edit site"
in the account menu).

- **Pages, posts, projects and members pages** are edited in forms with a live preview
  ("Show preview") rendered by the site's own components. Rich text uses a word-processor style
  editor; images are uploaded or picked from the library, with alt text and a focal point
  (click the image) that crops keep in view.
- **Saving keeps a draft** only the admin sees. New documents stay hidden and deletions wait.
  **Publish** (`/admin`) makes every draft live and rebuilds the site through the branch's
  Amplify webhook (`AMPLIFY_WEBHOOK_URL` on the content API).
- **Site settings** are drafted and published the same way. The **spending plan** saves
  immediately: it isn't public and needs no rebuild.

Content was moved here from Sanity (no longer used) with the importer in `api/` (see `api/README.md`).

## How pages are built

| Content | URL | Angular component |
|---|---|---|
| Page with slug `home` | `/` | `pages/cms-page` |
| Page with any other slug | `/<slug>` | `pages/cms-page` |
| Blog post | `/blog/<slug>` (list at `/blog`) | `pages/blog/*` |
| Project | `/projects/<slug>` (list at `/projects`) | `pages/projects/*` |
| Site settings | header nav, footer, social links, default SEO | `layout/*` |
| Members page | `/members/<slug>` (list at `/members`), signed-in users only | `pages/members/*` |

Content comes from the content API (`web/src/app/core/content-api.ts`), typed in `core/models.ts`.
A page's **sections** are rendered by `web/src/app/blocks/block-renderer.ts`.
It looks up each section's `_type` in `blocks/block-registry.ts`.

### Adding a new block type

1. **Schema:** create `studio/schemaTypes/blocks/myBlock.ts` and add it to `studio/schemaTypes/blocks/index.ts`.
2. **API:** if the block contains links or references, resolve them in `sections` in
   `api/app/services/content_resolver.rb` (images are resolved everywhere automatically).
3. **Types:** add the block to `PageSection` in `web/src/app/core/models.ts`.
   `BLOCK_REGISTRY` won't compile until step 4 is done.
4. **Component:** create `web/src/app/blocks/my-block/my-block.ts` with a `block = input.required<SectionOf<'myBlock'>>()`.
   Register it in `block-registry.ts`.

### Styling

Global design tokens are CSS custom properties in `web/src/styles/_tokens.scss`, covering colors, spacing, type scale and dark mode.
Components use `@use 'mixins' as *;` for breakpoints (`@include from(md) { … }`).
Section themes (`theme-light`, `theme-dark` and `theme-accent`) remap the palette inside a block.

## Login and members-only content

Some content is only visible to signed-in users with the right **permission** (role):

| Role | Who | Sees |
|---|---|---|
| `admin` | you | everything |
| `wife` | | members pages shared with "Wife" |
| `neia-boiz` | | members pages shared with "NEIA Boiz" |

The site is static, so gated content can't be prerendered into it. Instead:

```
browser ──login──▶ Cognito (user pool, one group per role)
   │
   └──GET /members/pages/<slug> + access token──▶ content API (verifies the token,
                                                    filters by the user's groups)
```

- **Accounts are invite-only.** Self sign-up is disabled; you create users in the Cognito console.
- **Content:** each members page lists the groups that can see it (its *audiences*). Leave it empty for admin-only.
- **Roles** are defined in `web/src/app/core/auth/roles.ts`. To add one, add it there and to `groups` in
  `web/amplify/auth/resource.ts`, then redeploy.
- **Gating custom features:** for an Angular page that isn't a members page, protect the route with
  `canActivate: [requireRole('wife')]` (admins always pass). The guard only hides navigation,
  so any private *data* behind it must come from the members API (`web/amplify/`), never from the
  public content API or the bundle.
- Images on members pages are served by the content API at unguessable but public URLs.

### One-time setup

1. **Deploy the backend.** Locally, with AWS credentials configured (`aws configure` or `aws sso login`):
   ```sh
   cd web
   npx ampx sandbox secret set CONTENT_API_URL             # see "Family finances"
   npx ampx sandbox secret set CONTENT_API_SERVICE_TOKEN
   npx ampx sandbox --outputs-out-dir public                # deploys a personal sandbox and watches for changes
   ```
   `ng serve` now has login. Without a sandbox the site still runs, and "Log in" just doesn't show.
   For members pages locally, set `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` in `api/.env` to the
   sandbox's pool (`auth.user_pool_id` and `auth.user_pool_client_id` in `web/public/amplify_outputs.json`).
2. **Production (Amplify Hosting):**
   - Make sure the app's service role has the **AmplifyBackendDeployFullAccess** policy.
   - Members URLs are never prerendered, so they must load `/index.csr.html` with a 200.
     A catch-all `/<*>` → `/index.csr.html` rule with type `404-200` already does this. If your
     catch-all returns a real `404` instead, add these rules above it in **Hosting → Rewrites and redirects**:

     | Source | Target | Type |
     |---|---|---|
     | `/members` | `/index.csr.html` | `200 (Rewrite)` |
     | `/members/<*>` | `/index.csr.html` | `200 (Rewrite)` |

   The next push builds the backend (`amplify.yml` runs `ampx pipeline-deploy`) before the site.
3. **Create your admin account:** in the AWS console open **Cognito → User pools →** the `amplifyAuthUserPool…`
   pool → **Users → Create user**. Enter your email, choose **Send an email invitation**, then open the
   user and **Add user to group → admin**. On first login you'll be asked to set a new password.
   Do the same for anyone else with the `wife` or `neia-boiz` group.

If someone is added to a group while signed in, they need to log out and back in to pick it up.

## Family finances

| URL | Who | What |
|---|---|---|
| `/family/finances` | wife | This month's spending vs the stage target, a monthly trend, and budget by category |
| `/family/finances/upload` | admin | Upload a Chase statement PDF, check/fix categories, save |

**No financial data is in this repository** (it's public), and none is in the site bundle:

- **Plan**: budgets, stage targets and merchant patterns are the *Spending plan* in the Studio's
  private workspace.
- **Statements**: parsed transactions, stored in a DynamoDB table (`FinanceStatements`) that only the
  `finances` Lambda can read. The PDF is read in the browser on the upload page and never uploaded.
- **Access**: `GET /finances` (wife) returns monthly totals only; the admin endpoints return the
  merchant patterns and accept uploads. Both are checked in the Lambda, not just in the UI.
- **Tests** use made-up data. Keep it that way.

Each statement counts as a whole toward the month it closes in (Jan 2 – Feb 1 counts as February); statements are never split by day. A category can be **seasonal**: its monthly budget applies only in its *active months*, and *planned one-time purchases* (e.g. a season pass) are added to a given month's budget.
Each transaction gets the category whose longest merchant pattern it contains. When you pick a category
for a new merchant and leave **Remember** ticked, the pattern is added to the plan for later uploads.

**Setup:** the `finances` Lambda reads the plan from the content API with a shared service token.
Add two Amplify secrets for the branch: `CONTENT_API_URL` (that environment's content API, e.g.
`https://api.neiaboiz.com`) and `CONTENT_API_SERVICE_TOKEN` (the API's `SERVICE_TOKEN`). Do this before
deploying, because the backend build fails without them. For a sandbox, use `npx ampx sandbox secret set …`.

## NEIA Boiz events

`/events` (NEIA Boiz members, and admins) is for planning group get-togethers:

| URL | What |
|---|---|
| `/events` | Open polls (flags ones you haven't voted on), a month calendar of confirmed events, upcoming and past |
| `/events/new`, `/events/:id/edit` | Title, details, place, either several dates to poll or one set date, and email reminder times |
| `/events/:id` | Poll: everyone × each date (Yes / Maybe / No), best date highlighted, organizer confirms. Confirmed: RSVP, who's coming, Add to calendar (.ics) |

- **Who manages an event:** any member can create one. The organizer and admins can edit, confirm or cancel it.
- **Members** are everyone in the `neia-boiz` and `admin` Cognito groups. Each sets a display name the first time they visit.
- **Data** lives in the `GroupEvents` DynamoDB table, behind the members API. The `group-events` Lambda checks the role.
- **Emails** go one per person, from `events@neiaboiz.com`:
  - when a poll opens;
  - when a date is confirmed, changes or is cancelled;
  - at each reminder (default 1 week before; people who can't make it are skipped).
  - An EventBridge rule runs the Lambda every 15 minutes to send due reminders.
  - Times are Central, and all-day events count reminders back from 9 am.
- **Email design:** all emails, including the Cognito account invitation, use `web/amplify/shared/email-layout.ts`.
- **Discussion:** every event has comments and suggestions with nested replies and emoji reactions.
  - A top-level comment or suggestion emails the organizer, and a reply emails the parent comment's author.
  - The organizer can accept or decline suggestions.
  - Comments are their own table items, listed through the `byEvent` index.
- **Invitations:** an event is for everyone in NEIA Boiz or for specific people (the organizer is always invited).
  - With a list, the organizer chooses whether only invitees can see the event, or all members can see it while only invitees get emails, vote and RSVP.
  - Hidden events act as missing for everyone else (admins can still see them).
  - People added later get the invitation email. The calendar feed only includes events you're invited to.
- **Discord:** new polls and new set-date events for **everyone** are posted to a Discord channel via a webhook: title, dates (plus a poll's deadline) and a link that needs a login. No location or details, and no pings. Events for specific people are never posted. The webhook URL is the Amplify secret `DISCORD_WEBHOOK_URL`, and a failed post never blocks creating the event. Only the `main` and `qa` branches post, each to its own channel: set the secret **per branch** (QA's points at a test channel), not as a shared secret, which every branch would fall back to. Sandboxes never post. There's no fallback channel: if a post fails (no webhook for the branch, a deleted webhook, rate limiting, Discord down), everyone in the `admin` group gets an email saying which event and branch, and how to fix it. Secrets load when the function starts, so after changing the URL choose **Redeploy this version** on the latest `main` build to apply it right away. Don't delete the secret: deploys check that it exists.
- **Joining:** on a visible event with an invite list, any member can **Join** (added to the list, organizer emailed under "Activity on my events"). Anyone on the list except the organizer can **Leave**, which removes their votes and RSVP. Hidden events can't be joined.
- **Poll deadlines:** off by default. The organizer can set a "voting closes" date and time; with no time, it closes at 11:59 PM Central.
  - After the deadline, the server stops accepting votes.
  - The 15-minute job emails the organizer the results once (best date first, plus who didn't vote).
  - Changing the deadline reopens voting.
- **Attachments:** each event can have one cover image (resized in the browser, shown on the event and as a list thumbnail) and up to 5 files of up to 10 MB each.
  - The organizer or an admin adds and removes them on the event page.
  - Browsers upload straight to the private bucket with a signed PUT link into `pending/` (unfinished uploads expire after a day). The Lambda checks the size, then moves the file under `events/` and attaches it.
  - Downloads use signed links, given only to people who can see the event.
- **Date ranges:** any date option, in a poll or as a set date, can be one day or a range of up to 30 days. Times then apply to the first and last day. The calendar shows the event on every day of the range.
- **Calendars:**
  - Each confirmed event has "Add to Google Calendar" and an `.ics` download for Apple and Outlook.
  - On `/profile`, members can subscribe to a private feed (`/calendar/{member}/{token}.ics`, no login, signed per member) that Google and Apple Calendar keep in sync. It includes confirmed events, with cancelled ones marked as cancelled.
- **Restore:** the organizer or an admin can restore a cancelled event, either emailing everyone or quietly. It goes back to exactly what it was: a poll or a confirmed event.
- **Profiles (`/profile`):**
  - display name and photo; photos sit in a private S3 bucket, served by signed links;
  - email preferences per type, plus "unsubscribe from all".
  - Every email has a signed "Unsubscribe" link that works without logging in (`/unsubscribe`, backed by the API's only unauthenticated route), plus a `List-Unsubscribe` header.

**Email setup (once):**
1. Sending uses the existing `neiaboiz.com` SES identity in us-east-2. It's already verified with DKIM and a custom MAIL FROM domain (`admin.neiaboiz.com`) and isn't managed by this app.
2. While SES is in its *sandbox*, emails only reach verified addresses. In the SES console (us-east-2), choose **Request production access**, describe it as transactional notifications to a small invite-only group, and submit. Approval usually takes about a day.
3. Optional: once out of the sandbox, Cognito can send invitations from `@neiaboiz.com` instead of its default sender. Set `senders.email` in `web/amplify/auth/resource.ts`.

## Scripts (repo root)

| Script | What it does |
|---|---|
| `npm run dev:web` | Start the website dev server |
| `npm run build:web` | Prerender the site to `web/dist/web/browser` |
| `npm test` | Run the Angular unit tests (Vitest) |

## Deploy

### Website on AWS Amplify

1. Push this repo to GitHub, GitLab, Bitbucket or CodeCommit.
2. In the AWS Amplify console, choose **Create new app**, pick the repo and branch, and tick **"My app is a monorepo"** with root `web`.
   Amplify picks up `amplify.yml` automatically.
3. Under **Hosting → Environment variables**, set `CONTENT_API_URL` for the branch to its content API.
   The build prerenders from it and fails if it's missing or unreachable. The API's `CORS_ORIGINS`
   must include the site's domain(s).
4. Under **Hosting → Rewrites and redirects**, add a rule so unknown URLs get the client-side 404 page:

   | Source | Target | Type |
   |---|---|---|
   | `/<*>` | `/index.csr.html` | `404 (Rewrite)` |


### Rebuild when content changes

The site is static, so content changes go live on the next build. After importing content into a
branch's content API, start a build in Amplify (**Redeploy this version** on the latest build).
