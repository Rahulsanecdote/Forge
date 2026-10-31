import { z } from 'zod';
import { supabase } from '../../supabase';
import type { ForgeTool } from '../types';
import { buildFailureRow, countRepeats } from './failure-log';

const schema = z.object({
  task: z.string().trim().min(1).describe('The task the agent was performing when it failed.'),
  did: z.string().trim().min(1).describe('What the agent actually did.'),
  shouldHave: z
    .string()
    .trim()
    .min(1)
    .describe('What it should have done instead — concrete enough to become a rule.'),
  caughtBy: z
    .string()
    .trim()
    .min(1)
    .describe('Who or what caught it: the operator, a test, a client, the agent itself.'),
  severity: z
    .enum(['P1', 'P2', 'P3'])
    .describe('P1 = could cause decision-grade harm; P2 = caused rework; P3 = friction.'),
  rootCauseClass: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Short class label, e.g. "stale-source" or "unverified-count". Reuse an existing class label for this client when one fits.',
    ),
  fixRef: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Reference (link/ID) to the fix. IDs only — never secrets, screenshots, or personal data.'),
});

type Input = z.infer<typeof schema>;

// Append-only by design: logging a failure is never gated by the authority
// policy. Failures are the evidence the governance layer runs on.
export const logFailure: ForgeTool<Input> = {
  name: 'log_failure',
  description:
    'Record an agent failure for this client in the failure log: the task, what the agent did, what it should have done, who caught it, severity, and root-cause class. Use whenever a task output was wrong, misleading, or had to be redone.',
  schema,
  async execute(input, ctx) {
    const { data: existing, error: readError } = await supabase
      .from('failure_log')
      .select('root_cause_class')
      .eq('client_id', ctx.client.id);
    if (readError) throw new Error(`log_failure could not read failure_log: ${readError.message}`);

    const repeatCount = countRepeats(existing ?? [], input.rootCauseClass);

    const row = buildFailureRow(input, ctx.client.id);
    const { data: inserted, error: insertError } = await supabase
      .from('failure_log')
      .insert(row)
      .select()
      .single();
    if (insertError) throw new Error(`log_failure could not insert into failure_log: ${insertError.message}`);

    return { logged: true, failure: inserted, repeatCount };
  },
};
