import { z } from 'zod';

import { supabase } from '../../supabase';
export { decidePublicationClaim } from './publication-checkpoint-policy';

export const publicationPlatformSchema = z.enum([
  'google_business',
  'facebook',
  'instagram',
]);
export type PublicationPlatform = z.infer<typeof publicationPlatformSchema>;

const publicationClaimSchema = z.object({
  publication_id: z.uuid(),
  publication_status: z.enum(['publishing', 'published', 'reconcile']),
  publication_claimed: z.boolean(),
  publication_reference: z.string().nullable(),
});

export type PublicationClaim = z.infer<typeof publicationClaimSchema>;

export async function claimContentPublication(input: {
  runId: string;
  clientId: string;
  postIndex: number;
  platform: PublicationPlatform;
}): Promise<PublicationClaim> {
  const { data, error } = await supabase.rpc('claim_content_publication', {
    p_run_id: input.runId,
    p_client_id: input.clientId,
    p_post_index: input.postIndex,
    p_platform: input.platform,
  });
  if (error) throw error;

  const parsed = publicationClaimSchema.safeParse(Array.isArray(data) ? data[0] : data);
  if (!parsed.success) {
    throw new Error(`Invalid publication claim response: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function finalizeContentPublication(input: {
  publicationId: string;
  reference: string;
  description: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc('finalize_content_publication', {
    p_publication_id: input.publicationId,
    p_reference: input.reference,
    p_payload: input.payload,
    p_description: input.description,
  });
  if (error) throw error;
}

export async function markContentPublicationForReconciliation(
  publicationId: string,
  errorMessage: string,
) {
  const { data, error } = await supabase.rpc('mark_content_publication_for_reconciliation', {
    p_publication_id: publicationId,
    p_error: errorMessage,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error('Publication checkpoint could not be marked for reconciliation.');
  }
}

export async function releaseContentPublicationClaim(publicationId: string) {
  const { data, error } = await supabase.rpc('release_content_publication_claim', {
    p_publication_id: publicationId,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error('Publication checkpoint could not be released.');
  }
}

export async function confirmContentPublication(
  publicationId: string,
  reference: string,
) {
  const { error } = await supabase.rpc('resolve_content_publication_as_published', {
    p_publication_id: publicationId,
    p_reference: reference,
  });
  if (error) throw error;
}

export async function rearmContentPublication(publicationId: string) {
  const { data, error } = await supabase.rpc('resolve_content_publication_for_retry', {
    p_publication_id: publicationId,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error('Publication checkpoint could not be re-armed.');
  }
}
