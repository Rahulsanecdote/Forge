import 'server-only';
import { getAdminSupabase } from './data';

export interface OnboardingInvitation {
  id: string;
  business_name: string;
  email: string | null;
  expires_at: string;
  completed_at: string | null;
  revoked_at: string | null;
  analysis_count: number;
  created_at: string;
}

export interface OnboardingSubmission {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  name: string;
  website: string;
  industry: string;
  locations: number;
  about: string;
  audience: string;
  geographic_market: string;
  primary_goal: string;
  primary_cta: string;
  timezone: string;
  posting_frequency: string;
  approval_mode: 'review';
  tone: string[];
  services: string[];
  banned_phrases: string[];
  client_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export async function loadOnboardingOperations() {
  const supabase = getAdminSupabase();
  const [invitationsResult, submissionsResult] = await Promise.all([
    supabase
      .from('onboarding_invitations')
      .select('id, business_name, email, expires_at, completed_at, revoked_at, analysis_count, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('onboarding_submissions')
      .select('id, status, name, website, industry, locations, about, audience, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, tone, services, banned_phrases, client_id, submitted_at, reviewed_at')
      .order('submitted_at', { ascending: false })
      .limit(20),
  ]);

  return {
    invitations: (invitationsResult.data ?? []) as OnboardingInvitation[],
    submissions: (submissionsResult.data ?? []) as OnboardingSubmission[],
    errors: [invitationsResult.error?.message, submissionsResult.error?.message].filter(
      (message): message is string => Boolean(message),
    ),
  };
}
