import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const onboardingSubmissionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().trim().url().max(500),
  industry: z.string().trim().min(1).max(120),
  locations: z.coerce.number().int().min(1).max(10_000),
  about: z.string().trim().min(1).max(4_000),
  audience: z.string().trim().min(1).max(1_000),
  geographic_market: z.string().trim().min(1).max(500),
  primary_goal: z.string().trim().min(1).max(500),
  primary_cta: z.string().trim().min(1).max(500),
  timezone: z.string().trim().min(1).max(100),
  posting_frequency: z.string().trim().min(1).max(200),
  tone: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  services: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  banned_phrases: z.array(z.string().trim().min(1).max(200)).max(50),
});

export type OnboardingSubmissionInput = z.infer<typeof onboardingSubmissionSchema>;

export function createInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function listFromFormData(formData: FormData, key: string) {
  return String(formData.get(key) ?? '')
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function submissionFromFormData(formData: FormData) {
  return onboardingSubmissionSchema.safeParse({
    name: formData.get('name'),
    website: formData.get('website'),
    industry: formData.get('industry'),
    locations: formData.get('locations'),
    about: formData.get('about'),
    audience: formData.get('audience'),
    geographic_market: formData.get('geographic_market'),
    primary_goal: formData.get('primary_goal'),
    primary_cta: formData.get('primary_cta'),
    timezone: formData.get('timezone'),
    posting_frequency: formData.get('posting_frequency'),
    tone: listFromFormData(formData, 'tone'),
    services: listFromFormData(formData, 'services'),
    banned_phrases: listFromFormData(formData, 'banned_phrases'),
  });
}
