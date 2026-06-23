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

interface CompetitorView {
  name: string;
  likely_strengths: string[];
  likely_gaps: string[];
}

interface Analysis {
  summary: string;
  per_competitor: CompetitorView[];
  where_client_wins: string[];
  opportunities: string[];
  recommended_positioning: string;
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
    return (
      parseJsonBlock<Analysis>(text) ?? {
        summary: '',
        per_competitor: [],
        where_client_wins: [],
        opportunities: [],
        recommended_positioning: '',
      }
    );
  },
};
