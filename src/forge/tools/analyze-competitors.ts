import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const competitorSchema = z.object({
  name: z.string(),
  notes: z.string().optional().describe('Anything known: positioning, strengths, URL, observations.'),
});

const schema = z.object({
  competitors: z.array(competitorSchema).min(1).describe('Competitors to analyze, with any known details.'),
  focus: z.string().optional().describe('Optional angle, e.g. "social presence" or "pricing".'),
});

type Input = z.infer<typeof schema>;

const competitorViewSchema = z.object({
  name: z.string().trim().min(1),
  likely_strengths: z.array(z.string().trim().min(1)),
  likely_gaps: z.array(z.string().trim().min(1)),
});

const analysisSchema = z.object({
  summary: z.string().trim().min(1),
  per_competitor: z.array(competitorViewSchema).min(1),
  where_client_wins: z.array(z.string().trim().min(1)),
  opportunities: z.array(z.string().trim().min(1)).min(1),
  recommended_positioning: z.string().trim().min(1),
});

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

export function parseCompetitorAnalysis(text: string, expectedNames: string[]) {
  const parsed = analysisSchema.safeParse(parseJsonBlock<unknown>(text));
  if (!parsed.success) {
    throw new Error(`Model returned invalid competitor analysis JSON: ${z.prettifyError(parsed.error)}`);
  }
  const expected = new Set(expectedNames.map(normalizedName));
  const returned = new Set(parsed.data.per_competitor.map((entry) => normalizedName(entry.name)));
  if (
    returned.size !== parsed.data.per_competitor.length ||
    returned.size !== expected.size ||
    [...returned].some((name) => !expected.has(name))
  ) {
    throw new Error('Model competitor analysis did not match the requested competitors exactly.');
  }
  return parsed.data;
}

export const analyzeCompetitors: ForgeTool<Input> = {
  name: 'analyze_competitors',
  description:
    'Analyze named competitors against the client to find positioning gaps and opportunities. Works from provided details — does not fabricate facts about competitors.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;
    const prompt = [
      `Compare ${ctx.client.name} against these competitors and find where ${ctx.client.name} can win.`,
      `${ctx.client.name}'s positioning: ${bv.about || ctx.client.industry || 'n/a'}. Audience: ${bv.audience || 'n/a'}.`,
      input.focus ? `Focus the analysis on: ${input.focus}.` : '',
      '',
      `Competitors (analyze ONLY from these details plus general category knowledge; hedge inferences with "likely" and do NOT invent specific facts like pricing or traffic):\n${JSON.stringify(input.competitors, null, 2)}`,
      '',
      'Return ONLY JSON: {"summary": string, "per_competitor": [{"name": string, "likely_strengths": string[], "likely_gaps": string[]}], "where_client_wins": string[], "opportunities": string[], "recommended_positioning": string}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    return parseCompetitorAnalysis(
      text,
      input.competitors.map((competitor) => competitor.name),
    );
  },
};
