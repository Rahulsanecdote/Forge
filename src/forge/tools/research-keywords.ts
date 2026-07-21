import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';
import { fetchKeywordMetricsFromDataForSeo, type KeywordMetric } from '../data/keywords';

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

interface KeywordResearchOutput {
  topic: string;
  clusters: KeywordCluster[];
  keyword_metrics: KeywordMetric[];
  data_source: {
    provider: 'dataforseo' | 'none';
    configured: boolean;
    location: string;
    language: string;
    warning?: string;
  };
  note: string;
}

function uniqueKeywordsFromClusters(clusters: KeywordCluster[]) {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const cluster of clusters) {
    for (const keyword of cluster.keywords) {
      const normalized = keyword.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      keywords.push(normalized);
    }
  }
  return keywords;
}

function maybeLine(label: string, value: string | string[] | null | undefined) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
  return text && text.trim() ? `${label}: ${text.trim()}.` : '';
}

export const researchKeywords: ForgeTool<Input> = {
  name: 'research_keywords',
  description:
    'Generate clustered SEO keyword ideas with search intent and a content angle per cluster. Adds real DataForSEO volume/difficulty metrics when configured.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;
    const prompt = [
      `Generate about ${input.count} SEO keyword ideas for ${ctx.client.name} around this customer demand seed: ${input.topic}.`,
      maybeLine('Industry', ctx.client.industry),
      maybeLine('Website', ctx.client.website),
      maybeLine('Geographic market', ctx.client.geographicMarket),
      maybeLine('Primary goal', ctx.client.primaryGoal),
      maybeLine('Primary call to action', ctx.client.primaryCta),
      maybeLine('Audience', bv.audience),
      maybeLine('Business summary', bv.about),
      maybeLine('Required factual guardrails', bv.dos),
      maybeLine('Do not claim', [...bv.donts, ...bv.bannedPhrases]),
      input.location ? `Include local-intent variants for ${input.location}.` : '',
      "Generate keywords that the client's customers would search before buying, booking, visiting, ordering, or comparing the client's offering.",
      'Do not generate keywords about marketing, branding, advertising, running, designing, or promoting this type of business unless the seed explicitly asks for those B2B services.',
      'Do not use placeholders such as "[City]", "[service]", or "near me" when a concrete location is available. If no concrete location is provided, prefer non-local customer intent.',
      'Keep every keyword grounded in the provided business facts. Do not invent products, offers, locations, or guarantees.',
      'Group them into themed clusters. For each cluster give the search intent (informational | commercial | transactional | local) and one concrete content angle.',
      'Do NOT include search volume, CPC, competition, or difficulty numbers in this JSON — provider data is added separately after generation.',
      '',
      'Return ONLY JSON: {"clusters": [{"theme": string, "intent": "informational"|"commercial"|"transactional"|"local", "keywords": string[], "content_angle": string}]}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    const parsed = parseJsonBlock<{ clusters: KeywordCluster[] }>(text);
    const clusters = parsed?.clusters ?? [];
    const keywordData = await fetchKeywordMetricsFromDataForSeo(uniqueKeywordsFromClusters(clusters));

    return {
      topic: input.topic,
      clusters,
      keyword_metrics: keywordData.metrics,
      data_source: {
        provider: keywordData.source,
        configured: keywordData.configured,
        location: keywordData.location,
        language: keywordData.language,
        warning: keywordData.warning,
      },
      note:
        keywordData.metrics.length > 0
          ? 'Keyword clusters are LLM-generated; volume, CPC, competition, search intent, and difficulty metrics are from DataForSEO Keyword Overview.'
          : (keywordData.warning ?? 'Ideation only. Configure DataForSEO credentials for real volume and difficulty.'),
    } satisfies KeywordResearchOutput;
  },
};
