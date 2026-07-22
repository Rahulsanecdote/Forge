# Forge

**A self-hostable agent runtime with a typed tool system and per-client context isolation.**
One runtime, many businesses: each client is a row in the database plus a brand voice — no
code changes, no forks. Provider-agnostic — Anthropic, OpenAI, Google, or fully offline
against Ollama. Ships with a marketing tool pack; write your own in ~40 lines.

MIT licensed. Bring your own Supabase + model key and run it anywhere.

**Why not just use LangChain / CrewAI?** Those give you a single agent loop. Forge wraps that
loop for *many clients at once* — the system prompt is built from each client's brand voice,
and every tool run is logged to `tool_runs` keyed by `client_id`. If you're running one agent
across many customers, that per-client scoping and audit trail is the part you'd otherwise
build yourself.

## Why Forge

An **open**, self-hostable runtime for running one agent across many clients: typed tools,
per-client brand voice, and every run logged to `tool_runs`. Marketing is the reference tool
pack it ships with — swap it and the same runtime works for any vertical. You own the whole
stack.

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
— kept out of `supabase/migrations/` so `supabase db push` stays pgvector-free — and applied
by hand for increment 2 (retrieval over past content).

## Tools in this release

- `create_social_posts` — on-brand social posts for a topic/platform.
- `draft_review_responses` — rating-calibrated review replies, with a manager-escalation flag.
- `generate_report` — turn provided metrics + highlights into an on-brand performance report (never invents numbers).
- `research_keywords` — clustered SEO keyword ideas with search intent + content angles (ideation; add a data provider for volumes).
- `analyze_competitors` — positioning analysis vs named competitors, surfacing gaps and opportunities.

Adding tools is the main extension point — see [CONTRIBUTING](./CONTRIBUTING.md).

## Quick start

> **Want to run everything locally** (local Supabase + Ollama, no cloud, no per-token cost)?
> See **[docs/RUNNING_LOCALLY.md](./docs/RUNNING_LOCALLY.md)**.

```bash
# 1. Install
npm install

# 2. Create a Supabase project, then run supabase/migrations/0001_init.sql in its SQL editor

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

Each client page also includes **review generation**: set the client's Google Review URL,
paste a list of happy customers (each as `Name, email or phone`), and Forge mints a
click-tracked link (`/r/<token>`) plus a ready-to-send message for each one. When a delivery
provider is configured it **sends the request for you** — email via
[Resend](https://resend.com) (`RESEND_API_KEY` + `FORGE_REVIEW_FROM_EMAIL`) or SMS via
[Twilio](https://twilio.com) (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
`TWILIO_FROM_NUMBER`); customers with no contact (or when no provider is set up) become
copy-and-send links. Opening a link records the click and forwards the customer straight to
the business's Google review page, so you can watch the request → click funnel.

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

Forge ships two Inngest cron jobs:

- **Weekly content** (`weekly-content`, default Mondays 09:00 UTC) — generates next week's
  social posts for every client.
- **Review sweep** (`review-sweep`, default daily 08:00 UTC) — drafts on-brand replies to any
  new rows in the `reviews` table and flags the ones needing a manager.

Run it locally:

```bash
# apply the reviews table: run supabase/migrations/0002_reviews.sql in Supabase
npm run forge:serve              # serves the Inngest endpoint on :3030
npx inngest-cli@latest dev       # in another terminal — discovers it and runs the crons
```

Override schedules with `FORGE_CONTENT_CRON` / `FORGE_REVIEW_CRON` (cron syntax; prefix with
`TZ=America/New_York` for a timezone). The review sweep acts on `reviews` rows with
`status = 'new'` — a Google Business Profile (or other) integration feeds those in increment 2;
insert a row by hand to test it now.

## Roadmap

**Increment 2** — live data feeds (DataForSEO for keyword volumes, GA4 / Search Console for
report metrics, Google Business Profile to populate reviews); more tools (blog writer,
performance alerts); a content approval queue; `client_memory` retrieval.

**Increment 3** — client-facing portal + tiered tool activation; multi-tenant auth + RLS;
managed cloud tier (open-core) + one-click self-host deploy.

## Contributing & License

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Licensed under [MIT](./LICENSE).
