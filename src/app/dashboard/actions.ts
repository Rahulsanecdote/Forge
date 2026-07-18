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
import { submissionFromFormData } from '@/lib/onboarding/invitations';
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

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export async function createOnboardedClient(formData: FormData) {
  requireAdmin();
  const parsed = submissionFromFormData(formData);
  const slug = slugify(stringValue(formData, 'name'));
  if (!parsed.success || !slug) redirect('/dashboard/onboarding?status=invalid');

  const supabase = getAdminSupabase();
  const {
    name, website, industry, locations, about, audience, geographic_market,
    primary_goal, primary_cta, timezone, posting_frequency, tone, services,
    banned_phrases,
  } = parsed.data;
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      slug, name, website, industry, locations, geographic_market, primary_goal,
      primary_cta, timezone, posting_frequency, approval_mode: 'review',
    })
    .select('id, slug')
    .single();
  if (clientError || !client) redirect('/dashboard/onboarding?status=client-error');

  const { error: voiceError } = await supabase.from('brand_voices').insert({
    client_id: client.id,
    tone,
    about,
    audience,
    dos: [
      ...services.map((service) => `Only reference ${service} when supported by the source material.`),
      `Focus on this geographic market: ${geographic_market}.`,
      `Optimize toward: ${primary_goal}.`,
      `Use this primary call to action: ${primary_cta}.`,
    ],
    donts: ['Do not invent services, offers, locations, or performance claims.'],
    banned_phrases,
    sample_posts: [],
  });
  if (voiceError) {
    await supabase.from('clients').delete().eq('id', client.id);
    redirect('/dashboard/onboarding?status=voice-error');
  }

  revalidatePath('/dashboard');
  redirectClient(client.slug, 'onboarding-complete');
}

function redirectOnboarding(status: string): never {
  redirect(`/dashboard/onboarding?status=${encodeURIComponent(status)}`);
}

const submissionDecisionSchema = z.enum(['approved', 'rejected']);

export async function decideOnboardingSubmission(formData: FormData) {
  requireAdmin();
  const id = z.string().uuid().safeParse(stringValue(formData, 'submission_id'));
  const decision = submissionDecisionSchema.safeParse(stringValue(formData, 'decision'));
  if (!id.success || !decision.success) redirectOnboarding('submission-invalid');

  const supabase = getAdminSupabase();
  const { data: submission, error } = await supabase
    .from('onboarding_submissions')
    .select('id, status, name, website, industry, locations, about, audience, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, tone, services, banned_phrases')
    .eq('id', id.data)
    .eq('status', 'pending')
    .maybeSingle();
  if (error || !submission) redirectOnboarding('submission-error');

  if (decision.data === 'rejected') {
    const { error: rejectError } = await supabase
      .from('onboarding_submissions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id.data)
      .eq('status', 'pending');
    if (rejectError) redirectOnboarding('submission-error');
    revalidatePath('/dashboard/onboarding');
    redirectOnboarding('submission-rejected');
  }

  const baseSlug = slugify(submission.name);
  if (!baseSlug) redirectOnboarding('submission-error');
  const { data: slugConflict } = await supabase.from('clients').select('id').eq('slug', baseSlug).maybeSingle();
  const slug = slugConflict ? `${baseSlug.slice(0, 70)}-${id.data.slice(0, 6)}` : baseSlug;
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      slug,
      name: submission.name,
      website: submission.website,
      industry: submission.industry,
      locations: submission.locations,
      geographic_market: submission.geographic_market,
      primary_goal: submission.primary_goal,
      primary_cta: submission.primary_cta,
      timezone: submission.timezone,
      posting_frequency: submission.posting_frequency,
      approval_mode: 'review',
    })
    .select('id, slug')
    .single();
  if (clientError || !client) redirectOnboarding('submission-error');

  const { error: voiceError } = await supabase.from('brand_voices').insert({
    client_id: client.id,
    tone: submission.tone,
    about: submission.about,
    audience: submission.audience,
    dos: [
      ...submission.services.map((service: string) => `Only reference ${service} when supported by the source material.`),
      `Focus on this geographic market: ${submission.geographic_market}.`,
      `Optimize toward: ${submission.primary_goal}.`,
      `Use this primary call to action: ${submission.primary_cta}.`,
    ],
    donts: ['Do not invent services, offers, locations, or performance claims.'],
    banned_phrases: submission.banned_phrases,
    sample_posts: [],
  });
  if (voiceError) {
    await supabase.from('clients').delete().eq('id', client.id);
    redirectOnboarding('submission-error');
  }

  const { data: reviewed, error: reviewError } = await supabase
    .from('onboarding_submissions')
    .update({ status: 'approved', client_id: client.id, reviewed_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (reviewError || !reviewed) {
    await supabase.from('clients').delete().eq('id', client.id);
    redirectOnboarding('submission-error');
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
  redirectClient(client.slug, 'onboarding-complete');
}

export async function revokeOnboardingInvitation(formData: FormData) {
  requireAdmin();
  const id = z.string().uuid().safeParse(stringValue(formData, 'invitation_id'));
  if (!id.success) redirectOnboarding('invitation-invalid');

  const { data, error } = await getAdminSupabase()
    .from('onboarding_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id.data)
    .is('completed_at', null)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error || !data) redirectOnboarding('invitation-error');

  revalidatePath('/dashboard/onboarding');
  redirectOnboarding('invitation-revoked');
}

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
      geographic_market: stringValue(formData, 'geographic_market') || null,
      primary_goal: stringValue(formData, 'primary_goal') || null,
      primary_cta: stringValue(formData, 'primary_cta') || null,
      timezone: stringValue(formData, 'timezone') || null,
      posting_frequency: stringValue(formData, 'posting_frequency') || null,
      approval_mode: 'review',
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

  const { error: evidenceError } = await getAdminSupabase().from('forge_run_evidence').insert({
    run_id: runId.data,
    kind: 'approval',
    description: `Content draft ${decision.data} by the single-operator portal.`,
    payload: { decision: decision.data, notes: notes || null },
  });

  if (evidenceError) {
    await getAdminSupabase()
      .from('content_approvals')
      .update({ status: 'pending', notes: null, decided_at: null })
      .eq('id', detail.approval.id)
      .eq('status', decision.data);
    redirectRun(runId.data, 'approval-error');
  }

  revalidatePath('/dashboard');
  if (detail.client) revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, `approval-${decision.data}`);
}
