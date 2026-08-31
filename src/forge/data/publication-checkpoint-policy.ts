export type PublicationCheckpointStatus = 'publishing' | 'published' | 'reconcile';

export interface PublicationClaimState {
  publication_status: PublicationCheckpointStatus;
  publication_claimed: boolean;
}

export type PublicationClaimDecision = 'publish' | 'skip' | 'reconcile';

export function decidePublicationClaim(
  claim: PublicationClaimState,
): PublicationClaimDecision {
  if (claim.publication_claimed && claim.publication_status === 'publishing') return 'publish';
  if (!claim.publication_claimed && claim.publication_status === 'published') return 'skip';
  return 'reconcile';
}

// How long a checkpoint may sit in 'publishing' before we treat it as abandoned. Matches
// the threshold the monitoring cockpit already uses to flag stuck publications.
export const STALE_PUBLISHING_MINUTES = 30;

// A checkpoint needs an operator decision when the provider outcome is unknown. That is
// obviously true for 'reconcile', but also for a claim stuck in 'publishing': the serverless
// invocation that claimed it can die (timeout, crash, or a failed attempt to mark it for
// reconciliation) leaving the row claimed forever. Nothing reaps stale claims, so unless
// these surface to the operator the run can never publish or schedule again.
export function needsPublicationReconciliation(
  checkpoint: { status: PublicationCheckpointStatus; claimed_at?: string | null; updated_at?: string | null },
  nowIso: string,
  thresholdMinutes = STALE_PUBLISHING_MINUTES,
): boolean {
  if (checkpoint.status === 'reconcile') return true;
  if (checkpoint.status !== 'publishing') return false;

  const timestamp = checkpoint.updated_at ?? checkpoint.claimed_at ?? null;
  if (!timestamp) return false;
  const then = Date.parse(timestamp);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return false;
  return Math.max(0, Math.floor((now - then) / 60_000)) >= thresholdMinutes;
}

export function isPublicationRunComplete(input: {
  postCount: number;
  checkpoints: Array<{ post_index: number; status: PublicationCheckpointStatus }>;
  evidencePayloads: unknown[];
}): boolean {
  const hasLegacyWholeRunEvidence = input.evidencePayloads.some(
    (payload) =>
      !payload ||
      typeof payload !== 'object' ||
      !Number.isInteger((payload as Record<string, unknown>).postIndex),
  );
  if (hasLegacyWholeRunEvidence) return true;

  const publishedPostIndexes = new Set(
    input.checkpoints
      .filter((checkpoint) => checkpoint.status === 'published')
      .map((checkpoint) => checkpoint.post_index),
  );
  return (
    input.postCount > 0 &&
    Array.from({ length: input.postCount }, (_, postIndex) => postIndex).every((postIndex) =>
      publishedPostIndexes.has(postIndex),
    )
  );
}
