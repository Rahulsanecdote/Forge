# Running Forge locally

This guide gets Forge running entirely on your machine — no cloud accounts, no
per-token API cost — using **local Supabase** for storage and **Ollama** for the
model. Everything here matches the code in this repo (scripts in `package.json`,
migrations in `supabase/migrations/`, the Inngest server in `src/inngest/`).

> **Why these two pieces?** Forge always needs (1) a Postgres/Supabase database
> for clients, brand voices, tool runs, and reviews, and (2) an LLM provider.
> Running both locally means the whole stack lives on your laptop.

---

## 1. Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node.js 20+** | Runs Forge (`tsx`, the Inngest server) | <https://nodejs.org> |
| **Docker** | Local Supabase runs in containers | <https://docs.docker.com/get-docker/> |
| **Supabase CLI** | Local Postgres + keys + Studio | <https://supabase.com/docs/guides/cli> |
| **Ollama** | Local, OpenAI-compatible LLM server | <https://ollama.com/download> |

Check they're present:

```bash
node -v        # v20+ (v22 is fine)
docker info     # must be running
supabase --version
ollama --version
```

---

## 2. Install dependencies

```bash
npm install
```

---

## 3. Start local Supabase and apply the schema

From the repo root:

```bash
# One-time: create supabase/config.toml (safe to run; leaves existing files alone)
supabase init

# Boot the local stack (Postgres, Studio, APIs) in Docker
supabase start
```

`supabase start` prints a block of local credentials. **Copy two values** — you'll
put them in `.env` in the next step:

```
API URL: http://127.0.0.1:54321          ->  SUPABASE_URL
service_role key: eyJhbGciOi...           ->  SUPABASE_SERVICE_ROLE_KEY
```

(You can reprint these any time with `supabase status`.)

Now apply Forge's migrations to the local database:

```bash
supabase db reset
```

This drops and recreates the local DB and applies everything in
`supabase/migrations/` in order:

- `0001_init.sql` — `clients`, `brand_voices`, `tool_runs`
- `0002_reviews.sql` — `reviews` queue (for the review-sweep cron)

> The core schema needs **no extensions** — `supabase db reset` runs clean on any
> Postgres. The pgvector-based `client_memory` table is intentionally **not** in
> the migrations folder (it's reserved for a later increment); see
> [§8 Optional: pgvector memory](#8-optional-pgvector-memory) if you want it.

Open **Supabase Studio** at <http://127.0.0.1:54323> to browse tables.

---

## 4. Start Ollama and pull a model

In a separate terminal:

```bash
# Ollama usually runs as a background service after install; if not:
ollama serve

# Pull a tool-calling-capable model (required — see the note below)
ollama pull llama3.1
```

Ollama exposes an **OpenAI-compatible** API at `http://localhost:11434/v1`.

> **Pick a model that supports tool/function calling.** Forge's agent
> (`runForge`) lets the model *choose* which tool to call, so the local model
> must support tool calling. `llama3.1`, `llama3.2`, `qwen2.5`, and
> `mistral-nemo` all do. Smaller models work but produce lower-quality copy; a
> larger pull (e.g. `llama3.1:70b` if your machine can handle it) gives better
> results.

---

## 5. Configure `.env` for local

```bash
cp .env.example .env
```

Edit `.env` to point at local Ollama + local Supabase:

```dotenv
# --- Model: local Ollama via the OpenAI-compatible provider ---
FORGE_PROVIDER=openai-compatible
FORGE_BASE_URL=http://localhost:11434/v1
FORGE_MODEL=llama3.1
# FORGE_API_KEY is not needed locally (defaults to "local")

# --- Storage: local Supabase (values from `supabase start` / `supabase status`) ---
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...   # the service_role key, not the anon key
```

> If `.env` is missing or incomplete, Forge now fails with a clear message
> telling you which keys are missing — no stack trace.

---

## 6. Add a business and run a task

Forge ships two example businesses. Add one:

```bash
# Either use the baked-in seed shortcut...
npm run forge:seed                                  # adds examples/acme-coffee.json

# ...or add an example explicitly (note the `--` so args reach the script)
npm run forge:client:add -- examples/bright-smile-dental.json
```

Run a task for a client by slug:

```bash
npm run forge:run -- acme-coffee "Write 3 Instagram posts for a new oat-milk cold brew"
```

You'll see a summary plus each tool's structured output. Every run is also logged
to the `tool_runs` table (visible in Studio).

**Onboard your own business** — let Forge draft the brand voice from a description:

```bash
npm run forge:onboard -- "My Cafe" "A cozy neighborhood coffee shop focused on regulars and good espresso"
npm run forge:run -- my-cafe "Draft a friendly post announcing weekend opening hours"
```

---

## 7. Run the scheduled jobs (optional)

Forge has two Inngest crons: weekly content and a daily review sweep. To run them
locally you need the reviews table (already applied in step 3) and two terminals:

```bash
# Terminal A — serve Forge's Inngest endpoint on :3030
npm run forge:serve

# Terminal B — Inngest dev server discovers the endpoint and runs the crons
npx inngest-cli@latest dev
```

Open the Inngest dev dashboard (it prints the URL, usually
<http://localhost:8288>) to trigger functions manually instead of waiting for the
cron schedule.

To test the **review sweep**, insert a row into `reviews` with `status = 'new'`
(via Studio or SQL), then trigger `review-sweep` from the Inngest dashboard. It
drafts a reply, sets `status = 'drafted'`, and flags `needs_manager` where
appropriate.

---

## 8. Optional: pgvector memory

`client_memory` (pgvector retrieval) is reserved for a later increment and is
**not** applied by `supabase db reset`. Apply it by hand only if you're building
on it:

```bash
# Local Supabase ships pgvector, so this just works:
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -f supabase/optional/client_memory.sql
```

Or paste the file's contents into the Studio SQL editor.

---

## 9. Stopping and resetting

```bash
supabase stop            # stop the local stack (data is preserved)
supabase stop --no-backup  # stop and discard local data
supabase db reset        # wipe + re-apply migrations (fresh DB)
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Forge is missing required configuration: SUPABASE_URL, ...` | `.env` not filled in. Copy values from `supabase status`. |
| `connect ECONNREFUSED 127.0.0.1:54321` | Local Supabase isn't running. `supabase start`. |
| `Client "..." not found` | You haven't added that client. `npm run forge:client:add -- <file>`. |
| Model error / connection refused on `:11434` | Ollama isn't running or the model isn't pulled. `ollama serve` + `ollama pull llama3.1`. |
| Agent answers in text but never calls a tool | Your local model doesn't support tool calling. Use `llama3.1` / `llama3.2` / `qwen2.5`. |
| Empty or malformed tool output | Small local models sometimes return non-JSON; Forge falls back to empty results. Try a larger model. |
| `npm run forge:run acme-coffee "..."` ignores the args | You dropped the `--`. Use `npm run forge:run -- acme-coffee "..."`. |
| Migration fails on `vector` type | You ran `supabase/optional/client_memory.sql` on a Postgres without pgvector. Local Supabase has it; bare Postgres needs the OS package. |

---

## What "local" gives you

- **No per-token cost** — Ollama runs on your hardware.
- **No cloud accounts** — local Supabase is a Docker stack.
- **Same code path as production** — only `.env` differs. When you move to a
  hosted model or Supabase project later, you change environment variables, not
  code. (And the planned dashboard will let users pick their provider per
  account — see the roadmap in the README.)
