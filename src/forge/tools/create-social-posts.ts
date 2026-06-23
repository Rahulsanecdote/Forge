import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const schema = z.object({
  platform: z.enum(['instagram', 'facebook', 'google_business']).default('instagram'),
  count: z.number().int().min(1).max(10).default(3),
  topic: z.string().describe('What the posts are about — a launch, promo, season, etc.'),
  cta: z.string().optional().describe('Optional call to action, e.g. "come by this weekend".'),
});

type Input = z.infer<typeof schema>;

interface SocialPost {
  caption: string;
  hashtags: string[];
  image_direction: string;
}

export const createSocialPosts: ForgeTool<Input> = {
  name: 'create_social_posts',
  description:
    'Generate ready-to-publish social posts in the client brand voice for a given topic and platform.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;
    const prompt = [
      `Write ${input.count} ${input.platform} post(s) for ${ctx.client.name}.`,
      `Topic: ${input.topic}.`,
      input.cta ? `Weave in this call to action naturally: "${input.cta}".` : '',
      '',
      `Tone: ${bv.tone.join(', ') || 'natural, friendly'}. Audience: ${bv.audience || 'local customers'}.`,
      bv.samplePosts.length ? `On-brand examples:\n- ${bv.samplePosts.join('\n- ')}` : '',
      bv.bannedPhrases.length ? `Never use: ${bv.bannedPhrases.join(', ')}.` : '',
      '',
      'Return ONLY a JSON array. Each item: {"caption": string, "hashtags": string[], "image_direction": string}. No prose, no code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    const posts = parseJsonBlock<SocialPost[]>(text) ?? [];
    return { platform: input.platform, count: posts.length, posts };
  },
};
