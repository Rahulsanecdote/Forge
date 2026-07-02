import { NextResponse } from 'next/server';
import { z } from 'zod';
import { demoReviewReplies } from '@/src/web/demo';
import { clientConfigSchema } from '@/src/forge/client-config';
import { isModelConfigured, missingConfigMessage } from '@/src/forge/web-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({
  config: clientConfigSchema,
  reviews: z
    .array(
      z.object({
        author: z.string().max(120).optional(),
        rating: z.number().int().min(1).max(5),
        text: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(req: Request) {
  if (!isModelConfigured()) {
    return NextResponse.json({ error: missingConfigMessage() }, { status: 503 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Add at least one review with a rating and text.' }, { status: 400 });
  }
  try {
    const replies = await demoReviewReplies(parsed.data.config, parsed.data.reviews);
    return NextResponse.json({ replies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to draft replies.' },
      { status: 500 },
    );
  }
}
