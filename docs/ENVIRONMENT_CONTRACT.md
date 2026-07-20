# Environment Contract

Fail-closed rules for every environment variable Forge carries. Validated by
`scripts/validate-env.mjs` (run in CI and before production deploys).

## Server (fail closed in production)

| Variable | Rule |
|---|---|
| `SUPABASE_URL` | Required by the agent runtime (CLI, Inngest). |
| `SUPABASE_SERVICE_ROLE_KEY` | Required, **server-only**. Never expose to a browser. App refuses to deploy if missing in prod. |
| `FORGE_ADMIN_PASSWORD` | Required in production for the single-operator dashboard. Server-only; stored as an HttpOnly signed session cookie after login. |
| `ANTHROPIC_API_KEY` (or provider key matching `FORGE_PROVIDER`) | Required for the agent runtime. |
| `INNGEST_SIGNING_KEY` | Required in production once Inngest jobs are live. |
| `STRIPE_WEBHOOK_SECRET` | Required once billing is live (Phase 03). |
| `GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN` | Optional short-lived server-only credential for review import. Prefer refresh-token credentials in production. |
| `GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN` + `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` | Optional server-only OAuth credentials for GBP review import. |
| `GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID` / `GOOGLE_BUSINESS_PROFILE_LOCATION_ID` | Optional global GBP account/location fallback. Per-client dashboard values override these. |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Optional server-only credentials for `research_keywords` metrics. Missing credentials keep the tool in ideation-only mode. |
| `DATAFORSEO_LOCATION_CODE` / `DATAFORSEO_LOCATION_NAME` | Optional DataForSEO target location for keyword metrics. Defaults to US location code `2840`. |
| `DATAFORSEO_LANGUAGE_CODE` / `DATAFORSEO_LANGUAGE_NAME` | Optional DataForSEO target language for keyword metrics. Defaults to `en`. |
| `DATAFORSEO_INCLUDE_CLICKSTREAM` | Optional `true`/`false`; when true, asks DataForSEO for clickstream-normalized keyword volume where available. |

## Public (must never contain secrets)

| Variable | Rule |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. Safe to ship. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/publishable key only — RLS is the security boundary. |
| `NEXT_PUBLIC_APP_URL` | Canonical site URL. |

The validator rejects any `NEXT_PUBLIC_` variable whose value looks like a
secret (`sk-…`, service-role JWTs).

## Dev only (impossible in production)

| Variable | Rule |
|---|---|
| `AUTH_DISABLED=true` | Hard-fail if set while `NODE_ENV=production`. |

## Where values live

- Local: `.env` (agent runtime) and `.env.local` (Next.js site). Both are gitignored.
- Production: Vercel project env vars. Server secrets marked as such, never `NEXT_PUBLIC_`.
