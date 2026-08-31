# Forge

**A self-hostable agent runtime with a typed tool system and per-client context isolation.**
One runtime, many businesses: each client is a row in the database plus a brand voice — no
code changes, no forks. Provider-agnostic — Anthropic, OpenAI, Google, or fully offline
against Ollama. Ships with a marketing tool pack; write your own in ~40 lines.

Licensed under the [AGPL-3.0](./LICENSE) — free to run, modify, and self-host, including
for your own clients. If you want to offer Forge to *your* customers as a service without
publishing your modifications, a [commercial licence](./COMMERCIAL.md) covers that. Bring
your own Supabase + model key and run it anywhere.

**Why not just use LangChain / CrewAI?** Those give you a single agent loop. Forge wraps that
loop for *many clients at once* — the system prompt is built from each client's brand voice,
and every tool run is logged to `tool_runs` keyed by `client_id`. If you're running one agent
across many customers, that per-client scoping and audit trail is the part you'd otherwise
build yourself.

**What it will not do:** invent numbers. `generate_report` reports only metrics you give it
or that Forge measured, and `research_keywords` returns real search volumes when a data
provider is configured and honest ideation when one isn't — never a plausible-looking figure
it made up. Nothing reaches a client's public account without a human approving it first.

## How it works

```
CLI · Inngest crons · Next.js operator dashboard
      │
      ▼
runForge(client, task)             ← src/forge/runtime.ts
  ├─ system prompt = that client's brand voice
  ├─ the model decides which tool to call
  ├─ tool.execute(input, ctx)      ← each tool reads everything from ctx.client
  ├─ append result, loop (max 6 steps)
  └─ log every run → tool_runs
            │
            ▼
        Supabase (clients · brand_voices · tool_runs · client_memory*)
```

Nothing is business-specific in the code. Each business is a row in `clients` plus a brand
voice — added from a JSON config, no code changes. The core migrations need no extensions;
`*client_memory` (pgvector) is shipped separately as `supabase/optional/client_memory.sql`
— kept out of `supabase/migrations/` so `supabase db push` stays pgvector-free. Apply it by
hand only if you want the memory table ahead of the retrieval feature that will use it.

## Tools in this release

- `create_social_posts` — on-brand social posts for a topic/platform.
- `draft_review_responses` — rating-calibrated review replies, with a manager-escalation flag.
- `generate_report` — turn provided metrics + highlights into an on-brand performance report (never invents numbers).
- `research_keywords` — clustered SEO keyword ideas with search intent + content angles. Set `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` and it returns real search volume and difficulty; without them it degrades to ideation rather than inventing numbers.
- `analyze_competitors` — positioning analysis vs named competitors, surfacing gaps and opportunities.

Adding tools is the main extension point — see [CONTRIBUTING](./CONTRIBUTING.md).

## Quick start

> **Want to run everything locally** (local Supabase + Ollama, no cloud, no per-token cost)?
> See **[docs/RUNNING_LOCALLY.md](./docs/RUNNING_LOCALLY.md)**.

```bash
# 1. Install
npm install

# 2. Create a Supabase project, then apply ALL migrations in supabase/migrations/.
#    Every one — they build on each other, and the code already expects the later ones.
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
#    No CLI? Paste each file in supabase/migrations/ into the SQL editor, in filename order.

# 3. Configure
cp .env.example .env     # set FORGE_PROVIDER + its key, plus Supabase URL + service role key

# 4. Add a business (ships with two example verticals)
npm run forge:client:add -- examples/acme-coffee.json
npm run forge:client:add -- examples/bright-smile-dental.json

# 5. Run it
npm run forge:run -- acme-coffee "Write 3 Instagram posts for a new oat-milk cold brew"
npm run forge:run -- bright-smile-dental "Draft a friendly post announcing Saturday cleaning slots"
```

## Operator dashboard

Open `/dashboard` to manage clients and inspect recent agent runs. Selecting a run opens its
draft preview at `/dashboard/runs/[id]`, including generated captions, hashtags, and image
directions. Production access is protected by `FORGE_ADMIN_PASSWORD`.

Before treating a deployment as ready, run the unauthenticated LaunchOps smoke check. It
verifies the production app entry redirects into the dashboard, protected operator routes
redirect to login, and the public marketing page remains reachable without leaking operator
internals:

```bash
LAUNCH_SMOKE_APP_URL=https://forge-agent-ten.vercel.app npm run launch:smoke
```

Set `LAUNCH_SMOKE_RUN_ID=<run-id>` to include a protected draft-preview route in the same
check.

