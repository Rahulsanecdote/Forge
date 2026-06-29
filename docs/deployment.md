# Deployment

Forge is self-hostable. This page covers moving from local development to a
running deployment, the security model, and what's deliberately deferred.

## What you're deploying

Two things run server-side:

1. **The CLIs / `runForge`** — on-demand task execution (or your own code calling
   `runForge`).
2. **The Inngest endpoint** (`src/inngest/server.ts`) — serves the two crons so
   Inngest can drive them on a schedule.

Both need:

- A **Supabase** project (hosted or self-hosted) with the migrations applied.
- A **model provider** configured via env (`FORGE_PROVIDER` + key, or a
  self-hosted `openai-compatible` endpoint).

## Steps

### 1. Provision Supabase

Create a Supabase project, then run the migrations in the SQL editor in order:

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_reviews.sql`

(Optionally `supabase/optional/client_memory.sql` if you're building the
pgvector memory feature — it needs the pgvector extension, which Supabase
provides.)

Grab the project URL and the **service-role** key.

### 2. Configure environment

Set the same environment variables described in [Configuration](./configuration.md)
in your host's secret store (not a committed file):

```dotenv
FORGE_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Add clients

```bash
npm run forge:client:add -- my-business.json
# or
npm run forge:onboard -- "My Business" "Description..."
```

### 4. Host the Inngest endpoint and connect Inngest Cloud

Run `npm run forge:serve` (or embed `serve({ client: inngest, functions })` from
`inngest/node` in your own HTTP server) behind a public URL, then register that
URL with [Inngest Cloud](https://www.inngest.com/), which drives the crons.
Override schedules with `FORGE_CONTENT_CRON` / `FORGE_REVIEW_CRON` if needed. See
[Scheduled jobs](./scheduled-jobs.md).

## Security model

- **Service-role key** bypasses Row-Level Security. Keep it strictly server-side.
  Never bundle it into a browser/client app. `.gitignore` already excludes
  `.env`/`.env.*`.
- **Provider API keys** live in env/secrets, never in code or the repo.
- **No secrets in the repo** — only `.env.example` (placeholders) is tracked.

### Row-Level Security (deferred)

This alpha is **single-operator** — you, via the service-role key in a CLI or
server. There are no RLS policies yet. Multi-tenant RLS (so clients/teammates get
their own authenticated, scoped access) lands when the cloud portal is built.

## Roadmap

From the project roadmap:

- **Increment 2** — live data feeds (DataForSEO for keyword volumes, GA4 / Search
  Console for report metrics, Google Business Profile to populate `reviews`); more
  tools (blog writer, performance alerts); a content approval queue;
  `client_memory` retrieval.
- **Increment 3** — Next.js portal + tiered tool activation; multi-tenant auth +
  RLS; managed cloud tier (open-core) + one-click self-host deploy.

### Designing for the dashboard (provider-per-user)

Today the provider/model is a **process-level setting** read from env at startup
(`src/env.ts` → `resolveModel()`). A dashboard where each user picks their own
provider/model/key needs that config to become **per-client** instead:

1. Move provider config from env to per-client storage (extend the client record
   or a new table), and have `resolveModel()` take an explicit config argument
   rather than reading the global `env`.
2. Tools need **no changes** — they already receive the resolved model via
   `ctx.model`. The only change is *where* the config comes from.
3. Storing users' provider API keys requires **encryption at rest** (e.g.
   Supabase Vault / pgsodium) plus RLS so tenants can't read each other's keys —
   this is the one genuinely new security surface, and it ties into the increment
   3 RLS work.

Building the per-client config table early means the dashboard is a UI on top of
it later, not a refactor.

## See also

- [Running locally](./RUNNING_LOCALLY.md) — local Supabase + Ollama
- [Configuration](./configuration.md) — full env reference
- [Architecture](./architecture.md) — how the pieces fit
