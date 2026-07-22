import { inngest } from './client';
import { listClients } from '../forge/clients';
import { runForge } from '../forge/runtime';
import { resolveModel } from '../forge/model';
import { draftReviewResponses } from '../forge/tools/draft-review-responses';
import { importGoogleBusinessProfileReviewsForClient } from '../forge/data/google-business-profile';
import { loadDueSchedules, runDueSchedule } from '../forge/data/schedules';
import { loadRecentlyPublishedRunIds, refreshRunMetrics } from '../forge/data/analytics';
import { isDeliveryActive } from '@/lib/billing/entitlements';
import { supabase } from '../supabase';
import { env } from '../env';

const CONTENT_CRON = env.FORGE_CONTENT_CRON ?? '0 9 * * 1'; // Mondays 09:00 UTC
const REVIEW_CRON = env.FORGE_REVIEW_CRON ?? '0 8 * * *'; // daily 08:00 UTC
const PUBLISH_CRON = env.FORGE_PUBLISH_CRON ?? '*/15 * * * *'; // every 15 minutes
const METRICS_CRON = env.FORGE_METRICS_CRON ?? '0 */6 * * *'; // every 6 hours
const METRICS_WINDOW_DAYS = 30;

// Generate next week's social posts for every client.
export const weeklyContent = inngest.createFunction(
  { id: 'weekly-content', triggers: [{ cron: CONTENT_CRON }] },
  async ({ step }) => {
    const allClients = await step.run('list-clients', () => listClients());
    // Hard billing gate: skip clients without an active subscription (or a comp override).
    const clients = allClients.filter((client) =>
      isDeliveryActive({ subscriptionStatus: client.subscriptionStatus, billingOverride: client.billingOverride }),
    );

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
    const allClients = await step.run('list-clients', () => listClients());
    const clients = allClients.filter((client) =>
      isDeliveryActive({ subscriptionStatus: client.subscriptionStatus, billingOverride: client.billingOverride }),
    );
    const model = resolveModel();

    let drafted = 0;
    let imported = 0;
    for (const client of clients) {
      const importedForClient = await step.run(`import-reviews-${client.slug}`, () =>
        importGoogleBusinessProfileReviewsForClient(client),
      );
      imported += importedForClient.imported;

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

        // Only act on reviews that actually got a usable reply. Malformed or
        // short model output leaves some entries empty; those stay 'new' so a
        // later sweep retries them instead of being silently dropped.
        const updates = pending
          .map((row: any, i: number) => ({ row, reply: replies[i] }))
          .filter((u: { reply?: { reply?: string } }) => (u.reply?.reply ?? '').trim().length > 0);

        const results = await Promise.all(
          updates.map(({ row, reply }) =>
            supabase
              .from('reviews')
              .update({
                status: 'drafted',
                draft_reply: reply!.reply,
                needs_manager: reply!.needs_manager ?? false,
              })
              .eq('id', row.id),
          ),
        );

        // Supabase resolves with { error } instead of throwing; surface any
        // failure so Inngest retries the step rather than recording a false
        // success and dropping the review.
        const failed = results.filter((r) => r.error);
        if (failed.length) {
          throw new Error(
            `Failed to update ${failed.length}/${updates.length} review drafts for ${client.slug}: ${failed[0].error?.message}`,
          );
        }

        return updates.length;
      });
      drafted += handled;
    }

    return { imported, drafted };
  },
);

// Publish any approved social-post runs whose scheduled time has arrived. Each due
// schedule is claimed and published in its own durable step, so a retry memoizes
// already-published rows instead of re-posting. Publishing itself is idempotent and
// fail-closed (see publishApprovedRun).
export const scheduledPublish = inngest.createFunction(
  { id: 'scheduled-publish', triggers: [{ cron: PUBLISH_CRON }] },
  async ({ step }) => {
    const nowIso = new Date().toISOString();
    const due = await step.run('load-due-schedules', () => loadDueSchedules(nowIso));

    const results = [];
    for (const schedule of due) {
      const result = await step.run(`publish-${schedule.id}`, () => runDueSchedule(schedule));
      results.push(result);
    }

    const published = results.filter((r) => r.status === 'published').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    return { due: due.length, published, failed, results };
  },
);

// Refresh reach/engagement for recently published posts so the dashboard reflects
// how content is performing over time. Reach and engagement keep growing after a
// post goes live, so a periodic pull keeps the stored snapshot current. Meta
// channels only (Instagram, Facebook); each run refreshes in its own durable step.
export const refreshMetrics = inngest.createFunction(
  { id: 'refresh-metrics', triggers: [{ cron: METRICS_CRON }] },
  async ({ step }) => {
    const since = new Date(Date.now() - METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const runIds = await step.run('load-recent-runs', () => loadRecentlyPublishedRunIds(since));

    const results = [];
    for (const runId of runIds) {
      const result = await step.run(`metrics-${runId}`, () => refreshRunMetrics(runId));
      results.push({ runId, ...result });
    }

    const refreshed = results.filter((r) => r.refreshed).length;
    return { runs: runIds.length, refreshed, results };
  },
);

export const functions = [weeklyContent, reviewSweep, scheduledPublish, refreshMetrics];
