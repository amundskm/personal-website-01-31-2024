# Personal Website

A personal site built with **Angular 22** and **Sanity** as a headless, block-based CMS.
Pages are assembled in Sanity Studio from reusable sections (hero, rich text, project grid, …),
each rendered by its own Angular component. The site is prerendered to static HTML and hosted on
**AWS Amplify**.

```
personal-website/
├── web/        Angular app (prerendered/static, SCSS)
│   └── amplify/  Amplify Gen 2 backend: Cognito login + members-only content API
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
| Members page *(private dataset)* | `/members/<slug>` (list at `/members`), signed-in users only | `pages/members/*` |

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

## Login and members-only content

Some content is only visible to signed-in users with the right **permission** (role):

| Role | Who | Sees |
|---|---|---|
| `admin` | you | everything |
| `wife` | | members pages shared with "Wife" |
| `neia-boiz` | | members pages shared with "NEIA Boiz" |

The site is static and the `production` dataset is public, so gated content can't live there.
Instead:

```
browser ──login──▶ Cognito (user pool, one group per role)
   │
   └──GET /pages/<slug> + access token──▶ API Gateway (verifies the token)
                                              └──▶ Lambda ──read token──▶ Sanity "private" dataset
                                                    (filters by the user's groups)
```

- **Accounts are invite-only.** Self sign-up is disabled; you create users in the Cognito console.
- **Content** is edited in the Studio's **"Members only (private)"** workspace (switch workspaces top-left).
  Each *Members page* has a **"Who can see this?"** checklist. Leave it empty for admin-only.
- **Roles** are defined in `web/src/app/core/auth/roles.ts`. To add one, add it there, to `groups` in
  `web/amplify/auth/resource.ts` and to `AUDIENCES` in `studio/schemaTypes/documents/memberPage.ts`, then redeploy.
- **Gating custom features:** for an Angular page that isn't a Sanity members page, protect the route with
  `canActivate: [requireRole('wife')]` (admins always pass). The guard only hides navigation,
  so any private *data* behind it must come from the members API (`web/amplify/`), never from the
  public dataset or the bundle.
- Images uploaded to the private dataset are served from Sanity's CDN at unguessable but public URLs.

### One-time setup

1. **Create the private dataset and a read token:**
   ```sh
   cd studio
   npx sanity dataset create private --visibility private
   ```
   In https://www.sanity.io/manage go to **API → Tokens → Add API token** and create a **Viewer** token.
2. **Deploy the backend.** Locally, with AWS credentials configured (`aws configure` or `aws sso login`):
   ```sh
   cd web
   npx ampx sandbox secret set SANITY_PRIVATE_READ_TOKEN   # paste the Viewer token
   npx ampx sandbox --outputs-out-dir public                # deploys a personal sandbox and watches for changes
   ```
   `ng serve` now has login. Without a sandbox the site still runs, and "Log in" just doesn't show.
3. **Production (Amplify Hosting):**
   - In **Hosting → Secrets**, add `SANITY_PRIVATE_READ_TOKEN` (the Viewer token).
   - Make sure the app's service role has the **AmplifyBackendDeployFullAccess** policy.
   - Members URLs are never prerendered, so they must load `/index.csr.html` with a 200.
     A catch-all `/<*>` → `/index.csr.html` rule with type `404-200` already does this. If your
     catch-all returns a real `404` instead, add these rules above it in **Hosting → Rewrites and redirects**:

     | Source | Target | Type |
     |---|---|---|
     | `/members` | `/index.csr.html` | `200 (Rewrite)` |
     | `/members/<*>` | `/index.csr.html` | `200 (Rewrite)` |

   The next push builds the backend (`amplify.yml` runs `ampx pipeline-deploy`) before the site.
4. **Create your admin account:** in the AWS console open **Cognito → User pools →** the `amplifyAuthUserPool…`
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

**Setup:** in https://www.sanity.io/manage create an **Editor** API token, then add it as the Amplify secret
`SANITY_PRIVATE_WRITE_TOKEN`. Do this before deploying, because the backend build fails without it.
For a sandbox, use `npx ampx sandbox secret set SANITY_PRIVATE_WRITE_TOKEN`.

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
- **Discord:** new polls and new set-date events for **everyone** are posted to a Discord channel via a webhook: title, dates (plus a poll's deadline) and a link that needs a login. No location or details, and no pings. Events for specific people are never posted. The webhook URL is the Amplify secret `DISCORD_WEBHOOK_URL`, and a failed post never blocks creating the event. Secrets load when the function starts, so after changing the URL choose **Redeploy this version** on the latest `main` build to apply it right away. Don't delete the secret: deploys check that it exists.
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
