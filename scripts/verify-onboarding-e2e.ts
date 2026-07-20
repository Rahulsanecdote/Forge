import { config } from 'dotenv';
import {
  createInvitationToken,
  hashInvitationToken,
  onboardingSubmissionSchema,
  type OnboardingSubmissionInput,
} from '../src/lib/onboarding/invitations';

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_PRODUCTION_APP_URL = 'https://forge-agent-ten.vercel.app';

interface WebsiteAnalysis {
  businessType: string | null;
  services: string[];
  suggestedCategory: string | null;
  tone: string[];
  locations: number | null;
  summary: string | null;
  sourceUrl: string;
  evidence: string[];
  warnings: string[];
}

interface E2ESite {
  name: string;
  website: string;
  fallbackCategory: string;
  fallbackServices: string[];
  audience: string;
  geographicMarket: string;
  primaryGoal: string;
  primaryCta: string;
  bannedPhrases: string[];
}

interface RestClient {
  url: string;
  key: string;
}

interface InvitationRecord {
  id: string;
  expires_at: string;
}

interface SubmissionRecord {
  id: string;
  invitation_id: string;
  status: 'pending' | 'approved' | 'rejected';
  name: string;
  website: string;
  industry: string;
  services: string[];
  submitted_at: string;
}

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${errorMessage(error.cause)})` : '';
  return `${error.message}${cause}`;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, context = String(input)) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new Error(`${context} failed: ${errorMessage(error)}`);
  }
}

function cliValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function appUrl() {
  return cliValue('app-url', process.env.LAUNCHOPS_APP_URL ?? DEFAULT_PRODUCTION_APP_URL).replace(/\/$/, '');
}

function nowLabel() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function defaultSites(label: string): [E2ESite, E2ESite] {
  return [
    {
      name: `LaunchOps Unchained Coffee ${label}`,
      website: cliValue('site-a-url', process.env.LAUNCHOPS_SITE_A_URL ?? 'https://unchainedcoffee.com/'),
      fallbackCategory: 'Coffee Shop',
      fallbackServices: ['coffee', 'espresso', 'direct-trade coffee'],
      audience: 'Coffee drinkers who care about traceable sourcing and distinctive Colombian lots.',
      geographicMarket: 'Online coffee customers in the United States',
      primaryGoal: 'Turn website visitors into repeat coffee buyers.',
      primaryCta: 'Shop the latest coffee drop',
      bannedPhrases: ['guaranteed results', 'medical claims'],
    },
    {
      name: `LaunchOps Aspen Dental ${label}`,
      website: cliValue('site-b-url', process.env.LAUNCHOPS_SITE_B_URL ?? 'https://www.aspendental.com/'),
      fallbackCategory: 'Dentist',
      fallbackServices: ['dental implants', 'teeth whitening', 'orthodontics'],
      audience: 'Dental patients looking for accessible preventive and restorative care.',
      geographicMarket: 'United States dental patients',
      primaryGoal: 'Convert website visitors into scheduled dental appointments.',
      primaryCta: 'Book a dental appointment',
      bannedPhrases: ['pain-free guarantee', 'perfect smile guaranteed'],
    },
  ];
}

async function expectOk(response: Response, context: string) {
  if (response.ok) return response;
  const body = await response.text().catch(() => '');
  throw new Error(`${context} failed: HTTP ${response.status} ${body.slice(0, 300)}`);
}

function serviceHeaders(client: RestClient, extra?: HeadersInit) {
  return {
    apikey: client.key,
    authorization: `Bearer ${client.key}`,
    ...extra,
  };
}

async function restJson<T>(client: RestClient, path: string, init?: RequestInit) {
  const response = await expectOk(
    await fetchWithTimeout(`${client.url.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: serviceHeaders(client, init?.headers),
    }, path),
    path,
  );
  return (await response.json()) as T;
}

async function createInvitation(
  client: RestClient,
  site: E2ESite,
  label: string,
) {
  const token = createInvitationToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const rows = await restJson<InvitationRecord[]>(client, '/rest/v1/onboarding_invitations?select=id,expires_at', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({
      token_hash: hashInvitationToken(token),
      business_name: site.name,
      email: `launchops+${label.toLowerCase()}@getforge.ai`,
      expires_at: expiresAt,
    }),
  });

  const row = rows[0];
  if (!row) throw new Error(`Could not create invitation for ${site.name}.`);
  return { id: row.id, token, expiresAt: row.expires_at };
}

async function loadInvitationPage(baseUrl: string, token: string, expectedName: string) {
  const url = `${baseUrl}/onboard/${encodeURIComponent(token)}`;
  const response = await expectOk(await fetchWithTimeout(url, undefined, `GET ${url}`), `GET ${url}`);
  const html = await response.text();
  if (!html.includes(expectedName)) {
    throw new Error(`Invitation page loaded but did not include expected business name: ${expectedName}`);
  }
  return url;
}

async function analyzeViaProduction(baseUrl: string, token: string, site: E2ESite) {
  const response = await expectOk(
    await fetchWithTimeout(
      `${baseUrl}/api/onboard/${encodeURIComponent(token)}/analyze`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: site.name, website: site.website }),
      },
      `POST /api/onboard/${token}/analyze`,
    ),
    `POST /api/onboard/${token}/analyze`,
  );
  const payload = (await response.json()) as { analysis?: WebsiteAnalysis; error?: string };
  if (!payload.analysis) throw new Error(payload.error ?? `No analysis returned for ${site.name}.`);
  return payload.analysis;
}

