'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  clearAdminSession,
  isAdminAuthenticated,
  setAdminSession,
  verifyAdminPassword,
} from '@/lib/admin/auth';
import { getAdminSupabase, loadClientDetail, loadToolRunDetail } from '@/lib/admin/data';
import { findBannedPhraseViolations } from '@/lib/admin/run-output';
import type { ClientContext } from '@/forge/types';

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');

  if (!verifyAdminPassword(password)) {
    redirect('/dashboard/login?error=invalid');
  }

  setAdminSession();
  redirect('/dashboard');
}

export async function logout() {
  clearAdminSession();
  redirect('/dashboard/login');
}

function requireAdmin() {
  if (!isAdminAuthenticated()) redirect('/dashboard/login');
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function listValue(formData: FormData, key: string) {
  return stringValue(formData, key)
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function redirectClient(slug: string, status: string): never {
  redirect(`/dashboard/clients/${encodeURIComponent(slug)}?status=${encodeURIComponent(status)}`);
}

function redirectRun(id: string, status: string): never {
  redirect(`/dashboard/runs/${encodeURIComponent(id)}?status=${encodeURIComponent(status)}`);
}

const clientSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function updateClientProfile(formData: FormData) {
  requireAdmin();
  const id = stringValue(formData, 'client_id');
  const currentSlug = stringValue(formData, 'current_slug');
  const slug = clientSlugSchema.safeParse(stringValue(formData, 'slug'));
  const name = stringValue(formData, 'name');
  const locations = Number.parseInt(stringValue(formData, 'locations') || '1', 10);

  if (!id || !currentSlug || !slug.success || !name) {
    redirectClient(currentSlug || 'unknown', 'profile-invalid');
  }

  const { error } = await getAdminSupabase()
    .from('clients')
    .update({
      slug: slug.data,
      name,
      industry: stringValue(formData, 'industry') || null,
      website: stringValue(formData, 'website') || null,
      locations: Number.isFinite(locations) && locations > 0 ? locations : 1,
    })
    .eq('id', id);

  if (error) redirectClient(currentSlug, 'profile-error');

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${currentSlug}`);
  revalidatePath(`/dashboard/clients/${slug.data}`);
  redirectClient(slug.data, 'profile-saved');
}

export async function updateBrandVoice(formData: FormData) {
  requireAdmin();
  const clientId = stringValue(formData, 'client_id');
  const slug = stringValue(formData, 'slug');

  if (!clientId || !slug) redirectClient(slug || 'unknown', 'voice-invalid');

  const { error } = await getAdminSupabase().from('brand_voices').upsert(
    {
      client_id: clientId,
      tone: listValue(formData, 'tone'),
      about: stringValue(formData, 'about'),
      audience: stringValue(formData, 'audience'),
      dos: listValue(formData, 'dos'),
      donts: listValue(formData, 'donts'),
      sample_posts: listValue(formData, 'sample_posts'),
      banned_phrases: listValue(formData, 'banned_phrases'),
    },
    { onConflict: 'client_id' },
  );

  if (error) redirectClient(slug, 'voice-error');

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${slug}`);
  redirectClient(slug, 'voice-saved');
}

export async function runClientTask(formData: FormData) {
  requireAdmin();
  const slug = stringValue(formData, 'slug');
  const task = stringValue(formData, 'task');

  if (!slug || !task) redirectClient(slug || 'unknown', 'run-invalid');

  const detail = await loadClientDetail(slug);
  if (!detail) redirect('/dashboard?status=client-missing');

  const client: ClientContext = {
    id: detail.client.id,
    slug: detail.client.slug,
    name: detail.client.name,
    industry: detail.client.industry,
    website: detail.client.website,
    locations: detail.client.locations ?? 1,
    brandVoice: {
      tone: detail.brandVoice?.tone ?? [],
      about: detail.brandVoice?.about ?? '',
      audience: detail.brandVoice?.audience ?? '',
      dos: detail.brandVoice?.dos ?? [],
      donts: detail.brandVoice?.donts ?? [],
      samplePosts: detail.brandVoice?.sample_posts ?? [],
      bannedPhrases: detail.brandVoice?.banned_phrases ?? [],
    },
  };

  let approvalRunId: string | null = null;
  try {
    const { runForge } = await import('@/forge/runtime');
    const result = await runForge({ client, task });
    approvalRunId = result.steps.find((step) => step.tool === 'create_social_posts')?.runId ?? null;
  } catch (error) {
    console.error('[dashboard/runClientTask]', error);
    redirectClient(slug, 'run-error');
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${slug}`);
  if (approvalRunId) redirectRun(approvalRunId, 'approval-pending');
  redirectClient(slug, 'run-complete');
}

const approvalDecisionSchema = z.enum(['approved', 'rejected']);

export async function decideContentApproval(formData: FormData) {
  requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  const decision = approvalDecisionSchema.safeParse(stringValue(formData, 'decision'));
  const notes = stringValue(formData, 'notes');

  if (!runId.success || !decision.success) {
    redirectRun(runId.success ? runId.data : 'invalid', 'approval-invalid');
  }

  const detail = await loadToolRunDetail(runId.data);
  if (!detail?.approval || detail.approval.status !== 'pending') {
    redirectRun(runId.data, 'approval-error');
  }

  const violations = findBannedPhraseViolations(
    detail.run.output,
    detail.currentBannedPhrases,
  );
  if (decision.data === 'approved' && violations.length > 0) {
    redirectRun(runId.data, 'approval-blocked');
  }

  const { data, error } = await getAdminSupabase()
    .from('content_approvals')
    .update({
      status: decision.data,
      notes: notes || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', detail.approval.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error || !data) redirectRun(runId.data, 'approval-error');

  revalidatePath('/dashboard');
  if (detail.client) revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, `approval-${decision.data}`);
}
