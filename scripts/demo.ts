import 'dotenv/config';

// The 5-minute demo (docs/demo.md). Assumes the local stack from
// docs/RUNNING_LOCALLY.md is up: local Supabase (migrations applied) + a model
// provider (Ollama via FORGE_PROVIDER=openai-compatible, or a hosted key).
//
//   npm run forge:demo
//
// Part 1 seeds the Acme Coffee example and runs one governed task through
// runForge — the model picks the tool, the authority layer permits it, the run
// is recorded in tool_runs, and create_social_posts leaves a pending approval
// in content_approvals. Part 2 exercises Fleetlog through the tool contract
// directly (deterministic — not left to model choice) with a sample entry
// labelled as demo data. The script ends by printing the stored evidence.

const DEMO_TASK = 'Create 2 Instagram posts announcing that cold brew season is open';

function fail(message: string): never {
  console.error(`\nDemo preflight failed: ${message}`);
  process.exit(1);
}

async function main() {
  // Preflight 1 — required env, checked before importing env-validated modules
  // so a missing .env produces guidance, not a stack trace.
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    (key) => !process.env[key]?.trim(),
  );
  if (missing.length > 0) {
    fail(
      `missing ${missing.join(', ')}. Copy .env.example to .env and fill in the ` +
        'values from `supabase status` — see docs/RUNNING_LOCALLY.md steps 3-4.',
    );
  }

  const { supabase } = await import('../src/supabase');
  const { loadClientConfig } = await import('../src/forge/client-config');
  const { upsertClient, loadClient } = await import('../src/forge/clients');
  const { runForge } = await import('../src/forge/runtime');
  const { resolveModel } = await import('../src/forge/model');
  const { logFailure } = await import('../src/forge/tools/log-failure');
  const { reviewFailures } = await import('../src/forge/tools/review-failures');

  // Preflight 2 — the database answers.
  const { error: dbError } = await supabase.from('clients').select('id').limit(1);
  if (dbError) {
    fail(
      `cannot reach Supabase at ${process.env.SUPABASE_URL} (${dbError.message}). ` +
        'Is the local stack running? `supabase start`, then `supabase db reset` to apply migrations.',
    );
  }

  // Preflight 3 — for the local/offline provider, the model server answers.
  if ((process.env.FORGE_PROVIDER ?? 'anthropic') === 'openai-compatible') {
    const base = process.env.FORGE_BASE_URL;
    if (!base) {
      fail('FORGE_BASE_URL is required for FORGE_PROVIDER=openai-compatible (e.g. http://localhost:11434/v1).');
    }
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      fail(
        `cannot reach the model server at ${base} (${error instanceof Error ? error.message : String(error)}). ` +
          'Is Ollama running? `ollama serve`, and pull the model from FORGE_MODEL (default llama3.1).',
      );
    }
  }

  console.log('\n=== Forge demo — Part 1: governed run ===');
  const seeded = await upsertClient(loadClientConfig('examples/acme-coffee.json'));
  const client = await loadClient(seeded.slug);
  console.log(`Seeded "${client.name}" (${client.slug}).`);
  console.log(`Task: ${DEMO_TASK}\n`);

  const result = await runForge({ client, task: DEMO_TASK });
  console.log('--- Agent summary ---\n' + result.text);
  for (const step of result.steps) {
    console.log(`\n[tool] ${step.tool} (run ${step.runId})`);
  }
  if (!result.steps.some((s) => s.tool === 'create_social_posts')) {
    console.warn(
      '\nNote: the model did not choose create_social_posts this run, so no approval ' +
        'checkpoint was created. That is model behaviour, not a setup failure — re-run, ' +
        'or point FORGE_MODEL at a stronger local model.',
    );
  }

  console.log('\n=== Forge demo — Part 2: Fleetlog ===');
  const ctx = { client, model: resolveModel() };
  const logged = (await logFailure.execute(
    {
      task: 'Forge 5-minute demo (sample entry)',
      did: 'Recorded this sample failure entry to prove the failure-log loop end to end.',
      shouldHave: 'Sample entries are labelled as demo data and deleted after review.',
      caughtBy: 'demo script',
      severity: 'P3',
      rootCauseClass: 'demo-sample',
    },
    ctx,
  )) as { repeatCount: number };
  console.log(`log_failure recorded the sample entry (repeat count for its class: ${logged.repeatCount}).`);
  const digest = (await reviewFailures.execute({}, ctx)) as {
    total: number;
    candidateRules: unknown[];
  };
  console.log(`review_failures digest: ${digest.total} failure(s) logged for this client, ${digest.candidateRules.length} candidate rule(s).`);

  console.log('\n=== Evidence (stored rows) ===');
  const { data: runs } = await supabase
    .from('tool_runs')
    .select('tool, status, started_at')
    .eq('client_id', client.id)
    .order('started_at', { ascending: false })
    .limit(5);
  for (const run of runs ?? []) {
    console.log(`tool_runs: ${run.tool} — ${run.status} — ${run.started_at}`);
  }
  const { data: approvals } = await supabase
    .from('content_approvals')
    .select('status, requested_at')
    .eq('client_id', client.id)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(5);
  console.log(`content_approvals: ${approvals?.length ?? 0} pending approval(s) for this client.`);
  console.log(
    '\nDemo complete. Generated posts wait in the operator dashboard / content_approvals ' +
      'until a human approves them — nothing publishes itself.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
