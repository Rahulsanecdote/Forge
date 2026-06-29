# CLI reference

Forge ships four command-line entry points (in `scripts/`), exposed as npm
scripts. With npm, **pass arguments after `--`** so they reach the script.

| Script | Command | Purpose |
|---|---|---|
| Onboard | `npm run forge:onboard -- "<name>" "<description>"` | Create a client; Forge drafts the brand voice from a description. |
| Add client | `npm run forge:client:add -- <path/to/config.json>` | Create/update a client from a JSON config. |
| Seed | `npm run forge:seed` | Shortcut: adds `examples/acme-coffee.json`. |
| Run | `npm run forge:run -- <client-slug> "<task>"` | Run a task for a client. |
| Serve | `npm run forge:serve` | Serve the Inngest endpoint on `:3030` (for crons). |
| Typecheck | `npm run typecheck` | `tsc --noEmit`. |

## `forge:onboard` — create a client from a description

Forge drafts a full brand voice (tone, audience, dos/don'ts, sample posts, banned
phrases) from a plain-language description, validates it, and upserts the client.

```bash
npm run forge:onboard -- "Bright Smile Dental" "A gentle family dental practice focused on anxiety-free care"
```

Output includes the generated brand voice and the next command to run. The
generated config is validated against `clientConfigSchema` before saving.

## `forge:client:add` — create a client from a JSON config

For full control, hand-author a config (copy an example and edit) and add it:

```bash
cp examples/acme-coffee.json my-business.json
# edit name, industry, tone, audience, dos/donts, sample posts, banned phrases
npm run forge:client:add -- my-business.json
```

The config is validated against `clientConfigSchema`; invalid configs are
rejected with a Zod error. Re-running with the same `slug` updates the existing
client (upsert on `slug`). See [Data model](./data-model.md) for the config
shape.

## `forge:seed` — quick start with an example

```bash
npm run forge:seed     # equivalent to: forge:client:add -- examples/acme-coffee.json
```

(The path is baked into the script, so no `--` is needed.)

## `forge:run` — run a task

```bash
npm run forge:run -- acme-coffee "Write 3 Instagram posts for a new oat-milk cold brew"
npm run forge:run -- acme-coffee "Draft replies to our latest Google reviews"
npm run forge:run -- bright-smile-dental "Turn these metrics into an April report: IG followers 1240 (+8%), Google rating 4.6"
```

The model picks the right tool for the task. Output is a summary plus each tool's
structured JSON output. Every run is logged to `tool_runs`.

If the client doesn't exist yet, you'll get:
`Client "<slug>" not found. Run "npm run forge:client:add" or "npm run forge:onboard" first.`

## `forge:serve` — run the scheduled jobs locally

```bash
npm run forge:serve              # serves http://localhost:3030/api/inngest
npx inngest-cli@latest dev       # in another terminal — discovers it, runs crons
```

See [Scheduled jobs](./scheduled-jobs.md).

## The `--` gotcha

`npm run forge:run acme-coffee "..."` (without `--`) may not forward the
arguments to the script — always use `npm run forge:run -- acme-coffee "..."`.
The `forge:seed` script is the exception (its argument is baked in).
