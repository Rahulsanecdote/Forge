import { z } from 'zod';
import { supabase } from '../../supabase';
import type { ForgeTool } from '../types';
import { buildFailureDigest, type FailureRow } from './failure-log';

const schema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM')
    .optional()
    .describe('Optional month to review, as YYYY-MM. Omit to review all failures for this client.'),
});

type Input = z.infer<typeof schema>;

// The digest is computed deterministically from the recorded rows — counts are
// facts, so no model is asked to summarise them (honesty rule). Candidate rules
// are templates built from the recorded "should have" text; a human promotes
// them, the tool never writes rules itself.
export const reviewFailures: ForgeTool<Input> = {
  name: 'review_failures',
  description:
    'Review this client\u2019s failure log: counts by severity and root-cause class, unconverted P1 failures, and draft rules for failures a human should consider promoting. Use for the weekly failure review.',
  schema,
  async execute(input, ctx) {
    const { data, error } = await supabase
      .from('failure_log')
      .select('*')
      .eq('client_id', ctx.client.id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`review_failures could not read failure_log: ${error.message}`);

    return buildFailureDigest((data ?? []) as FailureRow[], ctx.client.id, input.period);
  },
};
