import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { getAdminSupabase } from '@/lib/admin/data';
import { createInvitationToken, hashInvitationToken } from '@/lib/onboarding/invitations';

const requestSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).optional(),
});

export async function POST(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a business name and optional valid email.' }, { status: 400 });
  }

  const token = createInvitationToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const { error } = await getAdminSupabase().from('onboarding_invitations').insert({
    token_hash: hashInvitationToken(token),
    business_name: parsed.data.businessName,
    email: parsed.data.email || null,
    expires_at: expiresAt,
  });
  if (error) {
    console.error('[dashboard/api/onboarding/invitations]', error.message);
    return NextResponse.json({ error: 'Could not create the invitation.' }, { status: 500 });
  }

  return NextResponse.json({
    link: `${new URL(request.url).origin}/onboard/${token}`,
    expiresAt,
  }, { status: 201 });
}
