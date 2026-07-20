# Forge — Build Context for Codex (`AGENTS.md`)

> **Version:** v1.14 · **Updated:** 2026-07-20 · **Repo:** `forge-agent`
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
    authority-policy.ts           pure permission-level evaluation
    authority.ts                  fail-closed database-backed agent/tool authorization
    types.ts                     ForgeTool contract, ClientContext, ToolContext{client,model}
    model.ts                     resolveModel(): FORGE_PROVIDER -> AI SDK LanguageModel
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
| 2026-07-06 | Phase 00 launch surface added as a Next.js 14 App Router site with waitlist capture, launch-board validation, production env-contract checks, and Supabase leads/profiles migration. |
| 2026-07-06 | Phase 02 portal foundation starts with a single-operator dashboard protected by `FORGE_ADMIN_PASSWORD`, using service-role Supabase reads only inside Server Components. |
| 2026-07-10 | Client operations moved into the portal with per-client profile editing, brand-voice editing, review/run history, and on-demand `runForge` execution from a protected Server Action. |
| 2026-07-16 | Tool-run audit records gained a server-rendered detail route with typed social-post previews and a generic JSON fallback; service-role reads remain server-side. |
| 2026-07-16 | Real social generation now treats each client's `about`, `dos`, and `donts` as a factual ceiling, validates exact structured output, and fails closed on banned phrases; client slugs are validated but editable so Onion can replace the legacy NutriAI identity without losing run history. |
| 2026-07-16 | Draft previews compare recorded output against the client's current banned phrases; noncompliant historical drafts remain immutable audit records but are visibly blocked from copy/publish workflows. |
| 2026-07-16 | Phase 02 content operations use a dedicated `content_approvals` row per generated social run. Generation queues a human decision; approval is revalidated against the client's current banned phrases, every mutation independently verifies the admin session, and database access remains server-only under the single-operator service-role model. |
| 2026-07-17 | Phase 02.5 establishes the AAL foundation against the schema that actually exists: `tool_runs` gains agent/state tracking; database-backed agents, tools, permissions, typed evidence, and audits fail closed before execution; all operator tables use RLS with service-role-only grants. Retry/checkpoint, resume, publishing, and rollback executors remain explicitly deferred rather than represented as built. |
| 2026-07-17 | Dashboard onboarding replaces the standalone wizard's shared coffee-shop demo values with authenticated, server-side website analysis. Findings come from current-request metadata and Schema.org data, missing evidence stays visibly unknown, private-network targets are rejected, and only operator-confirmed values are persisted. |
| 2026-07-17 | Client-assisted onboarding uses expiring, revocable, single-use invitation tokens stored only as hashes. Public routes can analyze and submit a complete factual brief through service-role-only RPCs, but submissions remain pending until the authenticated operator approves a review-only client; client auth and autonomous publishing remain deferred. |
| 2026-07-18 | The production Vercel root now enters the operator app at `/dashboard`; the public marketing surface remains available at `/marketing` so the app URL no longer defaults to the landing page during product previews. |
| 2026-07-18 | Next.js dependency remediation targets the lower-risk security backport line (`next@15.5.20` with React 19) rather than a direct Next 16 jump; App Router route props and cookie access were moved to the async Next 15 shape, and `outputFileTracingRoot` is pinned to this repo so builds ignore unrelated parent lockfiles. |
| 2026-07-19 | LaunchOps onboarding proof now has a repeatable production E2E harness (`npm run launch:onboarding:e2e`) that creates service-role invitations, verifies public token pages, runs production website analysis for two businesses, submits one complete brief, and verifies the pending operator-review row without printing secrets. |
| 2026-07-20 | The LaunchOps onboarding E2E harness defaults to the production Vercel app URL, not local `.env` app URLs, and its distinct-website gate now requires each production analysis to return an evidence-backed category, services, and source evidence before it can close the LaunchOps blocker. |
| 2026-07-20 | Website onboarding now reads a bounded first chunk from large HTML pages instead of failing solely on `content-length`, and includes visible body copy in the keyword pass so real SMB sites with sparse metadata can still produce evidence-backed service findings. |
| 2026-07-20 | Operator onboarding views hide LaunchOps E2E fixture records by default while retaining them as database evidence, and approved onboarding submissions now seed normalized brand-voice directives plus starter sample posts instead of blank examples. |

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
