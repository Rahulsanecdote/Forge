import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAdminSupabase } from '@/lib/admin/data';
import { analyzeWebsite } from '@/lib/onboarding/website-analysis';
import { hashInvitationToken, invitationTokenSchema } from '@/lib/onboarding/invitations';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const token = invitationTokenSchema.safeParse(params.token);
  if (!token.success) return NextResponse.json({ error: 'Invalid invitation.' }, { status: 404 });

  const { data: claimed, error: claimError } = await getAdminSupabase()
    .rpc('claim_onboarding_analysis', { p_token_hash: hashInvitationToken(token.data) });
  if (claimError || !claimed) {
    return NextResponse.json({ error: 'This invitation is invalid, expired, or has reached its analysis limit.' }, { status: 410 });
  }

  try {
    const analysis = await analyzeWebsite(await request.json());
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Enter a valid business name and public website URL.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'The website could not be analyzed.';
    console.error('[api/onboard/analyze]', message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
