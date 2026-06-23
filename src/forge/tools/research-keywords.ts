import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const schema = z.object({
  topic: z.string().describe('Product, service, or theme to research keywords around.'),
  location: z.string().optional().describe('Geographic focus for local intent, e.g. "Jersey City, NJ".'),
  count: z.number().int().min(5).max(40).default(20).describe('Approximate number of keyword ideas.'),
});

type Input = z.infer<typeof schema>;

interface KeywordCluster {
  theme: string;
  intent: 'informational' | 'commercial' | 'transactional' | 'local';
  keywords: string[];
  content_angle: string;
}

export const researchKeywords: ForgeTool<Input> = {
  name: 'research_keywords',
  description:
    'Generate clustered SEO keyword ideas with search intent and a content angle per cluster. Ideation only — no volume/difficulty data.',
  schema,
  async execute(input, ctx) {
    const prompt = [
      `Generate about ${input.count} SEO keyword ideas for ${ctx.client.name} around: ${input.topic}.`,
      ctx.client.industry ? `Industry: ${ctx.client.industry}.` : '',
      input.location ? `Include local-intent variants for ${input.location}.` : '',
      'Group them into themed clusters. For each cluster give the search intent (informational | commercial | transactional | local) and one concrete content angle.',
      'Do NOT include search volume or difficulty numbers — you do not have that data.',
      '',
      'Return ONLY JSON: {"clusters": [{"theme": string, "intent": "informational"|"commercial"|"transactional"|"local", "keywords": string[], "content_angle": string}]}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    const parsed = parseJsonBlock<{ clusters: KeywordCluster[] }>(text);
    return {
      topic: input.topic,
      clusters: parsed?.clusters ?? [],
      note: 'Ideation only. Wire a data provider (e.g. DataForSEO) for real volume and difficulty.',
    };
  },
};
