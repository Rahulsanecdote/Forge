import { NextResponse } from 'next/server';
import { z } from 'zod';
import { demoSocialPosts } from '@/src/web/demo';
import { clientConfigSchema } from '@/src/forge/client-config';
import { isModelConfigured, missingConfigMessage } from '@/src/forge/web-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({
  config: clientConfigSchema,
  topic: z.string().min(1).max(300),
  platform: z.enum(['instagram', 'facebook', 'google_business']).optional(),
  count: z.number().int().min(1).max(6).optional(),
  cta: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  if (!isModelConfigured()) {
    return NextResponse.json({ error: missingConfigMessage() }, { status: 503 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing brand voice or topic.' }, { status: 400 });
  }
  const { config, ...input } = parsed.data;
  try {
    const result = await demoSocialPosts(config, input);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate posts.' },
      { status: 500 },
    );
  }
}
