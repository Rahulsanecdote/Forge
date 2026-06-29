# Architecture

Forge is a small, typed agent runtime around a provider-agnostic LLM, with
Supabase for persistence and Inngest for scheduling. This page explains each
moving part and how they connect.

## The agent loop — `runForge`

`src/forge/runtime.ts` is the heart of Forge:

```ts
runForge({ client, task }) → { text, steps }
```

1. **Resolve the model** for the configured provider (`resolveModel()`).
2. **Build the system prompt** from the client's brand voice — name, industry,
   tone, audience, dos/don'ts, banned phrases (`systemPrompt(client)`).
3. **Wrap each Forge tool** as an AI SDK tool, closing over the run context
   (`buildTools()`). The model sees the tool descriptions and chooses which to
   call.
4. **Run `generateText`** with `stopWhen: stepCountIs(6)` — the model can take up
   to 6 steps (tool calls + reasoning) before stopping.
5. **Log every tool call** to the `tool_runs` table (best-effort audit trail that
   doubles as case-study data).
6. **Return** the final text summary plus the structured `steps` (each tool's
   input and output).

The key design choice: **tools are provider-independent**. They receive a
`ToolContext` (`{ client, model }`) and never know which provider is behind
`model`. Swapping providers changes one env var, not any tool code.

## The tool contract — `ForgeTool`

Defined in `src/forge/types.ts`:

```ts
interface ForgeTool<TInput> {
  name: string;                  // e.g. "create_social_posts"
  description: string;           // the model uses this to decide when to call it
  schema: z.ZodType<TInput>;     // Zod schema → validated tool input
  execute(input: TInput, ctx: ToolContext): Promise<unknown>;
}

interface ToolContext {
  client: ClientContext;         // the business + its brand voice
  model: LanguageModel;          // the resolved, provider-agnostic model
}
```

Every capability — social posts, review replies, reports, keyword research,
competitor analysis — implements this one interface. Most tools call the LLM
themselves (via the AI SDK's `generateText`) with a prompt built from
`ctx.client.brandVoice`, then parse a JSON block out of the response with
`parseJsonBlock()`.

## The registry

`src/forge/registry.ts` is the tool suite:

```ts
export const tools: AnyForgeTool[] = [
  createSocialPosts,
  draftReviewResponses,
  generateReport,
  researchKeywords,
  analyzeCompetitors,
];
export const toolByName = new Map(tools.map((t) => [t.name, t]));
```

Add a tool here and the agent can choose it. See [Extending Forge](./extending.md).

## Provider resolution — `resolveModel`

`src/forge/model.ts` turns the configured provider into a single
`LanguageModel` the runtime and every tool share:

| `FORGE_PROVIDER` | SDK | Default model (`FORGE_MODEL` overrides) |
|---|---|---|
| `anthropic` | `@ai-sdk/anthropic` | `claude-sonnet-4-6` |
| `openai` | `@ai-sdk/openai` | `gpt-4o` |
| `google` | `@ai-sdk/google` | `gemini-1.5-pro` |
| `openai-compatible` | `@ai-sdk/openai-compatible` | `llama3.1` (requires `FORGE_BASE_URL`) |

Adding a provider = one `case` here plus a dependency. See
[Configuration](./configuration.md) for the full env reference.

## Configuration — `env`

`src/env.ts` validates `process.env` with Zod at startup. Required keys
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and the provider settings are
checked once; if anything's missing, Forge prints a clear message and exits
rather than throwing a stack trace mid-run.

> The validated config is a **process-level snapshot** read at import. That's
> ideal for a single-operator CLI. A multi-tenant dashboard where each user picks
> their own provider would resolve the model from per-client config instead — see
> the roadmap note in [Deployment](./deployment.md).

## Persistence — Supabase

`src/supabase.ts` creates a **service-role** Supabase client (bypasses RLS;
server-only — never ship it to a browser). `src/forge/clients.ts` handles the
mapping between the database's `snake_case` columns and Forge's `camelCase`
`ClientContext`:

- `upsertClient(cfg)` — insert/update a client + its brand voice from a config.
- `loadClient(slug)` — fetch one client (+ brand voice) for a run.
- `listClients()` — fetch all clients for the crons.

See [Data model](./data-model.md) for the schema.

## Clients and brand voice

A **client** is a business Forge works for. A **brand voice** is how Forge writes
for that client. Both come from a JSON config validated by `clientConfigSchema`
(`src/forge/client-config.ts`):

```jsonc
{
  "slug": "acme-coffee",
  "name": "Acme Coffee Co.",
  "industry": "Specialty coffee / cafe",
  "website": "https://example.com",
  "locations": 3,
  "brandVoice": {
    "tone": ["warm", "community-first", "unpretentious"],
    "about": "A neighborhood specialty-coffee shop...",
    "audience": "Students, remote workers, regulars...",
    "dos": ["sound like a friendly barista", "keep it short"],
    "donts": ["sound corporate", "overuse exclamation points"],
    "samplePosts": ["Cold brew season is officially open. Pull up."],
    "bannedPhrases": ["game-changer", "elevate your experience"]
  }
}
```

You can hand-author this (copy an example), or let Forge draft the brand voice
from a plain-language description — `generateClientConfig()` in
`src/forge/onboarding.ts` prompts the model for a brand-voice JSON, validates it,
and upserts the client.

## Scheduling — Inngest

`src/inngest/functions.ts` defines two cron jobs:

- **`weekly-content`** — generates next week's social posts for every client.
- **`review-sweep`** — drafts replies to new rows in the `reviews` table and
  flags ones that need a manager.

`src/inngest/server.ts` serves the Inngest endpoint locally on `:3030`. See
[Scheduled jobs](./scheduled-jobs.md).

## Data flow, end to end

```
client config (JSON) ──upsertClient──▶ clients + brand_voices
                                              │
CLI / cron ──runForge(client, task)──┐        │ loadClient / listClients
                                     ▼        ▼
                          systemPrompt(brandVoice) + model
                                     │
                          model picks a tool ──▶ tool.execute(input, ctx)
                                     │                     │
                                     │                     ├─ LLM call (brand-aware prompt)
                                     │                     └─ parseJsonBlock → structured output
                                     ▼
                          tool_runs (audit log)  ◀── every tool call
```
