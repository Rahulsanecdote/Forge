# Forge

**Open-source AI marketing agent for any small business.** Self-host it, point it at a
business — a cafe, a dental practice, a gym, a law firm — and it produces on-brand
marketing work in that business's voice. **Architect plans, Forge executes.**

MIT licensed. Bring your own Supabase + model key and run it anywhere.

## Why Forge

Most marketing automation is either a closed SaaS you rent (GoHighLevel, Vendasta) or a
generic chatbot with no business context. Forge is the missing piece: an **open**,
self-hostable agent with a typed tool system and per-client brand voice, so it works for
*any* vertical and you own the whole stack.

## How it works

```
CLI · Inngest crons · (future portal)
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
voice — added from a JSON config, no code changes. `*client_memory` (pgvector) ships as an
optional migration (`0003_client_memory.sql`) for increment 2 (retrieval over past content);
the core schema needs no extensions.

## Tools in this release

- `create_social_posts` — on-brand social posts for a topic/platform.
- `draft_review_responses` — rating-calibrated review replies, with a manager-escalation flag.
- `generate_report` — turn provided metrics + highlights into an on-brand performance report (never invents numbers).
- `research_keywords` — clustered SEO keyword ideas with search intent + content angles (ideation; add a data provider for volumes).
- `analyze_competitors` — positioning analysis vs named competitors, surfacing gaps and opportunities.

Adding tools is the main extension point — see [CONTRIBUTING](./CONTRIBUTING.md).

## Quick start

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

**Increment 3** — Next.js portal + tiered tool activation; multi-tenant auth + RLS; managed
cloud tier (open-core) + one-click self-host deploy.

## Contributing & License

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Licensed under [MIT](./LICENSE).
