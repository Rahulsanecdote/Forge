import { generateClientConfig } from '../forge/onboarding';
import { createSocialPosts } from '../forge/tools/create-social-posts';
import { draftReviewResponses } from '../forge/tools/draft-review-responses';
import { resolveWebModel } from '../forge/web-model';
import type { ClientConfig } from '../forge/client-config';
import type { ClientContext } from '../forge/types';

// The demo runs the exact same engine as the CLI — generateClientConfig() and the real
// ForgeTool.execute() implementations — but stateless: no Supabase, no persistence. Each
// request carries its own brand voice, so anyone can try Forge with only a model key set.

function toContext(cfg: ClientConfig): ClientContext {
  const bv = cfg.brandVoice;
  return {
    id: 'demo',
    slug: cfg.slug,
    name: cfg.name,
    industry: cfg.industry ?? null,
    website: cfg.website ?? null,
    locations: cfg.locations,
    brandVoice: {
      tone: bv.tone,
      about: bv.about,
      audience: bv.audience,
      dos: bv.dos,
      donts: bv.donts,
      samplePosts: bv.samplePosts,
      bannedPhrases: bv.bannedPhrases,
    },
  };
}

// Step 1: draft a brand voice from a plain-language business description.
export async function demoOnboard(input: {
  name: string;
  description: string;
  industry?: string;
}): Promise<ClientConfig> {
  return generateClientConfig({ ...input, model: resolveWebModel() });
}

// Step 2: generate on-brand social posts for a topic, in the drafted voice.
export async function demoSocialPosts(
  cfg: ClientConfig,
  input: {
    platform?: 'instagram' | 'facebook' | 'google_business';
    count?: number;
    topic: string;
    cta?: string;
  },
): Promise<unknown> {
  return createSocialPosts.execute(
    {
      platform: input.platform ?? 'instagram',
      count: input.count ?? 3,
      topic: input.topic,
      cta: input.cta,
    },
    { client: toContext(cfg), model: resolveWebModel() },
  );
}

// Alternate step 2: draft rating-calibrated replies to customer reviews.
export async function demoReviewReplies(
  cfg: ClientConfig,
  reviews: Array<{ author?: string; rating: number; text: string }>,
): Promise<unknown> {
  return draftReviewResponses.execute(
    { reviews: reviews.map((r) => ({ author: r.author ?? 'Customer', rating: r.rating, text: r.text })) },
    { client: toContext(cfg), model: resolveWebModel() },
  );
}
