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
