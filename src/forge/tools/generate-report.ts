import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const metricSchema = z.object({
  name: z.string().describe('Metric name, e.g. "Instagram followers" or "Google rating".'),
  value: z.string().describe('Current value as text, e.g. "1,240" or "4.6".'),
  period: z.string().optional(),
  change: z.string().optional().describe('Change vs prior period, e.g. "+8%".'),
});

const schema = z.object({
  period: z.string().describe('Reporting period, e.g. "April 2026" or "Q1 2026".'),
  metrics: z
    .array(metricSchema)
    .default([])
    .describe('Real metrics to interpret. Only what is provided is used — never fabricated.'),
  highlights: z
    .array(z.string())
    .default([])
    .describe('Notable activities in the period (launches, campaigns, events).'),
});

type Input = z.infer<typeof schema>;

const reportSchema = z.object({
  period: z.string().trim().min(1),
  executive_summary: z.string().trim().min(1),
  whats_working: z.array(z.string().trim().min(1)),
  needs_attention: z.array(z.string().trim().min(1)),
  recommended_actions: z.array(z.string().trim().min(1)).min(1),
});

export function parseReport(text: string, expectedPeriod: string) {
  const parsed = reportSchema.safeParse(parseJsonBlock<unknown>(text));
  if (!parsed.success) {
    throw new Error(`Model returned invalid report JSON: ${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.period !== expectedPeriod) {
    throw new Error('Model report period did not match the requested reporting period.');
  }
  return parsed.data;
}

export const generateReport: ForgeTool<Input> = {
  name: 'generate_report',
  description:
    'Turn provided marketing metrics and highlights into a clear, on-brand performance report. Does not invent numbers.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;
    const prompt = [
      `Write a marketing performance report for ${ctx.client.name} covering ${input.period}.`,
      `Tone for the prose: ${bv.tone.join(', ') || 'clear and professional'}.`,
      '',
      input.metrics.length
        ? `Metrics (interpret ONLY these — do not invent or estimate any number):\n${JSON.stringify(input.metrics, null, 2)}`
        : 'No metrics were provided. Do not invent any; focus on qualitative guidance and note that data is missing.',
      input.highlights.length ? `Highlights this period:\n- ${input.highlights.join('\n- ')}` : '',
      '',
      'Return ONLY JSON: {"period": string, "executive_summary": string, "whats_working": string[], "needs_attention": string[], "recommended_actions": string[]}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    return parseReport(text, input.period);
  },
};
