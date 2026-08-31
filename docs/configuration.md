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

### Web app — dashboard, portal, webhooks

Required to run the Next.js app, which is where the operator dashboard, the client portal,
and the Stripe/Twilio/review-link routes live.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ always | Public project URL. Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ always | Public anon key. RLS leaves it almost nothing — `INSERT` into `leads` and no reads. |
| `FORGE_ADMIN_PASSWORD` | ✅ in production | The operator login. **Without it `/dashboard/login` refuses everyone**, so the app deploys but nobody can use it. Make it long and random: it is the only thing between the internet and every client you manage. |
| `FORGE_PORTAL_SECRET` | — (falls back to `FORGE_ADMIN_PASSWORD`) | Signs client portal links and sessions. Set it separately in production — sharing the secret means rotating your operator password logs out every client. |
| `NEXT_PUBLIC_APP_URL` | recommended | Canonical public URL. The Twilio webhook verifies its signature against exactly this, so a wrong value makes every inbound opt-out fail. |

`npm run env:validate` (with `NODE_ENV=production` for the production rules) checks the
variables above, and it — not this page — is what CI enforces, so prefer it if the two ever
disagree.

It does **not** check everything, though, and the gap is worth knowing: `INNGEST_SIGNING_KEY`
is required in production once the crons are live (see
[the environment contract](./ENVIRONMENT_CONTRACT.md)) but the validator does not look for
it, because whether you need it depends on hosting the crons on Inngest Cloud rather than on
being in production. A passing `env:validate` therefore does not by itself mean a
cron-serving deployment is fully configured.

### Scheduled jobs (optional)

| Variable | Default | Description |
|---|---|---|
| `FORGE_CONTENT_CRON` | `0 9 * * 1` (Mondays 09:00 UTC) | Weekly content cron. |
| `FORGE_REVIEW_CRON` | `0 8 * * *` (daily 08:00 UTC) | Review sweep cron. |
| `FORGE_PUBLISH_CRON` | `*/15 * * * *` | Scheduled publish cron. |
| `FORGE_METRICS_CRON` | `0 */6 * * *` | Post-metrics refresh cron. |
| `FORGE_ALERT_CRON` | `*/30 * * * *` | Monitoring alerts cron. |
| `INNGEST_SIGNING_KEY` | — | **Required in production once the crons are live** — Inngest Cloud uses it to sign requests to your endpoint. Not needed for the local `inngest-cli dev` server. Note `env:validate` does *not* check this one; see below. |

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
- Forge is **single-operator**: one shared `FORGE_ADMIN_PASSWORD`, no per-user accounts.
  RLS *is* enabled deny-by-default, but the server holds the service-role key and bypasses
  it, so the boundary between clients is `client_id` scoping in application code. See
  [the security model](./SECURITY-MODEL.md) for what that does and does not protect.
- Store provider API keys in `.env`, never in code or the repo.
