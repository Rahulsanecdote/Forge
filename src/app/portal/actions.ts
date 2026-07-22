'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearPortalSession, getPortalClientId } from '@/lib/portal/session';
import { decideClientApproval } from '@/lib/portal/approvals';

export async function portalLogout() {
  await clearPortalSession();
  redirect('/portal');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client approves or rejects one of their own pending drafts. The client is taken from
// the verified session cookie (never the form), and decideClientApproval scopes every
// query to that client — a client can only decide their own content.
export async function decidePortalContent(formData: FormData) {
  const clientId = await getPortalClientId();
  if (!clientId) redirect('/portal');

  const runId = String(formData.get('run_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  if (!UUID_RE.test(runId) || (decision !== 'approved' && decision !== 'rejected')) {
    redirect('/portal?status=decision-invalid');
  }

  const result = await decideClientApproval(clientId, runId, decision as 'approved' | 'rejected');
  revalidatePath('/portal');
  redirect(`/portal?status=decision-${result}`);
}
