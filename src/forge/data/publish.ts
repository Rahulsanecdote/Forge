import { supabase } from '../../supabase';
import { loadClient } from '../clients';
import type { ClientContext } from '../types';
import { parseSocialPostOutput, findBannedPhraseViolations } from '@/lib/admin/run-output';
import { isDeliveryActive } from '@/lib/billing/entitlements';

// Terminal status strings shared with the dashboard status banner. The immediate
// "Publish" action and the scheduled-publish cron both funnel through
// publishApprovedRun, so the outcome vocabulary stays identical for both paths.
export type PublishRunStatus =
  | 'publish-complete'
  | 'publish-already'
  | 'publish-unsupported'
  | 'publish-blocked'
  | 'publish-blocked-billing'
  | 'publish-unconfigured'
  | 'publish-missing-image'
  | 'publish-error';

export interface PublishRunOutcome {
  status: PublishRunStatus;
  publishedCount: number;
}

interface EvidenceRow {
  reference: string;
  description: string;
  payload: Record<string, unknown>;
}

function outcome(status: PublishRunStatus, publishedCount = 0): PublishRunOutcome {
  return { status, publishedCount };
}

// Publish an approved social-post run to its platform. This is the single
// fail-closed publish path: it re-validates the approval, re-checks banned-phrase
// compliance, is idempotent against prior published_url evidence, and records one
// published_url evidence row per live post. It never throws — every failure maps
// to a PublishRunStatus so callers (server action + cron) can react uniformly.
export async function publishApprovedRun(runId: string): Promise<PublishRunOutcome> {
  try {
    const { data: run } = await supabase
      .from('tool_runs')
      .select('id, client_id, tool, output')
      .eq('id', runId)
      .single();
    if (!run || run.tool !== 'create_social_posts' || !run.client_id) {
      return outcome('publish-error');
    }

    const { data: approval } = await supabase
      .from('content_approvals')
      .select('status')
      .eq('run_id', runId)
      .maybeSingle();
    if (!approval || approval.status !== 'approved') return outcome('publish-error');

    const parsed = parseSocialPostOutput(run.output);
    if (
      !parsed ||
      (parsed.platform !== 'google_business' &&
        parsed.platform !== 'facebook' &&
        parsed.platform !== 'instagram')
    ) {
      return outcome('publish-unsupported');
    }

    const { data: clientRow } = await supabase
      .from('clients')
      .select('slug')
      .eq('id', run.client_id)
      .single();
    if (!clientRow?.slug) return outcome('publish-error');

    let client: ClientContext;
    try {
      client = await loadClient(clientRow.slug);
    } catch {
      return outcome('publish-error');
    }

    // Billing gate: don't publish for a client without an active subscription (or an
    // operator comp override). Covers both the manual Publish button and the cron.
    if (!isDeliveryActive({ subscriptionStatus: client.subscriptionStatus, billingOverride: client.billingOverride })) {
      return outcome('publish-blocked-billing');
    }

    if (findBannedPhraseViolations(run.output, client.brandVoice.bannedPhrases).length > 0) {
      return outcome('publish-blocked');
    }

    // Idempotency: if any post was already published for this run, do not re-post.
    const { data: alreadyPublished } = await supabase
      .from('forge_run_evidence')
      .select('id')
      .eq('run_id', runId)
      .eq('kind', 'published_url')
      .limit(1);
    if (alreadyPublished && alreadyPublished.length > 0) return outcome('publish-already');

    const messages = parsed.posts.map((post) =>
      [post.caption, post.hashtags.join(' ')].filter(Boolean).join('\n\n'),
    );

    let evidence: EvidenceRow[] = [];
    let failureStatus: PublishRunStatus | null = null;

    if (parsed.platform === 'google_business') {
      const { publishApprovedSocialPostsToGoogle } = await import('./google-business-profile');
      const result = await publishApprovedSocialPostsToGoogle({ client, summaries: messages });
      if (result.published) {
        evidence = result.posts.map((post) => ({
          reference: post.searchUrl ?? post.name,
          description: 'Google Business local post published by Forge.',
          payload: { name: post.name, searchUrl: post.searchUrl },
        }));
      } else {
        failureStatus = result.code === 'unconfigured' ? 'publish-unconfigured' : 'publish-error';
      }
    } else if (parsed.platform === 'facebook') {
      const { publishApprovedFacebookPosts } = await import('./meta');
      const result = await publishApprovedFacebookPosts({ messages, link: client.website });
      if (result.published) {
        evidence = result.posts.map((post) => ({
          reference: post.url,
          description: 'Facebook page post published by Forge.',
          payload: { id: post.id, url: post.url },
        }));
      } else {
        failureStatus = result.code === 'unconfigured' ? 'publish-unconfigured' : 'publish-error';
      }
    } else {
      // instagram — every post needs at least one generated image (a public URL).
      // Multiple images per post (ordered by asset_index) publish as a carousel.
      const { data: assets } = await supabase
        .from('content_assets')
        .select('post_index, asset_index, public_url')
        .eq('run_id', runId)
        .eq('kind', 'image')
        .order('post_index', { ascending: true })
        .order('asset_index', { ascending: true });
      const imagesByIndex = new Map<number, string[]>();
      for (const row of (assets ?? []) as Array<{ post_index: number; public_url: string }>) {
        const urls = imagesByIndex.get(row.post_index) ?? [];
        urls.push(row.public_url);
        imagesByIndex.set(row.post_index, urls);
      }
      const { publishApprovedInstagramPosts } = await import('./instagram');
      const result = await publishApprovedInstagramPosts({
        posts: parsed.posts.map((post, index) => ({
          caption: post.caption,
          hashtags: post.hashtags,
          imageUrls: imagesByIndex.get(index) ?? [],
        })),
      });
      if (result.published) {
        evidence = result.posts.map((post) => ({
          reference: post.url,
          description: 'Instagram post published by Forge.',
          payload: { mediaId: post.mediaId, url: post.url },
        }));
      } else {
        failureStatus =
          result.code === 'unconfigured'
            ? 'publish-unconfigured'
            : result.code === 'missing_image'
              ? 'publish-missing-image'
              : 'publish-error';
      }
    }

    if (evidence.length === 0) return outcome(failureStatus ?? 'publish-error');

    for (const row of evidence) {
      await supabase.from('forge_run_evidence').insert({
        run_id: runId,
        kind: 'published_url',
        description: row.description,
        reference: row.reference,
        payload: row.payload,
      });
    }
    return outcome('publish-complete', evidence.length);
  } catch (error) {
    console.error('[publishApprovedRun]', error);
    return outcome('publish-error');
  }
}
