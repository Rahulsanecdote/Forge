import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { parseJsonBlock } from './util';
import { clientConfigSchema, type ClientConfig } from './client-config';

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
}

// Draft a full client config (including brand voice) from a plain-language description.
// Used by the onboard CLI; the result is validated against clientConfigSchema.
export async function generateClientConfig(params: {
  name: string;
  description: string;
  industry?: string;
  model: LanguageModel;
}): Promise<ClientConfig> {
  const prompt = [
    'Create a brand voice profile for this business so an AI can write marketing in its voice.',
    `Business name: ${params.name}.`,
    params.industry ? `Industry: ${params.industry}.` : '',
    `Description: ${params.description}.`,
    '',
    'Return ONLY JSON: {"tone": string[], "about": string, "audience": string, "dos": string[], "donts": string[], "samplePosts": string[], "bannedPhrases": string[]}.',
    'tone: 3-5 adjectives. dos/donts: 3-4 each. samplePosts: 2 short on-brand examples. bannedPhrases: 2-4 clichés to avoid. No code fences.',
  ]
    .filter(Boolean)
    .join('\n');

  const { text } = await generateText({ model: params.model, prompt, maxOutputTokens: 1024 });
  const brandVoice = parseJsonBlock<ClientConfig['brandVoice']>(text) ?? undefined;

  return clientConfigSchema.parse({
    slug: slugify(params.name),
    name: params.name,
    industry: params.industry,
    locations: 1,
    brandVoice: brandVoice ?? {},
  });
}
