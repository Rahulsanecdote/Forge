# Scheduled jobs (Inngest)

Forge ships two cron jobs defined in `src/inngest/functions.ts` and served via
`src/inngest/server.ts`. They use [Inngest](https://www.inngest.com/) for
scheduling and durable, retryable steps.

## The two jobs

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
  calls `draft_review_responses`, and writes the drafts back.
- **Correctness guarantees:**
  - A review is marked `status = 'drafted'` **only when the model returned a
    usable reply**. Malformed or short output leaves the row `new`, so a later
    sweep retries it instead of silently dropping it.
  - Supabase update errors are checked and **thrown**, so Inngest retries the step
    rather than recording a false success.
- Returns the count of reviews actually drafted.

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
# e.g. with timezone:
# FORGE_CONTENT_CRON=TZ=America/New_York 0 9 * * 1
```

## Production

In production you host the Inngest endpoint (`forge:serve` or your own server
embedding `serve({ client, functions })`) and connect it to Inngest Cloud, which
drives the crons. See [Deployment](./deployment.md).

## Feeding reviews automatically

Right now reviews are inserted manually (or by your own integration). Wiring a
Google Business Profile (or other) source to populate `reviews` with
`status = 'new'` is on the roadmap (increment 2).
