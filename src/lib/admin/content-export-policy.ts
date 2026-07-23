export interface ContentExportPolicyInput {
  approvalStatus: string | null | undefined;
  bannedPhraseViolations: string[];
}

export function canExportApprovedContent({
  approvalStatus,
  bannedPhraseViolations,
}: ContentExportPolicyInput) {
  return approvalStatus === 'approved' && bannedPhraseViolations.length === 0;
}

export function contentExportBlockReason({
  approvalStatus,
  bannedPhraseViolations,
}: ContentExportPolicyInput) {
  if (bannedPhraseViolations.length > 0) return 'Needs revision';
  if (approvalStatus === 'rejected') return 'Rejected';
  if (approvalStatus === 'pending') return 'Awaiting approval';
  if (approvalStatus !== 'approved') return 'Not approved';
  return null;
}
