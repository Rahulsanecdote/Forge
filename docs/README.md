# Forge documentation

**Forge** is an open-source, self-hostable vertical AI marketing agent. Point it
at a business — a cafe, a dental practice, a gym, a law firm — and it produces
on-brand marketing work in that business's voice: social posts, review replies,
performance reports, keyword ideas, and competitor analysis. It's
provider-agnostic (Anthropic, OpenAI, Google, or any local/OpenAI-compatible
model) and stores everything in your own Supabase.

> **Architect plans, Forge executes.** Nothing in the code is business-specific —
> each business is a row in the database plus a brand voice, added from a JSON
> config with no code changes.

## Start here

| If you want to… | Read |
|---|---|
| Run everything locally (Supabase + Ollama, no cloud) | **[Running locally](./RUNNING_LOCALLY.md)** |
| Understand how Forge is put together | [Architecture](./architecture.md) |
| Configure providers, models, and env vars | [Configuration](./configuration.md) |
| Use the command-line tools | [CLI reference](./cli.md) |
| Know what each capability does | [Tools reference](./tools.md) |
| Understand the database tables | [Data model](./data-model.md) |
| Run the weekly/daily automations | [Scheduled jobs](./scheduled-jobs.md) |
| Add a tool, provider, or client | [Extending Forge](./extending.md) |
| Deploy to production | [Deployment](./deployment.md) |

## The 60-second mental model

```
CLI · Inngest crons · (future portal)
      │
      ▼
runForge(client, task)              ← src/forge/runtime.ts
  ├─ system prompt = that client's brand voice
  ├─ the model decides which tool to call
  ├─ tool.execute(input, ctx)       ← each tool reads everything from ctx.client
  ├─ append result, loop (max 6 steps)
  └─ log every run → tool_runs
            │
            ▼
        Supabase (clients · brand_voices · tool_runs · reviews · client_memory*)
```

- **Provider-agnostic** — one env var (`FORGE_PROVIDER`) picks Anthropic, OpenAI,
  Google, or a local OpenAI-compatible server (Ollama, LM Studio, vLLM, LiteLLM).
- **Typed tool system** — every capability implements one `ForgeTool` interface;
  adding a tool is the main extension point.
- **Brand voice as data** — each client's tone, audience, dos/don'ts, sample
  posts, and banned phrases live in the database and are injected into every
  prompt.

## Repository layout

```
src/
  env.ts                 # validated environment configuration
  supabase.ts            # service-role Supabase client (server-only)
  forge/
    types.ts             # ForgeTool, ToolContext, ClientContext, BrandVoice
    runtime.ts           # runForge() — the agent loop
    model.ts             # resolveModel() — provider → LanguageModel
    registry.ts          # the tool suite
    clients.ts           # load/list/upsert clients + brand voices
    client-config.ts     # client JSON config schema + loader
    onboarding.ts        # LLM-drafted brand voice from a description
    util.ts              # parseJsonBlock helper
    tools/               # the five capabilities
  inngest/
    client.ts            # Inngest client
    functions.ts         # weekly-content + review-sweep crons
    server.ts            # local Inngest HTTP endpoint
scripts/                 # CLIs: onboard, add-client, run, serve
examples/                # example client configs
supabase/migrations/     # core schema (no extensions required)
supabase/optional/       # pgvector client_memory (reserved for later)
docs/                    # you are here
```

## License

MIT. PRs welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
