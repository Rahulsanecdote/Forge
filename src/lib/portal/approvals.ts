import 'server-only';
import { getAdminSupabase } from '@/lib/admin/data';
import { findBannedPhraseViolations } from '@/lib/admin/run-output';

// Client self-approval write path. SECURITY: every query is scoped to the verified
// `clientId` from the portal session — the sole tenant boundary — so a client can only
// ever decide their own content. Mirrors the operator approval path: re-checks banned
// phrases before approving, guards on status to prevent double-decide, and records durable
// approval evidence (rolling the decision back if the evidence write fails).

export type PortalApprovalResult = 'approved' | 'rejected' | 'not_found' | 'blocked' | 'error';

interface ApprovalRow {
  id: string;
  status: string;
  tool_runs: { output: unknown } | { output: unknown }[] | null;
}

function runOutput(row: ApprovalRow): unknown {
  const run = Array.isArray(row.tool_runs) ? row.tool_runs[0] : row.tool_runs;
  return run?.output ?? null;
}

export async function decideClientApproval(
  clientId: string,
  runId: string,
  decision: 'approved' | 'rejected',
): Promise<PortalApprovalResult> {
  const supabase = getAdminSupabase();

  // Load the pending approval, scoped to this client (tenant boundary).
  const { data: approval } = await supabase
    .from('content_approvals')
    .select('id, status, tool_runs(output)')
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .maybeSingle();
  const row = approval as ApprovalRow | null;
  if (!row || row.status !== 'pending') return 'not_found';

  // Approving must still respect the client's banned phrases (same gate as the operator).
  // Fail closed: if the lookup errors we can't prove the draft is clean, so don't approve.
  if (decision === 'approved') {
    const { data: voice, error: voiceError } = await supabase
      .from('brand_voices')
      .select('banned_phrases')
      .eq('client_id', clientId)
      .maybeSingle();
    if (voiceError) return 'error';
    const banned = ((voice as { banned_phrases?: string[] } | null)?.banned_phrases ?? []) as string[];
    if (findBannedPhraseViolations(runOutput(row), banned).length > 0) return 'blocked';
  }

  const { data: updated, error } = await supabase
    .from('content_approvals')
    .update({
      status: decision,
      notes: 'Client self-approval (portal).',
      decided_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error || !updated) return 'error';

  const { error: evidenceError } = await supabase.from('forge_run_evidence').insert({
    run_id: runId,
    kind: 'approval',
    description: `Content draft ${decision} by the client via the self-approval portal.`,
    payload: { decision, decidedBy: 'client_portal' },
  });
  if (evidenceError) {
    // Roll back so the decision and its durable evidence stay consistent.
    await supabase
      .from('content_approvals')
      .update({ status: 'pending', notes: null, decided_at: null })
      .eq('id', row.id)
      .eq('status', decision);
    return 'error';
  }

  return decision;
}
