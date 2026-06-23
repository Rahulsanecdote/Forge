import { z } from 'zod';
import { readFileSync } from 'node:fs';

// The shape of a client config file. Anyone onboarding a business edits/copies one of
// these (see examples/) — no code changes required.
export const clientConfigSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  locations: z.number().int().min(1).default(1),
  brandVoice: z.object({
    tone: z.array(z.string()).default([]),
    about: z.string().default(''),
    audience: z.string().default(''),
    dos: z.array(z.string()).default([]),
    donts: z.array(z.string()).default([]),
    samplePosts: z.array(z.string()).default([]),
    bannedPhrases: z.array(z.string()).default([]),
  }),
});

export type ClientConfig = z.infer<typeof clientConfigSchema>;

export function loadClientConfig(path: string): ClientConfig {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return clientConfigSchema.parse(raw);
}
