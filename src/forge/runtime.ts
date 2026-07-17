import { generateText, tool, stepCountIs } from 'ai';
import { resolveModel } from './model';
import { tools as forgeTools } from './registry';
import { supabase } from '../supabase';
import { assertToolPermission, DEFAULT_AGENT_KEY } from './authority';
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

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

async function recordRunFailure(runId: string, error: unknown) {
  const message = errorMessage(error);
  await supabase
    .from('content_approvals')
    .delete()
    .eq('run_id', runId)
    .eq('status', 'pending');
  await supabase
    .from('tool_runs')
    .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
    .eq('id', runId);
  await supabase.from('forge_run_evidence').insert({
    run_id: runId,
    kind: 'error',
    description: 'Tool execution failed.',
    payload: { message },
  });
  await supabase.from('forge_run_audits').insert({
    run_id: runId,
    status: 'failed',
    summary: 'The tool run did not complete successfully.',
    findings: [{ severity: 'P0', code: 'execution_failed', message }],
  });
}

// Wrap each ForgeTool as an AI SDK tool, closing over the run context. Tools keep their
// simple (input, ctx) contract; the SDK handles each provider's tool-calling format.
function buildTools(
  forge: AnyForgeTool[],
  ctx: ToolContext,
  task: string,
  agentKey: string,
  steps: ForgeStep[],
) {
  const entries = forge.map((t) => [
    t.name,
    tool({
      description: t.description,
      inputSchema: t.schema as never,
      execute: async (input: unknown) => {
        const authority = await assertToolPermission({ agentKey, toolName: t.name });
        const { data: run, error: runError } = await supabase
          .from('tool_runs')
          .insert({
            agent_id: authority.agentId,
            client_id: ctx.client.id,
            task,
            tool: t.name,
            input,
            status: 'running',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (runError || !run) {
          throw new Error(`Could not record tool run: ${runError?.message ?? 'missing run id'}`);
        }

        if (authority.verificationGates.length > 0) {
          const error = new Error(
            `Tool "${t.name}" declares verification gates, but no gate executor is configured.`,
          );
          await recordRunFailure(run.id, error);
          throw error;
        }

        if (authority.requiresApproval) {
          await supabase
            .from('tool_runs')
            .update({ status: 'awaiting_approval' })
            .eq('id', run.id);
          await supabase.from('forge_run_evidence').insert({
            run_id: run.id,
            kind: 'approval',
            description: `Pre-action approval required for ${authority.approvalActionType ?? t.name}.`,
          });
          throw new Error(
            `Tool "${t.name}" is awaiting pre-action approval; resume execution is not configured.`,
          );
        }

        try {
          const output = await t.execute(input, ctx);
          const { error: outputError } = await supabase
            .from('tool_runs')
            .update({ output })
            .eq('id', run.id);
          if (outputError) {
            throw new Error(`Could not persist tool output: ${outputError.message}`);
          }

          const { error: evidenceError } = await supabase.from('forge_run_evidence').insert({
            run_id: run.id,
            kind: 'output',
            description: `Structured output produced by ${t.name}.`,
            payload: output,
          });
          if (evidenceError) {
            throw new Error(`Could not record run evidence: ${evidenceError.message}`);
          }

          if (t.name === 'create_social_posts') {
            const { error: approvalError } = await supabase.from('content_approvals').insert({
              run_id: run.id,
              client_id: ctx.client.id,
            });

            if (approvalError) {
              throw new Error(`Could not queue content approval: ${approvalError.message}`);
            }
          }

          const { error: completedError } = await supabase
            .from('tool_runs')
            .update({ status: 'succeeded', completed_at: new Date().toISOString(), error: null })
            .eq('id', run.id);
          if (completedError) {
            throw new Error(`Could not complete tool run: ${completedError.message}`);
          }

          const { error: auditError } = await supabase.from('forge_run_audits').insert({
            run_id: run.id,
            status: 'succeeded',
            summary: `${t.name} completed and produced durable output evidence.`,
            findings: [],
          });
          if (auditError) {
            throw new Error(`Could not record run audit: ${auditError.message}`);
          }

          steps.push({ runId: run.id, tool: t.name, input, output });
          return output;
        } catch (error) {
          await recordRunFailure(run.id, error);
          throw error;
        }
      },
    }),
  ]);
  return Object.fromEntries(entries);
}

export async function runForge(params: {
  client: ClientContext;
  task: string;
  agentKey?: string;
}): Promise<ForgeRunResult> {
  const { client, task, agentKey = DEFAULT_AGENT_KEY } = params;
  const model = resolveModel();
  const ctx: ToolContext = { client, model };
  const steps: ForgeStep[] = [];

  const result = await generateText({
    model,
    system: systemPrompt(client),
    prompt: task,
    tools: buildTools(forgeTools, ctx, task, agentKey, steps),
    stopWhen: stepCountIs(MAX_STEPS),
  });

  return { text: result.text, steps };
}
