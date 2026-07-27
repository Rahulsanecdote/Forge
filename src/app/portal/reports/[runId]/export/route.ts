import { NextResponse } from 'next/server';
import { z } from 'zod';
import { formatDateTime } from '@/lib/admin/format';
import { formatReportPackage } from '@/lib/admin/run-output';
import { loadPortalReportDetail } from '@/lib/portal/data';
import { getPortalClientId } from '@/lib/portal/session';

export const dynamic = 'force-dynamic';

const runIdSchema = z.string().uuid();
const numberFormat = new Intl.NumberFormat('en-US');

function lineItems(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- No item recorded.';
}

function metric(value: number | null | undefined) {
  return numberFormat.format(value ?? 0);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const clientId = await getPortalClientId();
  if (!clientId) return new NextResponse('Access needed', { status: 401 });

  const { runId } = await params;
  const parsedRunId = runIdSchema.safeParse(runId);
  if (!parsedRunId.success) return new NextResponse('Not found', { status: 404 });

  const detail = await loadPortalReportDetail(clientId, parsedRunId.data);
  if (!detail) return new NextResponse('Not found', { status: 404 });

  const { client, report, performance } = detail;
  const totalEngagement =
    (performance?.totals.likes ?? 0) +
    (performance?.totals.comments ?? 0) +
    (performance?.totals.shares ?? 0) +
    (performance?.totals.saved ?? 0);
  const exportText = [
    `${client.name} - ${report.period}`,
    `Generated: ${formatDateTime(report.createdAt)}`,
    '',
    formatReportPackage(report.report),
    '',
    'Performance Snapshot',
    `- Measured posts: ${metric(performance?.measuredPosts)}`,
    `- Reach: ${metric(performance?.totals.reach)}`,
    `- Impressions: ${metric(performance?.totals.impressions)}`,
    `- Engagement: ${metric(totalEngagement)}`,
    `- Last metrics update: ${formatDateTime(performance?.lastFetchedAt)}`,
    '',
    'Platform Breakdown',
    ...(performance?.byPlatform.length
      ? performance.byPlatform.map(
          (row) =>
            `- ${row.platform}: ${metric(row.posts)} posts, ${metric(row.reach)} reach, ${metric(row.impressions)} impressions`,
        )
      : ['- No platform metrics recorded yet.']),
    '',
    'Top Posts',
    ...(performance?.topPosts.length
      ? performance.topPosts.map(
          (post) =>
            `- ${post.caption} (${post.platform}; ${metric(post.likes)} likes, ${metric(post.comments)} comments)${post.permalink ? ` ${post.permalink}` : ''}`,
        )
      : ['- No measured top posts recorded yet.']),
    '',
    'Source Note',
    lineItems([
      "This report is generated from Forge's recorded drafts, publication history, and measured metrics.",
      'Missing values mean the connected platform did not return data for that field yet.',
    ]),
  ].join('\n');

  return new NextResponse(exportText, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="forge-report-${report.runId.slice(0, 8)}.txt"`,
      'Cache-Control': 'no-store',
    },
  });
}
