import { inngest } from './client';
import { listClients } from '../forge/clients';
import { runForge } from '../forge/runtime';
import { resolveModel } from '../forge/model';
import { draftReviewResponses } from '../forge/tools/draft-review-responses';
import { supabase } from '../supabase';
import { env } from '../env';

const CONTENT_CRON = env.FORGE_CONTENT_CRON ?? '0 9 * * 1'; // Mondays 09:00 UTC
const REVIEW_CRON = env.FORGE_REVIEW_CRON ?? '0 8 * * *'; // daily 08:00 UTC

// Generate next week's social posts for every client.
export const weeklyContent = inngest.createFunction(
  { id: 'weekly-content', triggers: [{ cron: CONTENT_CRON }] },
  async ({ step }) => {
    const clients = await step.run('list-clients', () => listClients());

    const results: { client: string; summary: string }[] = [];
    for (const client of clients) {
      const r = await step.run(`content-${client.slug}`, () =>
        runForge({
          client,
          task:
            "Write this week's social posts (about 3). Choose a fitting theme for the current week — seasonal, a regular promo, or community — and stay on brand.",
        }),
      );
      results.push({ client: client.slug, summary: r.text });
    }

    return { ran: results.length, results };
  },
);

// Draft on-brand replies to any new reviews, flagging ones that need a manager.
// Acts on rows in `reviews` with status = 'new' (fed by an integration; see README).
export const reviewSweep = inngest.createFunction(
  { id: 'review-sweep', triggers: [{ cron: REVIEW_CRON }] },
  async ({ step }) => {
    const clients = await step.run('list-clients', () => listClients());
    const model = resolveModel();

    let drafted = 0;
    for (const client of clients) {
      const handled = await step.run(`reviews-${client.slug}`, async () => {
        const { data: pending } = await supabase
          .from('reviews')
          .select('*')
          .eq('client_id', client.id)
          .eq('status', 'new');
        if (!pending?.length) return 0;

        const reviews = pending.map((r: any) => ({
          author: r.author ?? 'Customer',
          rating: r.rating,
          text: r.text,
        }));

        const replies = (await draftReviewResponses.execute({ reviews }, { client, model })) as Array<{
          reply?: string;
          needs_manager?: boolean;
        }>;

        await Promise.all(
          pending.map((row: any, i: number) =>
            supabase
              .from('reviews')
              .update({
                status: 'drafted',
                draft_reply: replies[i]?.reply ?? '',
                needs_manager: replies[i]?.needs_manager ?? false,
              })
              .eq('id', row.id),
          ),
        );

        return pending.length;
      });
      drafted += handled;
    }

    return { drafted };
  },
);

export const functions = [weeklyContent, reviewSweep];
