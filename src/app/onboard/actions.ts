'use server';

import { redirect } from 'next/navigation';
import { getAdminSupabase } from '@/lib/admin/data';
import {
  hashInvitationToken,
  invitationTokenSchema,
  submissionFromFormData,
} from '@/lib/onboarding/invitations';

export async function submitClientOnboarding(formData: FormData) {
  const token = invitationTokenSchema.safeParse(String(formData.get('invitation_token') ?? ''));
  const submission = submissionFromFormData(formData);
  if (!token.success || !submission.success) {
    const safeToken = token.success ? token.data : 'invalid';
    redirect(`/onboard/${encodeURIComponent(safeToken)}?status=invalid`);
  }

  const { error } = await getAdminSupabase().rpc('submit_onboarding_invitation', {
    p_token_hash: hashInvitationToken(token.data),
    p_submission: submission.data,
  });
  if (error) {
    console.error('[onboard/submit]', error.message);
    redirect(`/onboard/${encodeURIComponent(token.data)}?status=expired`);
  }

  redirect(`/onboard/${encodeURIComponent(token.data)}/complete`);
}