function submissionFor(site: E2ESite, analysis: WebsiteAnalysis): OnboardingSubmissionInput {
  return onboardingSubmissionSchema.parse({
    name: site.name,
    website: analysis.sourceUrl,
    industry: analysis.suggestedCategory ?? analysis.businessType ?? site.fallbackCategory,
    locations: analysis.locations ?? 1,
    about: analysis.summary ?? `${site.name} serves ${site.audience}`,
    audience: site.audience,
    geographic_market: site.geographicMarket,
    primary_goal: site.primaryGoal,
    primary_cta: site.primaryCta,
    timezone: 'America/New_York',
    posting_frequency: '3 posts per week',
    tone: analysis.tone.length ? analysis.tone : ['professional'],
    services: analysis.services.length ? analysis.services : site.fallbackServices,
    banned_phrases: site.bannedPhrases,
  });
}

async function submitInvitation(
  client: RestClient,
  token: string,
  submission: OnboardingSubmissionInput,
) {
  const data = await restJson<string>(client, '/rest/v1/rpc/submit_onboarding_invitation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      p_token_hash: hashInvitationToken(token),
      p_submission: submission as Json,
    }),
  });
  return String(data);
}

async function verifyPendingSubmission(
  client: RestClient,
  submissionId: string,
  invitationId: string,
) {
  const rows = await restJson<SubmissionRecord[]>(
    client,
    `/rest/v1/onboarding_submissions?id=eq.${encodeURIComponent(submissionId)}&select=id,invitation_id,status,name,website,industry,services,submitted_at`,
  );
  const row = rows[0];
  if (!row) throw new Error(`Could not verify submission ${submissionId}.`);
  if (row.invitation_id !== invitationId || row.status !== 'pending') {
    throw new Error(`Submission ${submissionId} did not appear as pending for the expected invitation.`);
  }
  return row;
}

function assertDistinct(a: WebsiteAnalysis, b: WebsiteAnalysis) {
  const analyses: Array<[string, WebsiteAnalysis]> = [
    ['site A', a],
    ['site B', b],
  ];

  analyses.forEach(([label, analysis]) => {
    if (!analysis.suggestedCategory && !analysis.businessType) {
      throw new Error(`Production analysis for ${label} did not find an evidence-backed category.`);
    }
    if (analysis.services.length === 0) {
      throw new Error(`Production analysis for ${label} did not find evidence-backed services.`);
    }
    if (analysis.evidence.length === 0) {
      throw new Error(`Production analysis for ${label} did not capture source evidence.`);
    }
  });

  const normalizedA = JSON.stringify({
    businessType: a.businessType,
    suggestedCategory: a.suggestedCategory,
    services: a.services,
    tone: a.tone,
    summary: a.summary,
  });
  const normalizedB = JSON.stringify({
    businessType: b.businessType,
    suggestedCategory: b.suggestedCategory,
    services: b.services,
    tone: b.tone,
    summary: b.summary,
  });
  if (normalizedA === normalizedB) {
    throw new Error('Production analysis returned identical findings for two different websites.');
  }
}

async function main() {
  const baseUrl = appUrl();
  const label = nowLabel();
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl) throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required.');

  const restClient = { url: supabaseUrl, key: serviceRoleKey };
  const [siteA, siteB] = defaultSites(label);

  const inviteA = await createInvitation(restClient, siteA, label);
  const inviteB = await createInvitation(restClient, siteB, label);

  const publicLinkA = await loadInvitationPage(baseUrl, inviteA.token, siteA.name);
  const publicLinkB = await loadInvitationPage(baseUrl, inviteB.token, siteB.name);
  const analysisA = await analyzeViaProduction(baseUrl, inviteA.token, siteA);
  const analysisB = await analyzeViaProduction(baseUrl, inviteB.token, siteB);
  assertDistinct(analysisA, analysisB);

  const submission = submissionFor(siteA, analysisA);
  const submissionId = await submitInvitation(restClient, inviteA.token, submission);
  const pendingSubmission = await verifyPendingSubmission(restClient, submissionId, inviteA.id);

  const evidence = {
    capturedAt: new Date().toISOString(),
    appUrl: baseUrl,
    publicInvitationLoaded: {
      business: siteA.name,
      invitationId: inviteA.id,
      publicLink: publicLinkA,
      submissionId,
      submissionStatus: pendingSubmission.status,
      submittedWebsite: pendingSubmission.website,
      submittedIndustry: pendingSubmission.industry,
    },
    distinctProductionFindings: [
      {
        business: siteA.name,
        publicLink: publicLinkA,
        sourceUrl: analysisA.sourceUrl,
        category: analysisA.suggestedCategory ?? analysisA.businessType,
        services: analysisA.services,
        tone: analysisA.tone,
        warnings: analysisA.warnings,
      },
      {
        business: siteB.name,
        publicLink: publicLinkB,
        sourceUrl: analysisB.sourceUrl,
        category: analysisB.suggestedCategory ?? analysisB.businessType,
        services: analysisB.services,
        tone: analysisB.tone,
        warnings: analysisB.warnings,
      },
    ],
    operatorReviewQueue: `${baseUrl}/dashboard/onboarding`,
  };

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
