import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/leads
 * Captures a lead/waitlist email into Supabase.
 * Called by <WaitlistForm />.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const source = typeof body.source === 'string' ? body.source : 'website';
  const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 500) : null;
  const userAgent = typeof body.user_agent === 'string' ? body.user_agent.slice(0, 200) : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const supabase = createClient();

  const { error } = await supabase.from('leads').insert({
    email,
    source,
    referrer,
    user_agent: userAgent,
  });

  if (error) {
    // 23505 = unique violation = already subscribed. Treat as success.
    if (error.code === '23505') {
      return NextResponse.json({ message: 'Already subscribed' }, { status: 200 });
    }
    console.error('[api/leads] insert error:', error.message);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  // TODO Phase 01+: trigger Resend welcome email here.

  return NextResponse.json({ message: 'Subscribed' }, { status: 201 });
}
