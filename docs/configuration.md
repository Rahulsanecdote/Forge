# Configuration

All configuration is via environment variables, validated at startup by
`src/env.ts`. Copy `.env.example` to `.env` and fill it in. If a required value
is missing, Forge prints which keys are missing and exits cleanly.

## Environment variables

### Storage (always required)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL (e.g. `https://xxxx.supabase.co`, or `http://127.0.0.1:54321` locally). |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | The **service-role** key (not the anon key). Server-only — bypasses RLS. Never ship to a browser. |

### Model provider

| Variable | Required | Default | Description |
|---|---|---|---|
| `FORGE_PROVIDER` | — | `anthropic` | One of `anthropic`, `openai`, `google`, `openai-compatible`. |
| `FORGE_MODEL` | — | per-provider (below) | Override the model id. |
| `FORGE_BASE_URL` | only for `openai-compatible` | — | Endpoint for a local/self-hosted server (e.g. `http://localhost:11434/v1` for Ollama). |
| `FORGE_API_KEY` | — | `local` | Optional key for `openai-compatible` endpoints that require one. |

### Provider API keys

Set **only the one** matching `FORGE_PROVIDER`:

| Variable | For provider |
|---|---|
| `ANTHROPIC_API_KEY` | `anthropic` |
| `OPENAI_API_KEY` | `openai` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `google` |
| *(none / `FORGE_API_KEY`)* | `openai-compatible` (usually not needed locally) |

### Scheduled jobs (optional)

| Variable | Default | Description |
|---|---|---|
| `FORGE_CONTENT_CRON` | `0 9 * * 1` (Mondays 09:00 UTC) | Weekly content cron. |
| `FORGE_REVIEW_CRON` | `0 8 * * *` (daily 08:00 UTC) | Review sweep cron. |

Prefix a cron with a timezone, e.g. `TZ=America/New_York 0 9 * * 1`.

## Default models per provider

When `FORGE_MODEL` is unset, Forge uses:

| Provider | Default model |
|---|---|
| `anthropic` | `claude-sonnet-4-6` |
| `openai` | `gpt-4o` |
| `google` | `gemini-1.5-pro` |
| `openai-compatible` | `llama3.1` |

## Example configurations

### Anthropic (cloud)

```dotenv
FORGE_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# FORGE_MODEL=claude-sonnet-4-6   # optional override

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Local / self-hosted (Ollama, no per-token cost)

```dotenv
FORGE_PROVIDER=openai-compatible
FORGE_BASE_URL=http://localhost:11434/v1
FORGE_MODEL=llama3.1

SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # from `supabase status`
```

`openai-compatible` works with any OpenAI-compatible server — Ollama, LM Studio,
vLLM, LiteLLM. See [Running locally](./RUNNING_LOCALLY.md) for the full local
walkthrough.

### Cheaper Claude tier

```dotenv
FORGE_PROVIDER=anthropic
FORGE_MODEL=claude-haiku-4-5     # ~3x cheaper than the Sonnet default
ANTHROPIC_API_KEY=sk-ant-...
```

## Cost notes

Forge's tasks are small (a few posts, a short reply, a brief report), so token
usage per run is modest; cost scales mostly with how many clients the crons run
over. To reduce spend: drop to a cheaper model (`FORGE_MODEL=claude-haiku-4-5`),
switch providers, or run a local model for zero per-token cost. Tokenization is
roughly comparable across providers — the lever is the model tier you pick, not
the provider per se.

## Security

- The **service-role key** bypasses Row-Level Security. Keep it server-side only;
  the `.gitignore` already excludes `.env`/`.env.*` (while keeping
  `.env.example`).
- This alpha is **single-operator** — RLS policies are deferred to a later
  increment (see [Deployment](./deployment.md)).
- Store provider API keys in `.env`, never in code or the repo.