**Billing & plan enforcement.** Each client carries a subscription state, and Forge
**hard-blocks automated work for non-paying clients** — the weekly-content, review-sweep,
and scheduled-publish crons skip them and the Publish action is blocked (manual draft
generation still works so you can catch up). Configure Stripe (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`/`STRIPE_PRICE_GROWTH`) and the client page
gets **Start subscription** (Stripe Checkout) + **Manage billing** (Stripe portal) buttons;
`POST /api/stripe/webhook` keeps `subscription_status` in sync. With Stripe unset, the same
page's **manual controls** let you set status or **comp** a client (`billing_override`).

The dashboard also has a **content calendar** (`/dashboard/calendar`): a cross-client month
grid of scheduled and published posts — each placed on its own client's local day — with a
side rail of drafts still awaiting your approval. It's a read-only cockpit over the existing
`content_schedules` and `content_approvals` tables (no extra setup).

The **monitoring cockpit** (`/dashboard/monitoring`) rolls up delivery health across pending
approvals, due or failed schedules, publication checkpoints that need reconciliation,
review-request delivery failures, billing delivery gates, and post-metric freshness. Set
`FORGE_ALERT_WEBHOOK_URL` to an operator-owned endpoint that accepts arbitrary JSON, or a
relay that reshapes it (Make, Zapier, n8n). The body is Forge's own shape, not Slack's or
Discord's, so their native incoming webhooks reject it — see
[Scheduled jobs](./docs/scheduled-jobs.md#monitoring-alerts) for the payload. It carries
active monitoring issues from the `monitoring-alerts` cron and
links operators back to `/dashboard/monitoring`; when the webhook is unset or there are
no active issues, the cron skips cleanly.

Each client page also includes **performance report generation**. Forge can seed the
`generate_report` tool with the client's measured post reach, impressions, engagement,
and platform breakdown from `content_metrics`, plus any operator-entered metrics and
highlights. The result is saved as a `tool_runs` record with durable report evidence and
opens as a copyable client-ready report preview at `/dashboard/runs/[id]`.

Each client page also includes **review generation**: set the client's Google Review URL,
paste a list of happy customers (each as `Name, email or phone`), and Forge mints a
click-tracked link (`/r/<token>`) plus a ready-to-send message for each one. When a delivery
provider is configured it **sends the request for you** — email via
[Resend](https://resend.com) (`RESEND_API_KEY` + `FORGE_REVIEW_FROM_EMAIL`) or SMS via
[Twilio](https://twilio.com) (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
`TWILIO_FROM_NUMBER`); customers with no contact (or when no provider is set up) become
copy-and-send links. Opening a link records the click and forwards the customer straight to
the business's Google review page, so you can watch the request → click funnel.

Automated sends are **compliance-aware**: every email includes an unsubscribe link and a
`List-Unsubscribe` header plus your mailing address (`FORGE_MAILING_ADDRESS`), every SMS
includes "Reply STOP", and opt-outs (email unsubscribe or SMS STOP, the latter synced via
`/api/twilio/inbound`) land on a suppression list that's checked before every send — so an
opted-out customer is never contacted again.

## Client portal

Clients get a read-only view of their own work at `/portal`, plus one write action: they
can approve or reject their own pending drafts. No password — an operator copies a signed
link from the client's Manage page and sends it to them.

Every portal query is scoped to the client id in the signed session, which is the boundary
between one client's data and another's. Links are signed with a per-client secret, so
**Revoke & rotate** on a client's page invalidates that client's links and sessions without
touching anyone else's; rotating `FORGE_PORTAL_SECRET` invalidates all of them at once.

Set `FORGE_PORTAL_SECRET` in production. It falls back to `FORGE_ADMIN_PASSWORD` so the
portal works out of the box, but sharing the secret means rotating your operator password
also logs out every client.

## Add your business

**Fastest — let Forge draft the brand voice from a description:**

```bash
npm run forge:onboard -- "Bright Smile Dental" "A gentle family dental practice focused on anxiety-free care"
```

**Or hand-author it (full control)** — copy an example and edit for any vertical:

```bash
cp examples/acme-coffee.json my-business.json
# edit name, industry, tone, audience, dos/donts, sample posts, banned phrases
npm run forge:client:add -- my-business.json
```

Keep real client configs out of the repo.

## Bring your own model

Forge is provider-agnostic. Set `FORGE_PROVIDER` and the matching key:

| Provider | `FORGE_PROVIDER` | Key | Default model |
|---|---|---|---|
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| Google | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-1.5-pro` |
| Local / self-hosted | `openai-compatible` | `FORGE_BASE_URL` (+ `FORGE_MODEL`) | — |

`openai-compatible` works with any OpenAI-compatible server — Ollama, LM Studio, vLLM,
LiteLLM — so you can run Forge fully offline:

```bash
FORGE_PROVIDER=openai-compatible
FORGE_BASE_URL=http://localhost:11434/v1
FORGE_MODEL=llama3.1
```

Override the model anytime with `FORGE_MODEL`. Adding a provider is one case in
`src/forge/model.ts` — see [CONTRIBUTING](./CONTRIBUTING.md#add-an-llm-provider).

## Autopilot (scheduled jobs)

Forge ships five Inngest cron jobs:

- **Weekly content** (`weekly-content`, default Mondays 09:00 UTC) — generates next week's
  social posts for every client.
- **Review sweep** (`review-sweep`, default daily 08:00 UTC) — imports new Google Business
  Profile reviews for clients with a linked location, then drafts on-brand replies and flags
  the ones needing a manager. Reviews inserted into the table by any other means are picked
  up the same way.
- **Scheduled publish** (`scheduled-publish`) — publishes approved content when its
  scheduled time arrives, through the same fail-closed path as the manual Publish button.
- **Refresh metrics** (`refresh-metrics`) — pulls reach and engagement for published posts
  back into `content_metrics`.
- **Monitoring alerts** (`monitoring-alerts`) — sends active delivery-health issues to
  `FORGE_ALERT_WEBHOOK_URL`; skips cleanly when unset or when nothing is wrong.

The three delivery crons — weekly content, review sweep, scheduled publish — skip clients
whose subscription is not active. Refresh-metrics and monitoring-alerts do not gate on
billing: they observe rather than deliver, and an operator still needs to see the health of
a lapsed client's account.

Run them locally:

```bash
npm run forge:serve              # serves the Inngest endpoint on :3030
npx inngest-cli@latest dev       # in another terminal — discovers it and runs the crons
```

Override schedules with `FORGE_CONTENT_CRON` / `FORGE_REVIEW_CRON` (cron syntax; prefix with
`TZ=America/New_York` for a timezone).

The review sweep acts on `reviews` rows with `status = 'new'`. It fills those itself from
Google Business Profile for any client with a linked location — set
`GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID` / `_LOCATION_ID` plus an access or refresh token, or
set the per-client ids on the client's page so one deployment can serve several locations.
Without a linked location the sweep still drafts replies for whatever is in the table, so
inserting a row by hand is a fine way to try it before wiring up Google.

## Security

Forge holds Google Business Profile and Meta credentials, customer contact lists, and
Stripe billing state for every business you manage. Before pointing it at a real client
account, read the **[security model](./docs/SECURITY-MODEL.md)** — it sets out the trust
boundaries, what enforces each one, and the limitations that are deliberate trade-offs
rather than oversights.

The two that catch people out: **Forge is single-operator** (one shared password, no
accounts, no MFA), and **the tenant boundary between clients is application code, not
Postgres RLS** — the server holds the service-role key, so RLS is a backstop against a
leaked anon key rather than the thing keeping clients apart.

Found a vulnerability? See [SECURITY.md](./SECURITY.md). Please don't open a public issue.

## Roadmap

Already shipped, and described above: the content approval queue, the client portal,
scheduling and publishing, post metrics, Stripe billing with delivery gating, review
requests with opt-out compliance, and the monitoring cockpit.

**Next** — the remaining live-data gap is website performance: `generate_report` works from
post metrics Forge measured plus anything you enter by hand, so GA4 and Search Console are
what would let it speak to site traffic and rankings without an operator typing numbers in.
(Keyword volumes via DataForSEO and Google Business Profile review import are already
wired — see above.) Then `client_memory` retrieval (pgvector) so the agent can draw on a
client's past content, and more tools — a blog writer is the obvious next one.

**Later** — per-user operator accounts to replace the single shared password, tiered tool
activation per client, and a managed cloud tier alongside the self-host path.

## Contributing & License

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Contributors sign a short
[CLA](./CLA.md) so the project can keep offering commercial licences alongside the open
one.

Copyright (C) 2026 Rahulsanecdote. Forge is free software: you can redistribute it and/or
modify it under the terms of the **GNU Affero General Public License, version 3**, as
published by the Free Software Foundation. It is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](./LICENSE) file for the full terms.

**What the AGPL means for you in practice.** Running Forge for your own business, or for
clients on an unmodified copy, costs nothing and obliges you to nothing. The one thing it
asks is section 13: if you modify Forge and let other people use it over a network, those
users must be able to get your modified source. If that does not work for your business,
[COMMERCIAL.md](./COMMERCIAL.md) explains the alternative.
