# Forge — Build Context for Codex (`AGENTS.md`)

> **Version:** v1.1 · **Updated:** 2026-07-02 · **Repo:** `forge-agent`
> **How to use:** Codex reads this automatically as `AGENTS.md`. (Also works pasted into a
> Claude Code / Codex session at start, or renamed `CLAUDE.md`.) Read it fully before
> changing code. Obey the Non-Negotiables. Append to the Decision Log on any structural
> choice and bump this version on material edits.

---

## 0. Operating principles
- Production-first; no toy code. Types, error handling, env-var patterns, tests on critical paths.
- Tradeoffs are explicit. When ambiguous, propose 2 options + tradeoffs, then proceed and flag assumptions.
- **`npm run typecheck` must pass before any change is "done."** The repo currently compiles clean.

## 1. What Forge is (keep every choice aligned to this)
Open-source, self-hostable **AI marketing agent for any small business** — "Architect plans,
Forge executes." It is a **universal framework that each user specializes per vertical via a
brand-voice config.** That per-vertical specialization is the moat against horizontal SaaS
(GoHighLevel, Vendasta) — do **not** let it drift into a generic marketing chatbot. Business
model is open-core: free self-host now, managed cloud later. MIT licensed.

## 2. Current state — BUILT and COMPILING (do not rebuild)

```
src/
  env.ts                         zod-validated env (provider + Supabase + cron overrides)
  supabase.ts                    server-side Supabase client (service role)
  forge/
    types.ts                     ForgeTool contract, ClientContext, ToolContext{client,model}
    model.ts                     resolveModel(): env FORGE_PROVIDER -> buildModel()
    resolve-model.ts             buildModel(cfg): pure provider->LanguageModel (no env/Supabase)
    web-model.ts                 resolveWebModel(): process.env, Supabase-free (used by web app)
    runtime.ts                   runForge({client,task}) — AI SDK tool loop, logs tool_runs
    registry.ts                  the 5 tools the agent can choose
    client-config.ts             zod schema + loader for client JSON configs
    clients.ts                   upsertClient / loadClient / listClients (shared)
    onboarding.ts                generateClientConfig() — brand voice from a description
    util.ts                      parseJsonBlock
    tools/
      create-social-posts.ts     social posts in brand voice
      draft-review-responses.ts  rating-calibrated review replies + manager flag
      generate-report.ts         report from PROVIDED metrics (no fabrication)
      research-keywords.ts       keyword ideation by intent (no fake volumes)
      analyze-competitors.ts     positioning analysis from PROVIDED competitor details
  inngest/
    client.ts                    Inngest client (id: "forge")
    functions.ts                 crons: weekly-content, review-sweep
    server.ts                    minimal Node http server hosting /api/inngest
  web/
    demo.ts                      stateless demo layer: maps ClientConfig->ClientContext,
                                 calls generateClientConfig + real tools (no Supabase)
app/                             Next.js App Router web app (npm run dev/build/start)
  page.tsx                       interactive demo: describe -> brand voice -> posts/replies
  layout.tsx · globals.css       shell + styling
  api/onboard · generate · reviews  route handlers (nodejs runtime) over src/web/demo.ts
next.config.mjs                  Next config (eslint ignored during build)
scripts/
  onboard.ts                     forge:onboard  "Name" "description"
  add-client.ts                  forge:client:add  <config.json>
  run.ts                         forge:run  <slug> "<task>"
examples/                        acme-coffee.json, bright-smile-dental.json (two verticals)
supabase/migrations/             0001_init.sql (clients, brand_voices, tool_runs, client_memory)
                                 0002_reviews.sql (reviews queue for the sweep)
LICENSE · CONTRIBUTING.md · .github/ (PR + issue templates)
```

## 3. Stack — VERIFIED versions, use these APIs (not older patterns)

| Package | Version | Notes |
|---|---|---|
| `ai` (Vercel AI SDK) | ^6.0 | `tool({ inputSchema, execute })`, `generateText({ maxOutputTokens })`, `stopWhen: stepCountIs(n)` |
| `@ai-sdk/anthropic` / `openai` / `google` | ^3.0 | `provider('model-id')` |
| `@ai-sdk/openai-compatible` | ^2.0 | `createOpenAICompatible({ name, baseURL })` — local models |
| `zod` | ^4.4 | use `z.toJSONSchema()` (native); top-level `z.url()` etc. — string `.url()` is deprecated |
| `inngest` | ^4.9 | `createFunction({ id, triggers: [{ cron }] }, handler)` — **2 args**, trigger is inside opts |
| `@supabase/supabase-js` | ^2 | untyped client (no generated DB types yet) |
| `typescript` ^6 · `tsx` ^4 · `@types/node` ^26 | | ESM, `"moduleResolution": "Bundler"`, run via `tsx` |

Reasoning model default `claude-sonnet-4-6`; override with `FORGE_MODEL`.

## 4. Architecture & patterns

**Provider-agnostic model.** `resolveModel()` maps `FORGE_PROVIDER` (`anthropic|openai|google|openai-compatible`) + `FORGE_MODEL` to one `LanguageModel`. It flows through `ToolContext.model`, so tools are provider-agnostic too. Local models work via `openai-compatible` + `FORGE_BASE_URL` (Ollama/LM Studio/vLLM/LiteLLM).

**Add a tool:** create `src/forge/tools/<name>.ts` exporting a `ForgeTool` (`name`, `description`, zod `schema`, `execute(input, ctx)`), then add it to `registry.ts`. Read all business specifics from `ctx.client` / `ctx.client.brandVoice`. For LLM calls inside a tool, use `generateText({ model: ctx.model, prompt, maxOutputTokens })`.

