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
import { findBannedPhraseViolations, parseSocialPostOutput } from '@/lib/admin/run-output';
import { submissionFromFormData } from '@/lib/onboarding/invitations';
import type { ClientContext } from '@/forge/types';

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');

  if (!verifyAdminPassword(password)) {
    redirect('/dashboard/login?error=invalid');
  }

  await setAdminSession();
  redirect('/dashboard');
}

export async function logout() {
  await clearAdminSession();
  redirect('/dashboard/login');
}

async function requireAdmin() {
  if (!(await isAdminAuthenticated())) redirect('/dashboard/login');
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

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMissingGoogleBusinessColumns(error: { message?: string } | null) {
  return Boolean(error?.message && /google_business_/i.test(error.message));
}

function sentenceFragment(value: string) {
  return value.trim().replace(/[\s.。!?]+$/g, '');
}

function directive(label: string, value: string) {
  const cleaned = sentenceFragment(value);
  return cleaned ? `${label}: ${cleaned}.` : null;
}

function brandVoiceFromOnboarding(input: {
  name: string;
  industry: string;
  services: string[];
  geographicMarket: string;
  primaryGoal: string;
  primaryCta: string;
}) {
  const services = uniqueList(input.services).slice(0, 6);
  const cta = sentenceFragment(input.primaryCta);
  const goal = sentenceFragment(input.primaryGoal);
  const market = sentenceFragment(input.geographicMarket);
  const category = sentenceFragment(input.industry);
  const firstService = services[0] ?? category.toLowerCase();

  return {
    dos: [
      ...services.map((service) => `Only reference ${service} when supported by the source material.`),
      directive('Focus on this geographic market', market),
      directive('Optimize toward', goal),
      directive('Use this primary call to action', cta),
    ].filter((value): value is string => Boolean(value)),
    donts: ['Do not invent services, offers, locations, or performance claims.'],
    samplePosts: [
      `${input.name} helps ${market || 'local customers'} with ${firstService}. ${cta || 'Reach out to learn more'}.`,
      `Looking for ${category || 'trusted service'} support? Keep ${input.name} in mind when ${goal || 'you are ready for the next step'}.`,
    ],
  };
}

function redirectClient(slug: string, status: string): never {
  redirect(`/dashboard/clients/${encodeURIComponent(slug)}?status=${encodeURIComponent(status)}`);
}

function redirectRun(id: string, status: string): never {
  redirect(`/dashboard/runs/${encodeURIComponent(id)}?status=${encodeURIComponent(status)}`);
}

function clientContextFromDetail(detail: NonNullable<Awaited<ReturnType<typeof loadClientDetail>>>): ClientContext {
  return {
    id: detail.client.id,
    slug: detail.client.slug,
    name: detail.client.name,
    industry: detail.client.industry,
    website: detail.client.website,
    locations: detail.client.locations ?? 1,
    geographicMarket: detail.client.geographic_market,
    primaryGoal: detail.client.primary_goal,
    primaryCta: detail.client.primary_cta,
    googleBusinessAccountId: detail.client.google_business_account_id,
    googleBusinessLocationId: detail.client.google_business_location_id,
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
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

async function markDashboardRunFailed(runId: string, error: unknown) {
  const message = errorMessage(error);
  const supabase = getAdminSupabase();
  await supabase
    .from('tool_runs')
    .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
    .eq('id', runId);
  await supabase.from('forge_run_evidence').insert({
    run_id: runId,
    kind: 'error',
    description: 'Tool execution failed from the operator dashboard.',
    payload: { message },
  });
  await supabase.from('forge_run_audits').insert({
    run_id: runId,
    status: 'failed',
    summary: 'The dashboard tool run did not complete successfully.',
    findings: [{ severity: 'P0', code: 'execution_failed', message }],
  });
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
  await requireAdmin();
  const parsed = submissionFromFormData(formData);
  const slug = slugify(stringValue(formData, 'name'));
  if (!parsed.success || !slug) redirect('/dashboard/onboarding?status=invalid');

  const supabase = getAdminSupabase();
  const {
    name, website, industry, locations, about, audience, geographic_market,
    primary_goal, primary_cta, timezone, posting_frequency, tone, services,
    banned_phrases,
  } = parsed.data;
  const brandVoice = brandVoiceFromOnboarding({
    name,
    industry,
    services,
    geographicMarket: geographic_market,
    primaryGoal: primary_goal,
    primaryCta: primary_cta,
  });
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
    dos: brandVoice.dos,
    donts: brandVoice.donts,
    banned_phrases,
    sample_posts: brandVoice.samplePosts,
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
  await requireAdmin();
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
  const brandVoice = brandVoiceFromOnboarding({
    name: submission.name,
    industry: submission.industry,
    services: submission.services,
    geographicMarket: submission.geographic_market,
    primaryGoal: submission.primary_goal,
    primaryCta: submission.primary_cta,
  });
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
    dos: brandVoice.dos,
    donts: brandVoice.donts,
    banned_phrases: submission.banned_phrases,
    sample_posts: brandVoice.samplePosts,
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
  await requireAdmin();
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
  await requireAdmin();
  const id = stringValue(formData, 'client_id');
  const currentSlug = stringValue(formData, 'current_slug');
  const slug = clientSlugSchema.safeParse(stringValue(formData, 'slug'));
  const name = stringValue(formData, 'name');
  const locations = Number.parseInt(stringValue(formData, 'locations') || '1', 10);

  if (!id || !currentSlug || !slug.success || !name) {
    redirectClient(currentSlug || 'unknown', 'profile-invalid');
  }

  const update = {
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
    google_business_account_id: stringValue(formData, 'google_business_account_id') || null,
    google_business_location_id: stringValue(formData, 'google_business_location_id') || null,
  };

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from('clients')
    .update(update)
    .eq('id', id);

  if (isMissingGoogleBusinessColumns(error)) {
    const { google_business_account_id, google_business_location_id, ...baseUpdate } = update;
    const { error: fallbackError } = await supabase.from('clients').update(baseUpdate).eq('id', id);
    if (fallbackError) redirectClient(currentSlug, 'profile-error');
  } else if (error) {
    redirectClient(currentSlug, 'profile-error');
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${currentSlug}`);
  revalidatePath(`/dashboard/clients/${slug.data}`);
  redirectClient(slug.data, 'profile-saved');
}

export async function updateBrandVoice(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
  const slug = stringValue(formData, 'slug');
  const task = stringValue(formData, 'task');

  if (!slug || !task) redirectClient(slug || 'unknown', 'run-invalid');

  const detail = await loadClientDetail(slug);
  if (!detail) redirect('/dashboard?status=client-missing');

  const client = clientContextFromDetail(detail);

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

export async function runKeywordResearch(formData: FormData) {
  await requireAdmin();
  const slug = stringValue(formData, 'slug');
  const topic = stringValue(formData, 'topic');
  const location = stringValue(formData, 'location');
  const countValue = Number.parseInt(stringValue(formData, 'count') || '20', 10);
  const count = Number.isFinite(countValue) ? Math.min(Math.max(countValue, 5), 40) : 20;

  if (!slug || !topic) redirectClient(slug || 'unknown', 'keyword-invalid');

  const detail = await loadClientDetail(slug);
  if (!detail) redirect('/dashboard?status=client-missing');

  const input = {
    topic,
    count,
    ...(location ? { location } : {}),
  };
  const task = `Research SEO keyword clusters for ${topic}${location ? ` in ${location}` : ''}.`;
  const supabase = getAdminSupabase();
  let runId: string | null = null;

  try {
    const [{ DEFAULT_AGENT_KEY, assertToolPermission }, { resolveModel }, { researchKeywords }] =
      await Promise.all([
        import('@/forge/authority'),
        import('@/forge/model'),
        import('@/forge/tools/research-keywords'),
      ]);
    const authority = await assertToolPermission({
      agentKey: DEFAULT_AGENT_KEY,
      toolName: researchKeywords.name,
    });
    if (authority.verificationGates.length > 0 || authority.requiresApproval) {
      throw new Error('Keyword research requires an authority gate that is not configured in the dashboard.');
    }

    const { data: run, error: runError } = await supabase
      .from('tool_runs')
      .insert({
        agent_id: authority.agentId,
        client_id: detail.client.id,
        task,
        tool: researchKeywords.name,
        input,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (runError || !run) {
      throw new Error(`Could not record keyword run: ${runError?.message ?? 'missing run id'}`);
    }
    runId = run.id;

    const output = await researchKeywords.execute(input, {
      client: clientContextFromDetail(detail),
      model: resolveModel(),
    });

    const { error: outputError } = await supabase
      .from('tool_runs')
      .update({ output, status: 'succeeded', completed_at: new Date().toISOString(), error: null })
      .eq('id', run.id);
    if (outputError) throw new Error(`Could not persist keyword output: ${outputError.message}`);

    const { error: evidenceError } = await supabase.from('forge_run_evidence').insert({
      run_id: run.id,
      kind: 'output',
      description: 'Structured keyword research output produced from the operator dashboard.',
      payload: output,
    });
    if (evidenceError) throw new Error(`Could not record keyword evidence: ${evidenceError.message}`);

    const { error: auditError } = await supabase.from('forge_run_audits').insert({
      run_id: run.id,
      status: 'succeeded',
      summary: 'research_keywords completed and produced durable keyword evidence.',
      findings: [],
    });
    if (auditError) throw new Error(`Could not record keyword audit: ${auditError.message}`);
  } catch (error) {
    console.error('[dashboard/runKeywordResearch]', error);
    if (runId) await markDashboardRunFailed(runId, error);
    redirectClient(slug, 'keyword-error');
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${slug}`);
  if (!runId) redirectClient(slug, 'keyword-error');
  redirectRun(runId, 'keyword-complete');
}

const approvalDecisionSchema = z.enum(['approved', 'rejected']);

export async function decideContentApproval(formData: FormData) {
  await requireAdmin();
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

// Publish an operator-drafted review reply back to Google Business Profile. The
// publish path itself re-checks banned-phrase compliance and Google credentials and
// fails closed; this action only maps the outcome to an operator status banner.
export async function publishReviewReply(formData: FormData) {
  await requireAdmin();
  const slug = stringValue(formData, 'slug');
  const reviewId = z.string().uuid().safeParse(stringValue(formData, 'review_id'));
  if (!slug || !reviewId.success) redirectClient(slug || 'unknown', 'reply-invalid');

  let status = 'reply-error';
  try {
    const { publishDraftedReviewReply } = await import('@/forge/data/google-business-profile');
    const result = await publishDraftedReviewReply(reviewId.data);
    if (result.published) status = 'reply-published';
    else if (result.code === 'unconfigured') status = 'reply-unconfigured';
    else if (result.code === 'compliance') status = 'reply-blocked';
    else status = 'reply-error';
  } catch (error) {
    console.error('[dashboard/publishReviewReply]', error);
    status = 'reply-error';
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${slug}`);
  redirectClient(slug, status);
}

// Generate + store an image slot for one post of a social-post run. With an
// `asset_index` it regenerates that slot; without one it adds the next slot (up to
// the Instagram carousel maximum), enabling multi-image / carousel posts. The
// generation path is fail-closed (unconfigured when no image provider key is set);
// this action maps the outcome to an operator status banner.
export async function generatePostImage(formData: FormData) {
  await requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  const postIndex = Number.parseInt(stringValue(formData, 'post_index'), 10);
  if (!runId.success || !Number.isInteger(postIndex) || postIndex < 0) {
    redirectRun(runId.success ? runId.data : 'invalid', 'image-invalid');
  }

  const rawAssetIndex = stringValue(formData, 'asset_index');
  const parsedAssetIndex = rawAssetIndex ? Number.parseInt(rawAssetIndex, 10) : null;
  if (rawAssetIndex && (!Number.isInteger(parsedAssetIndex) || (parsedAssetIndex ?? -1) < 0)) {
    redirectRun(runId.data, 'image-invalid');
  }

  const detail = await loadToolRunDetail(runId.data);
  if (!detail || !detail.client || detail.run.tool !== 'create_social_posts') {
    redirectRun(runId.data, 'image-error');
  }

  const parsed = parseSocialPostOutput(detail.run.output);
  const post = parsed?.posts[postIndex];
  if (!post) redirectRun(runId.data, 'image-error');

  // Regenerate the given slot, or add the next one (capped at the carousel maximum).
  let assetIndex = parsedAssetIndex ?? 0;
  if (parsedAssetIndex === null) {
    const { INSTAGRAM_CAROUSEL_MAX } = await import('@/forge/data/instagram-mapping');
    const { data: existing } = await getAdminSupabase()
      .from('content_assets')
      .select('asset_index')
      .eq('run_id', runId.data)
      .eq('post_index', postIndex)
      .eq('kind', 'image');
    const slots = (existing ?? []).map((row: { asset_index: number }) => row.asset_index);
    if (slots.length >= INSTAGRAM_CAROUSEL_MAX) redirectRun(runId.data, 'image-limit');
    assetIndex = slots.length === 0 ? 0 : Math.max(...slots) + 1;
  }

  const clientDetail = await loadClientDetail(detail.client.slug);
  if (!clientDetail) redirectRun(runId.data, 'image-error');

  let status = 'image-error';
  try {
    const { generateAndStorePostImage } = await import('@/forge/data/images');
    const result = await generateAndStorePostImage({
      runId: runId.data,
      clientId: detail.client.id,
      postIndex,
      assetIndex,
      imageDirection: post.imageDirection || post.caption,
      businessName: clientDetail.client.name,
      industry: clientDetail.client.industry,
      tone: clientDetail.brandVoice?.tone ?? [],
    });
    status = result.generated ? 'image-generated' : 'image-unconfigured';
  } catch (error) {
    console.error('[dashboard/generatePostImage]', error);
    status = 'image-error';
  }

  revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, status);
}

// Remove one image slot from a post (for trimming a carousel or dropping a bad
// generation). Deletes the stored object and its content_assets row.
export async function deletePostImage(formData: FormData) {
  await requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  const postIndex = Number.parseInt(stringValue(formData, 'post_index'), 10);
  const assetIndex = Number.parseInt(stringValue(formData, 'asset_index'), 10);
  if (
    !runId.success ||
    !Number.isInteger(postIndex) ||
    postIndex < 0 ||
    !Number.isInteger(assetIndex) ||
    assetIndex < 0
  ) {
    redirectRun(runId.success ? runId.data : 'invalid', 'image-invalid');
  }

  const detail = await loadToolRunDetail(runId.data);
  if (!detail || !detail.client) redirectRun(runId.data, 'image-error');

  let status = 'image-error';
  try {
    const { deleteStoredPostImage } = await import('@/forge/data/images');
    const result = await deleteStoredPostImage({ runId: runId.data, postIndex, assetIndex });
    status = result.deleted ? 'image-removed' : 'image-error';
  } catch (error) {
    console.error('[dashboard/deletePostImage]', error);
    status = 'image-error';
  }

  revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, status);
}

// Publish an approved social-post run to its platform (Google Business, Facebook, or
// Instagram) right now. The heavy lifting — approval re-check, banned-phrase re-check,
// idempotency, per-channel publish, and durable evidence — lives in publishApprovedRun,
// the single fail-closed path shared with the scheduled-publish cron. This action only
// resolves the client slug for revalidation and maps the outcome to a status banner.
export async function publishApprovedContent(formData: FormData) {
  await requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  if (!runId.success) redirectRun('invalid', 'publish-invalid');

  const detail = await loadToolRunDetail(runId.data);
  if (!detail || !detail.client) redirectRun(runId.data, 'publish-error');

  const { publishApprovedRun } = await import('@/forge/data/publish');
  const outcome = await publishApprovedRun(runId.data);

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, outcome.status);
}

// Refresh reach/engagement for a published run's posts from the Meta Graph API and
// store the latest snapshot (content_metrics + durable metric evidence). Fails closed;
// maps the outcome to an operator status banner.
export async function refreshPublishedMetrics(formData: FormData) {
  await requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  if (!runId.success) redirectRun('invalid', 'metrics-invalid');

  const detail = await loadToolRunDetail(runId.data);
  if (!detail || !detail.client) redirectRun(runId.data, 'metrics-error');

  const { refreshRunMetrics } = await import('@/forge/data/analytics');
  const result = await refreshRunMetrics(runId.data);
  const status = result.refreshed
    ? 'metrics-refreshed'
    : result.code === 'unconfigured'
      ? 'metrics-unconfigured'
      : result.code === 'unsupported'
        ? 'metrics-unsupported'
        : result.code === 'no_posts'
          ? 'metrics-none'
          : 'metrics-error';

  revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, status);
}

// Schedule an approved social-post run to publish at a future time. Applies the same
// pre-publish gates as immediate publishing (approved, supported platform, no banned
// phrases, not already published, and — for Instagram — an image per post) so we never
// queue something that can't ever go live. The scheduled-publish cron re-checks all of
// this at fire time; these gates just give the operator fast, honest feedback.
export async function scheduleApprovedContent(formData: FormData) {
  await requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  if (!runId.success) redirectRun('invalid', 'schedule-invalid');

  const detail = await loadToolRunDetail(runId.data);
  if (
    !detail ||
    !detail.client ||
    detail.run.tool !== 'create_social_posts' ||
    detail.approval?.status !== 'approved'
  ) {
    redirectRun(runId.data, 'schedule-error');
  }

  // Interpret the operator's wall-clock time in the client's configured timezone.
  const { parseScheduledFor } = await import('@/forge/data/schedule-mapping');
  const when = parseScheduledFor(
    stringValue(formData, 'scheduled_for'),
    new Date(),
    detail.client.timezone,
  );
  if (!when.ok) redirectRun(runId.data, when.reason === 'past' ? 'schedule-past' : 'schedule-invalid');

  const parsed = parseSocialPostOutput(detail.run.output);
  if (
    !parsed ||
    (parsed.platform !== 'google_business' &&
      parsed.platform !== 'facebook' &&
      parsed.platform !== 'instagram')
  ) {
    redirectRun(runId.data, 'schedule-unsupported');
  }

  if (findBannedPhraseViolations(detail.run.output, detail.currentBannedPhrases).length > 0) {
    redirectRun(runId.data, 'schedule-blocked');
  }

  const supabase = getAdminSupabase();
  const { data: alreadyPublished } = await supabase
    .from('forge_run_evidence')
    .select('id')
    .eq('run_id', runId.data)
    .eq('kind', 'published_url')
    .limit(1);
  if (alreadyPublished && alreadyPublished.length > 0) redirectRun(runId.data, 'schedule-already');

  if (parsed.platform === 'instagram') {
    const { data: assets } = await supabase
      .from('content_assets')
      .select('post_index')
      .eq('run_id', runId.data)
      .eq('kind', 'image');
    const withImage = new Set((assets ?? []).map((row: { post_index: number }) => row.post_index));
    if (parsed.posts.some((_, index) => !withImage.has(index))) {
      redirectRun(runId.data, 'schedule-missing-image');
    }
  }

  // One schedule per run: re-scheduling replaces the prior pending row and re-arms it.
  const { error } = await supabase.from('content_schedules').upsert(
    {
      run_id: runId.data,
      client_id: detail.client.id,
      scheduled_for: when.at,
      status: 'pending',
      attempts: 0,
      last_error: null,
      published_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'run_id' },
  );
  if (error) redirectRun(runId.data, 'schedule-error');

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/clients/${detail.client.slug}`);
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, 'schedule-set');
}

// Cancel a pending publish schedule for a run. Only pending schedules can be canceled;
// once the cron has claimed or published one, this is a no-op mapped to schedule-error.
export async function cancelScheduledContent(formData: FormData) {
  await requireAdmin();
  const runId = z.string().uuid().safeParse(stringValue(formData, 'run_id'));
  if (!runId.success) redirectRun('invalid', 'schedule-invalid');

  const { data, error } = await getAdminSupabase()
    .from('content_schedules')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('run_id', runId.data)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/runs/${runId.data}`);
  redirectRun(runId.data, error || !data ? 'schedule-error' : 'schedule-canceled');
}
