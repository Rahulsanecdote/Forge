# Scheduled jobs (Inngest)

Forge ships three cron jobs defined in `src/inngest/functions.ts` and served via
`src/inngest/server.ts`. They use [Inngest](https://www.inngest.com/) for
scheduling and durable, retryable steps.

## The three jobs

### `weekly-content`

- **Schedule:** `FORGE_CONTENT_CRON` (default `0 9 * * 1` — Mondays 09:00 UTC).
- **What it does:** for every client, calls `runForge` with a task asking for
  next week's social posts (about 3), choosing a fitting weekly theme and staying
  on brand.
- **Durability:** each client runs in its own `step.run(\`content-${slug}\`)`, so
  if the function retries, already-completed clients are memoized and not re-run.

### `review-sweep`

- **Schedule:** `FORGE_REVIEW_CRON` (default `0 8 * * *` — daily 08:00 UTC).
- **What it does:** for each client, selects `reviews` rows with `status = 'new'`,
  calls `draft_review_responses`, and writes the drafts back. Before drafting,
  it attempts to import fresh Google Business Profile reviews for any client
  with a configured GBP account/location ID.
- **Correctness guarantees:**
  - A review is marked `status = 'drafted'` **only when the model returned a
    usable reply**. Malformed or short output leaves the row `new`, so a later
    sweep retries it instead of silently dropping it.
  - Supabase update errors are checked and **thrown**, so Inngest retries the step
    rather than recording a false success.
- Returns the count of reviews imported and actually drafted.

### `scheduled-publish`

- **Schedule:** `FORGE_PUBLISH_CRON` (default `*/15 * * * *` — every 15 minutes).
- **What it does:** loads `content_schedules` rows that are `pending` with
  `scheduled_for <= now()`, and publishes each one's approved run to its platform
  (Google Business, Facebook, or Instagram).
- **How it publishes:** through `publishApprovedRun` — the *same* fail-closed path
  as the dashboard's immediate "Publish" button. It re-checks the approval and
  banned-phrase compliance, is idempotent against prior `published_url` evidence,
  and records one `published_url` evidence row per live post.
- **Correctness guarantees:**
  - Each due schedule is **claimed atomically** (`pending → publishing`, guarded by
    the status). Overlapping cron runs can't publish the same run twice.
  - Each schedule publishes in its own `step.run(\`publish-${id}\`)`, so a retry
    memoizes already-finished rows instead of re-posting.
  - The terminal status is `published` (including the idempotent
    already-published case) or `failed` (with `last_error` set to the publish
    outcome). A failed schedule can be re-armed by scheduling the run again.
- Returns `{ due, published, failed }`.

An operator sets a schedule from a run's **Publishing Package** panel: once a run
is approved and unpublished, pick a future time (interpreted as UTC) and
**Schedule publish**, or **Cancel schedule** to un-arm a pending one. Scheduling
applies the same gates as immediate publishing, so it never queues something that
can't go live (unsupported platform, banned phrase, already published, or — for
Instagram — a post missing its generated image).

## Running them locally

You need the `reviews` table applied (it's in the core migrations) and two
terminals:

```bash
# Terminal A — serve Forge's Inngest endpoint on :3030
npm run forge:serve
# → "Forge Inngest endpoint: http://localhost:3030/api/inngest"

# Terminal B — Inngest dev server discovers the endpoint and runs the crons
npx inngest-cli@latest dev
```

Open the Inngest dev dashboard (prints its URL, usually
`http://localhost:8288`). From there you can **trigger functions manually**
instead of waiting for the cron schedule — useful for testing.

## Testing the review sweep

1. Add a client (e.g. `npm run forge:seed`).
2. Insert a review with `status = 'new'` — via Supabase Studio or SQL:

   ```sql
   insert into reviews (client_id, author, rating, text)
   values (
     (select id from clients where slug = 'acme-coffee'),
     'Sam', 2, 'Latte was cold and the line was long.'
   );
   ```

3. Trigger `review-sweep` from the Inngest dashboard.
4. Check the row: `status` becomes `drafted`, `draft_reply` is filled, and
   `needs_manager` is set where appropriate.

## Customizing schedules

Override the crons with environment variables (standard cron syntax; prefix with
a timezone if needed):

```dotenv
FORGE_CONTENT_CRON=0 9 * * 1
FORGE_REVIEW_CRON=0 8 * * *
FORGE_PUBLISH_CRON=*/15 * * * *
# e.g. with timezone:
# FORGE_CONTENT_CRON=TZ=America/New_York 0 9 * * 1
```

## Production

In production you host the Inngest endpoint (`forge:serve` or your own server
embedding `serve({ client, functions })`) and connect it to Inngest Cloud, which
drives the crons. See [Deployment](./deployment.md).

## Feeding reviews automatically

Google Business Profile review ingestion is wired into `review-sweep`. Configure
`GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN` or refresh-token OAuth credentials, then
set the GBP account/location IDs either globally in env or per client in the
dashboard profile form. Imported Google reviews are deduped by
`client_id + platform + external_review_id` and inserted with `status = 'new'`.

You can run the importer directly without waiting for the cron:

```bash
npm run forge:reviews:import -- acme-coffee
```

If credentials or location IDs are missing, the importer returns a configured
`false` result and the review sweep continues with any existing manual rows.

## Publishing drafted replies to Google

Once the sweep has drafted a reply (`status = 'drafted'`), an operator can publish
it back to the customer's Google review. Publishing re-checks banned-phrase
compliance against the current brand voice, PUTs the reply through the same
Google Business Profile v4 API used for import, and — only after Google accepts —
flips the review to `status = 'posted'` and records the published reference under
`reviews.metadata.published_reply`. It fails closed on every gap (wrong status,
empty reply, banned-phrase violation, or missing Google credentials) and requires
a **write-scoped** Google token.

```bash
# List a client's drafted Google replies
npm run forge:reviews:publish -- acme-coffee

# Publish one by id
npm run forge:reviews:publish -- acme-coffee --publish <reviewId>
```