**Add a provider:** add a `case` to `resolveModel()` + the key to `env.ts` and `.env.example`.

**Runtime:** `runForge` builds a brand-voice system prompt, wraps each `ForgeTool` as an AI SDK tool (closing over `ctx`), runs `generateText` with `stopWhen: stepCountIs(6)`, and logs each tool run to `tool_runs`.

**Autopilot:** Inngest crons in `functions.ts` (`weekly-content` Mon 09:00 UTC; `review-sweep` daily 08:00 UTC), served by the Node server in `server.ts`. The sweep acts on `reviews` rows with `status='new'`.

## 5. Non-negotiables (do not violate without an explicit, logged override)
1. **Honesty.** Tools must never fabricate. No invented metrics, search volumes, or competitor facts. When real data is required, document the seam (DataForSEO / GA4 / GBP) and degrade to ideation — never to fiction. This is the trust foundation for an OSS tool used on real client work.
2. **Secrets server-side only.** The Supabase **service-role key never reaches a browser bundle.** Provider keys via env. Ship `.env.example`, commit no secrets, no real client data.
3. **Tools stay vertical-agnostic.** Everything business-specific comes from `ctx.client`. Never hardcode a business.
4. **Keep the `ForgeTool` contract stable** — it's the contributor surface.
5. **TypeScript strict; no `any` in new code** beyond the existing untyped-Supabase boundary.
6. **RLS** lands when the multi-tenant portal does (see roadmap). The alpha is single-operator via the service role — fine for now, not for multi-tenant.

## 6. What to build next — ordered backlog

**Lane A — Live data (highest value; turns tools from ideation to real).**
- `research_keywords`: integrate **DataForSEO** behind a small `data/keywords.ts` provider; add real volume/difficulty; keep an ideation fallback when no key is set.
- `generate_report`: pull metrics from **GA4 + Search Console** instead of requiring pasted input.
- `review-sweep`: a **Google Business Profile** integration that inserts new reviews into the `reviews` table.

**Lane B — Portal.**
- Next.js (App Router) dashboard: clients, brand-voice editor, run history (`tool_runs`), a **content approval queue** for generated posts.
- Multi-tenant auth + **RLS policies** at this point.

**Lane C — OSS launch.**
- README demo GIF, one-click deploy (Vercel/Render), `client_memory` retrieval (pgvector; pick an embedding model — table is dimensioned 768 for Google `text-embedding-004`), then launch (HN / Product Hunt).

## 7. Run & verify
```bash
npm install
# apply supabase/migrations/*.sql in your Supabase project
cp .env.example .env            # FORGE_PROVIDER + its key + Supabase URL/service key
npm run forge:onboard "Acme Coffee" "Neighborhood specialty cafe, warm and unpretentious"
npm run forge:run acme-coffee "Research local SEO keywords, then draft 3 posts"
npm run forge:serve             # + `npx inngest-cli@latest dev` for crons
npm run typecheck               # must pass
```

## 8. Decision log
| Date | Decision |
|---|---|
| 2026-06-23 | Runtime built on the **Vercel AI SDK** (not the direct Anthropic SDK) once the goal became universal + bring-your-own-model — unified tool-calling across providers + local models. |
| 2026-06-23 | `ForgeTool` contract kept **provider-independent**; the runtime adapts tools to the AI SDK. |
| 2026-06-23 | **Honesty constraint** on all tools: no fabricated metrics/competitor facts; document data seams. |
| 2026-06-23 | **Config-driven, multi-vertical** onboarding (JSON or `forge:onboard`); no business hardcoded. |
| 2026-06-23 | **CLI-first**; only a minimal Node server for Inngest. Next.js portal deferred to Lane B. |
| 2026-06-23 | **RLS deferred** to the multi-tenant portal; alpha is single-operator via service role. |
| 2026-06-23 | Positioning: **universal framework, specialized per vertical via config** (open-core). |
| 2026-07-02 | Extracted pure `buildModel()` into `resolve-model.ts`; `model.ts` (env) and `web-model.ts` (process.env) both use it — lets the web app resolve a model without importing the Supabase-strict `env.ts`. |
| 2026-07-02 | Added a **Next.js App Router web app** (Lane C-ish, ahead of the multi-tenant portal). Runs the demo **stateless** — no Supabase, no persistence — reusing `generateClientConfig()` + real `ForgeTool.execute()`. Model key is the only requirement, so anyone can try Forge. Persisted portal + auth/RLS remain Lane B. |

## 9. Conventions
- Conventional Commits (`feat:`, `fix:`, `docs:`…). One focused change per PR.
- Validate external input with **zod**. No silent failures — especially in tool `execute` and cron steps.
- Keep tool prompts inside their tool file; return strict JSON and parse with `parseJsonBlock`.
- Update this file's Decision Log + version when you make a structural change.

## 10. Suggested first Codex task
> Read `AGENTS.md`. Implement **Lane A · DataForSEO** for `research_keywords`: add a
> `src/forge/data/keywords.ts` provider that fetches real search volume + difficulty from
> DataForSEO using a `DATAFORSEO_*` env credential; wire it into `research-keywords.ts` so
> results include real numbers, falling back to the current ideation-only output when no
> credential is set. Keep the `ForgeTool` contract unchanged, add the env vars to `env.ts`
> and `.env.example`, and ensure `npm run typecheck` passes. Then log the decision here.

(Alternatives if you'd rather start elsewhere: Lane B portal scaffold, or Lane A GA4 report metrics.)
