import { generateText, tool, stepCountIs } from 'ai';
import { resolveModel } from './model';
import { tools as forgeTools } from './registry';
import { supabase } from '../supabase';
import type { AnyForgeTool, ClientContext, ToolContext } from './types';

const MAX_STEPS = 6;

function systemPrompt(client: ClientContext): string {
  const bv = client.brandVoice;
  return [
    `You are Forge, the autonomous marketing operator for "${client.name}".`,
    client.industry ? `Industry: ${client.industry}.` : '',
    `Locations: ${client.locations}. Website: ${client.website ?? 'n/a'}.`,
    '',
    'BRAND VOICE — obey it in everything you produce:',
    `- Tone: ${bv.tone.join(', ') || 'n/a'}`,
    `- About: ${bv.about || 'n/a'}`,
    `- Audience: ${bv.audience || 'n/a'}`,
    bv.dos.length ? `- Always: ${bv.dos.join('; ')}` : '',
    bv.donts.length ? `- Never: ${bv.donts.join('; ')}` : '',
    bv.bannedPhrases.length ? `- Banned phrases: ${bv.bannedPhrases.join(', ')}` : '',
    '',
    'Pick the right tool for the task, call it, then briefly summarize for the operator what you produced. Never invent metrics or facts about the business.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ForgeStep {
  runId: string;
  tool: string;
  input: unknown;
  output: unknown;
}

export interface ForgeRunResult {
  text: string;
  steps: ForgeStep[];
}

// Wrap each ForgeTool as an AI SDK tool, closing over the run context. Tools keep their
// simple (input, ctx) contract; the SDK handles each provider's tool-calling format.
function buildTools(forge: AnyForgeTool[], ctx: ToolContext, task: string, steps: ForgeStep[]) {
  const entries = forge.map((t) => [
    t.name,
    tool({
      description: t.description,
      inputSchema: t.schema as never,
      execute: async (input: unknown) => {
        const output = await t.execute(input, ctx);
        const { data: run, error: runError } = await supabase
          .from('tool_runs')
          .insert({ client_id: ctx.client.id, task, tool: t.name, input, output })
          .select('id')
          .single();

        if (runError || !run) {
          throw new Error(`Could not record tool run: ${runError?.message ?? 'missing run id'}`);
        }

        if (t.name === 'create_social_posts') {
          const { error: approvalError } = await supabase.from('content_approvals').insert({
            run_id: run.id,
            client_id: ctx.client.id,
          });

          if (approvalError) {
            await supabase.from('tool_runs').delete().eq('id', run.id);
            throw new Error(`Could not queue content approval: ${approvalError.message}`);
          }
        }

        steps.push({ runId: run.id, tool: t.name, input, output });
        return output;
      },
    }),
  ]);
  return Object.fromEntries(entries);
}

export async function runForge(params: {
  client: ClientContext;
  task: string;
}): Promise<ForgeRunResult> {
  const { client, task } = params;
  const model = resolveModel();
  const ctx: ToolContext = { client, model };
  const steps: ForgeStep[] = [];

  const result = await generateText({
    model,
    system: systemPrompt(client),
    prompt: task,
    tools: buildTools(forgeTools, ctx, task, steps),
    stopWhen: stepCountIs(MAX_STEPS),
  });

  return { text: result.text, steps };
}
