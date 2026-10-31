# The 5-minute demo

One command that proves the governed loop end to end — seed a client, let the
model pick a tool, watch the authority layer permit it, the run land in
`tool_runs`, and the generated content stop at a **human approval checkpoint**
instead of publishing itself. Then the same loop for failures: Fleetlog records
one and reviews it.

## Before you start (one-time, ~4 minutes)

Follow [RUNNING_LOCALLY.md](./RUNNING_LOCALLY.md) steps 1–4:

1. Docker running, Supabase CLI and Ollama installed.
2. `npm install`
3. `supabase start` and `supabase db reset` (applies every migration, including
   the Fleetlog table and the tool registrations the authority layer checks).
4. `.env` with the local Supabase URL + service-role key, and
   `FORGE_PROVIDER=openai-compatible`, `FORGE_BASE_URL=http://localhost:11434/v1`
   (or a hosted provider + key instead of Ollama).
5. `ollama pull llama3.1` (the default local model).

## Run it

```bash
npm run forge:demo
```

Preflight runs first: missing env, an unreachable database, or a silent model
server each fail with the exact fix, not a stack trace.

## What it does

**Part 1 — governed run.** Seeds `examples/acme-coffee.json` (idempotent), then
runs one task through `runForge`:

> Create 2 Instagram posts announcing that cold brew season is open

The model is expected to choose `create_social_posts`. That call passes through
the same path as any production run: authority check against `forge_tools` /
`forge_agent_tool_permissions`, a `tool_runs` row, output evidence in
`forge_run_evidence`, and — because the tool produces content — a **pending**
row in `content_approvals`. Nothing is published; a human approves in the
operator dashboard.

If the model chooses a different tool, the demo says so plainly and no approval
row appears. That is model behaviour (small local models vary), not a setup
failure — re-run, or set `FORGE_MODEL` to a stronger model.

**Part 2 — Fleetlog.** Invokes `log_failure` directly through the tool contract
(deterministic — this step is not left to model choice) with a sample entry
clearly labelled as demo data, then `review_failures` for the digest.

**Evidence.** The script finishes by printing the stored rows: the latest
`tool_runs` for the client with their statuses, and the count of pending
`content_approvals`. Check them yourself any time:

```sql
select tool, status, started_at from tool_runs
where client_id = (select id from clients where slug = 'acme-coffee')
order by started_at desc limit 5;

select status, requested_at from content_approvals
where client_id = (select id from clients where slug = 'acme-coffee');

select severity, root_cause_class, task from failure_log
where client_id = (select id from clients where slug = 'acme-coffee');
```

## What this demo does not prove

- **Model quality.** Post quality is the model's, not the runtime's. The demo
  proves governance — permissioning, recording, approval gating — which is the
  part Forge is responsible for.
- **Publishing.** Approval is where the demo stops, by design. Publishing flows
  live behind the approval decision in the dashboard.
- **Hosted providers** work through the same path (`FORGE_PROVIDER=anthropic`
  etc.); the demo's model preflight only probes the local
  `openai-compatible` endpoint.
