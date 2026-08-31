# Deployment

Forge is self-hostable. This page covers moving from local development to a
running deployment, and what the security model does and does not cover.

## What you're deploying

Three things, and the first is not optional:

1. **The Next.js app** — the operator dashboard (`/dashboard`), the client portal
   (`/portal`), and the route handlers everything else depends on: the Stripe webhook
   (`/api/stripe/webhook`), the Twilio inbound webhook (`/api/twilio/inbound`), review
   click-through links (`/r/<token>`), and unsubscribe links (`/u/<token>`).

   Skipping this does not merely cost you a UI. Without `/api/stripe/webhook` a client's
   subscription status never syncs, so billing gates act on stale state. Without
   `/api/twilio/inbound` and `/u/<token>`, SMS `STOP` replies and email unsubscribes are
   never recorded — the links go out in your messages and lead nowhere, which is a
   compliance problem, not a cosmetic one.

2. **The Inngest endpoint** (`src/inngest/server.ts`) — serves the five crons so Inngest
   can drive them on a schedule.

3. **The CLIs / `runForge`** — optional, for on-demand task execution or your own code
   calling `runForge` directly.

Both need:

- A **Supabase** project (hosted or self-hosted) with the migrations applied.
- A **model provider** configured via env (`FORGE_PROVIDER` + key, or a
  self-hosted `openai-compatible` endpoint).

## Steps

### 1. Provision Supabase

Create a Supabase project, then apply **every** migration in `supabase/migrations/`, in
filename order. The fastest way is the Supabase CLI:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

If you would rather paste SQL by hand, run each file in `supabase/migrations/` in
filename order — all of them, not just the first two. They build on each other:
`0001_init.sql` creates the agent loop's tables, and later migrations add content
approvals, scheduling, publication checkpoints, metrics, billing, review requests,
opt-outs, and the client portal. **A database missing them will start and then fail at
runtime**, because the features that need those tables are already in the code.

(Optionally `supabase/optional/client_memory.sql` if you're building the
pgvector memory feature — it needs the pgvector extension, which Supabase
provides. It is kept out of `supabase/migrations/` so `db push` stays pgvector-free.)

Grab the project URL and the **service-role** key.

### 2. Configure environment

Set the same environment variables described in [Configuration](./configuration.md)
in your host's secret store (not a committed file):

```dotenv
FORGE_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Required by the web app — omit these and it deploys but nobody can log in.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
FORGE_ADMIN_PASSWORD=a-long-random-password
NEXT_PUBLIC_APP_URL=https://your-app

# Recommended: a separate portal secret, so rotating the operator password
# doesn't also log out every client.
FORGE_PORTAL_SECRET=another-long-random-secret
```

Check them before deploying — this is the repo's own contract, so it stays right even if
this page drifts:

```bash
NODE_ENV=production npm run env:validate
```

### 3. Add clients

```bash
npm run forge:client:add -- my-business.json
# or
npm run forge:onboard -- "My Business" "Description..."
```

### 4. Deploy the Next.js app

```bash
npm run build
npm start          # or your host's equivalent
```

Any Node host works; Vercel is the path of least resistance since the app is a stock
Next.js App Router project. Set `NEXT_PUBLIC_APP_URL` to the canonical public URL — the
Twilio webhook verifies its signature against exactly that URL, so getting it wrong makes
every inbound opt-out fail signature checks.

Then point the provider webhooks at it:

- Stripe → `https://your-app/api/stripe/webhook`, and set `STRIPE_WEBHOOK_SECRET` to that
  endpoint's signing secret.
- Twilio → `https://your-app/api/twilio/inbound` for inbound SMS.

Both endpoints refuse traffic outright when their secret is unset, so a half-configured
deployment fails closed rather than accepting unverified requests.

### 5. Host the Inngest endpoint and connect Inngest Cloud

Run `npm run forge:serve` (or embed `serve({ client: inngest, functions })` from
`inngest/node` in your own HTTP server) behind a public URL, then register that
URL with [Inngest Cloud](https://www.inngest.com/), which drives the crons.
Override schedules with `FORGE_CONTENT_CRON` / `FORGE_REVIEW_CRON` if needed. See
[Scheduled jobs](./scheduled-jobs.md).

### 6. Verify

```bash
LAUNCH_SMOKE_APP_URL=https://your-app npm run launch:smoke
```

Checks unauthenticated that the app entry redirects into the dashboard, that protected
operator routes redirect to login, and that the public marketing page is reachable without
leaking operator internals.

## Security model

- **Service-role key** bypasses Row-Level Security. Keep it strictly server-side.
  Never bundle it into a browser/client app. `.gitignore` already excludes
  `.env`/`.env.*`.
- **Provider API keys** live in env/secrets, never in code or the repo.
- **No secrets in the repo** — only `.env.example` (placeholders) is tracked.

### Row-Level Security

RLS **is** enabled, deny-by-default: the migrations revoke `anon` and `authenticated` on
every table and grant only `service_role`, with two narrow exceptions. But the server holds
the service-role key, which bypasses RLS entirely — so RLS is a backstop against a leaked
anon key, and the boundary between one client's data and another's is `client_id` scoping
in application code.

Forge remains **single-operator**: one shared password, no per-user accounts. Read
[the security model](./SECURITY-MODEL.md) before pointing a deployment at a real client
account — it is the authoritative description, and this page deliberately does not restate
it.

## Roadmap

See the [README roadmap](../README.md#roadmap). In short: shipped since this page was first
written are the content approval queue, the client portal, scheduling and publishing, post
metrics, Stripe billing, review requests with opt-out compliance, DataForSEO keyword
volumes, and Google Business Profile review import. Still ahead: GA4 and Search Console for
site metrics, `client_memory` retrieval, more tools, and per-user operator accounts.

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
