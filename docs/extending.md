# Extending Forge

Forge is built to be extended. The three most common extensions: adding a tool,
adding a model provider, and adding a client.

## Add a tool

Adding a tool is the main extension point — implement the `ForgeTool` interface
and register it, and the agent can choose it.

### 1. Create the tool

`src/forge/tools/my-tool.ts`:

```ts
import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const schema = z.object({
  topic: z.string().describe('What to write about.'),
  count: z.number().int().min(1).max(10).default(3),
});

type Input = z.infer<typeof schema>;

interface Result {
  items: string[];
}

export const myTool: ForgeTool<Input> = {
  name: 'my_tool',                       // unique; the model refers to it by this
  description:
    'One clear sentence on WHAT it does and WHEN to use it — the model uses this to decide.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;    // brand voice is always available
    const prompt = [
      `Do the thing for ${ctx.client.name}.`,
      `Topic: ${input.topic}. Count: ${input.count}.`,
      `Tone: ${bv.tone.join(', ') || 'natural'}.`,
      bv.bannedPhrases.length ? `Never use: ${bv.bannedPhrases.join(', ')}.` : '',
      '',
      'Return ONLY JSON: {"items": string[]}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    return parseJsonBlock<Result>(text) ?? { items: [] };   // graceful fallback
  },
};
```

Conventions worth following (they match the existing tools):

- **`description`** should state when to use the tool — the model selects on it.
- Build the prompt from `ctx.client.brandVoice` so output is on-brand.
- Ask for **JSON only, no code fences**, and parse with `parseJsonBlock()`.
- **Fall back to an empty result** on parse failure instead of throwing.
- Never instruct the model to invent facts/metrics — keep the no-fabrication
  guardrail where it applies.

### 2. Register it

`src/forge/registry.ts`:

```ts
import { myTool } from './tools/my-tool';

export const tools: AnyForgeTool[] = [
  createSocialPosts,
  draftReviewResponses,
  generateReport,
  researchKeywords,
  analyzeCompetitors,
  myTool,                // ← add here
];
```

That's it. `runForge` now exposes `my_tool` to the model, logs its runs to
`tool_runs`, and a task that matches its description will trigger it:

```bash
npm run forge:run -- acme-coffee "Use my tool to do the thing about cold brew"
```

### 3. Typecheck

```bash
npm run typecheck
```

## Add a model provider

`src/forge/model.ts` resolves the provider into a `LanguageModel`. To add one:

1. **Add the dependency** (an AI SDK provider package).
2. **Add a `case`** in `resolveModel()`:

   ```ts
   case 'my-provider':
     return myProvider(model);
   ```

3. **Add a default model** in `DEFAULT_MODEL`.
4. **Extend the enum** in `src/env.ts`:

   ```ts
   FORGE_PROVIDER: z.enum(['anthropic', 'openai', 'google', 'openai-compatible', 'my-provider'])
     .default('anthropic'),
   ```

Because tools receive the resolved `model` via `ctx`, no tool code changes.

> Most local/self-hosted servers already work through the existing
> `openai-compatible` provider (set `FORGE_BASE_URL`) — you only need a new case
> for a provider with a distinct SDK.

## Add a client

Two ways — see the [CLI reference](./cli.md):

```bash
# From a description (Forge drafts the brand voice)
npm run forge:onboard -- "My Cafe" "A cozy neighborhood coffee shop..."

# From a JSON config (full control)
cp examples/acme-coffee.json my-business.json   # edit it
npm run forge:client:add -- my-business.json
```

The config shape is defined by `clientConfigSchema` in
`src/forge/client-config.ts`; see [Data model](./data-model.md) for the fields.

## Project conventions

- **TypeScript, ESM, strict mode.** `tsc --noEmit` must pass (`npm run typecheck`).
- Match the surrounding code's style, comment density, and idioms.
- Keep tools provider-independent — never reference a specific provider inside a
  tool; use `ctx.model`.
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for PR guidance.
