import { NextResponse } from 'next/server';
import { z } from 'zod';
import { demoOnboard } from '@/src/web/demo';
import { isModelConfigured, missingConfigMessage } from '@/src/forge/web-model';

// The engine calls the model and reads node:fs (via client-config) — needs the Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  industry: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  if (!isModelConfigured()) {
    return NextResponse.json({ error: missingConfigMessage() }, { status: 503 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a business name and a short description.' }, { status: 400 });
  }
  try {
    const config = await demoOnboard(parsed.data);
    return NextResponse.json({ config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to draft the brand voice.' },
      { status: 500 },
    );
  }
}
