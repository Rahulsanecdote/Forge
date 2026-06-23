# Contributing to Forge

Thanks for helping build an open marketing agent. Forge is intentionally small and
extensible — most contributions are a new tool or a new LLM provider.

## Dev setup

```bash
npm install
cp .env.example .env          # fill in your keys
# run supabase/migrations/0001_init.sql in your Supabase project
npm run forge:client:add examples/acme-coffee.json
npm run forge:run acme-coffee "Write 3 Instagram posts about a new seasonal drink"
npm run typecheck
```

## Project layout

```
src/forge/
  runtime.ts      # the agent loop (model-agnostic in structure)
  registry.ts     # list of available tools
  types.ts        # ForgeTool contract + ClientContext
  client-config.ts# validated client config loader
  tools/          # one file per tool
scripts/          # CLI entrypoints (add-client, run)
examples/         # sample client configs across verticals
supabase/         # schema
```

## Add a tool

1. Create `src/forge/tools/your-tool.ts` exporting a `ForgeTool`:
   - `name`, `description`, a zod `schema`, and an `execute(input, ctx)`.
   - `ctx` gives you the client, its brand voice, and the configured `model` (call it with the AI SDK's `generateText`).
2. Register it in `src/forge/registry.ts`.
   That's it — the agent can now choose your tool.

Keep tools **vertical-agnostic**: read everything business-specific from
`ctx.client` / `ctx.client.brandVoice`, never hardcode a particular business.

## Add a client (no code)

Copy an `examples/*.json` file, edit the brand voice for any business, and run
`npm run forge:client:add path/to/your.json`. Keep real client configs out of the repo.

## Add an LLM provider

Forge resolves a provider + model in `src/forge/model.ts` via the Vercel AI SDK. To add one:

1. `npm install @ai-sdk/<provider>`
2. Add a `case` to `resolveModel()` returning the provider's model.
3. Add its key to `.env.example` and `src/env.ts`.

Local and self-hosted models already work via `FORGE_PROVIDER=openai-compatible` (Ollama,
LM Studio, vLLM, LiteLLM) — no code needed.

## Style & PRs

- TypeScript strict; run `npm run typecheck` before pushing.
- Conventional Commits (`feat:`, `fix:`, `docs:` …).
- One focused change per PR. Describe what and why.
