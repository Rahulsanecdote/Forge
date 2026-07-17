import { z } from 'zod';
import { generateText } from 'ai';
import { findBannedPhraseViolations } from '../compliance';
import { parseJsonBlock } from '../util';
import type { ClientContext, ForgeTool } from '../types';

const schema = z.object({
  platform: z.enum(['instagram', 'facebook', 'google_business']).default('instagram'),
  count: z.number().int().min(1).max(10).default(3),
  topic: z.string().describe('What the posts are about — a launch, promo, season, etc.'),
  cta: z.string().optional().describe('Optional call to action, e.g. "come by this weekend".'),
});

type Input = z.infer<typeof schema>;

const socialPostSchema = z.object({
  caption: z.string().trim().min(1),
  hashtags: z.array(z.string().trim().min(1)).max(10),
  image_direction: z.string().trim().min(1),
});

const socialPostsSchema = z.array(socialPostSchema).min(1).max(10);

type SocialPost = z.infer<typeof socialPostSchema>;

const platformGuidance: Record<Input['platform'], string> = {
  instagram: 'Use platform-native line breaks and only relevant hashtags. Do not force trends.',
  facebook: 'Write for conversation and clarity. Keep hashtags sparse and optional.',
  google_business:
    'Write concise Google Business Profile copy. Hashtags should normally be an empty array unless the task explicitly requests them.',
};

export function buildSocialPostsPrompt(input: Input, client: ClientContext) {
  const bv = client.brandVoice;
  return [
    `Write ${input.count} ${input.platform} post(s) for ${client.name}.`,
    `Topic: ${input.topic}.`,
    input.cta ? `Weave in this call to action naturally: "${input.cta}".` : '',
    `Platform guidance: ${platformGuidance[input.platform]}`,
    '',
    'FACTUAL CEILING - do not exceed or embellish this business description:',
    bv.about || 'No business description was provided. Avoid specific product or performance claims.',
    '',
    `Tone: ${bv.tone.join(', ') || 'natural, friendly'}.`,
    `Audience: ${bv.audience || 'the business audience'}.`,
    bv.dos.length ? `Always do:\n- ${bv.dos.join('\n- ')}` : '',
    bv.donts.length ? `Never do:\n- ${bv.donts.join('\n- ')}` : '',
    bv.samplePosts.length ? `On-brand examples:\n- ${bv.samplePosts.join('\n- ')}` : '',
    bv.bannedPhrases.length ? `Banned phrases (case-insensitive): ${bv.bannedPhrases.join(', ')}.` : '',
    '',
    'Do not invent product availability, metrics, testimonials, certifications, prices, research findings, or health outcomes.',
    `Return ONLY a JSON array containing exactly ${input.count} item(s). Each item: {"caption": string, "hashtags": string[], "image_direction": string}. No prose, no code fences.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function assertBrandCompliance(posts: SocialPost[], bannedPhrases: string[]) {
  const generatedText = posts
    .flatMap((post) => [post.caption, ...post.hashtags, post.image_direction])
    .join('\n');
  const violations = findBannedPhraseViolations(generatedText, bannedPhrases);
  if (violations.length > 0) {
    throw new Error(`Generated social posts used banned phrase(s): ${violations.join(', ')}`);
  }
}

export const createSocialPosts: ForgeTool<Input> = {
  name: 'create_social_posts',
  description:
    'Generate ready-to-publish social posts in the client brand voice for a given topic and platform.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;
    const prompt = buildSocialPostsPrompt(input, ctx.client);

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    const parsed = socialPostsSchema.safeParse(parseJsonBlock<unknown>(text));
    if (!parsed.success) {
      throw new Error(`Model returned invalid social post JSON: ${z.prettifyError(parsed.error)}`);
    }
    const posts = parsed.data;
    if (posts.length !== input.count) {
      throw new Error(`Model returned ${posts.length} social post(s); expected ${input.count}.`);
    }
    assertBrandCompliance(posts, bv.bannedPhrases);
    return { platform: input.platform, count: posts.length, posts };
  },
};
