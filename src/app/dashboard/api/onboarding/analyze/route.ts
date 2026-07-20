import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { analyzeWebsite } from '@/lib/onboarding/website-analysis';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const analysis = await analyzeWebsite(await request.json());
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Enter a valid business name and public website URL.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'The website could not be analyzed.';
    console.error('[dashboard/api/onboarding/analyze]', message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
