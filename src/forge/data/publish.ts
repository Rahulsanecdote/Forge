import { supabase } from '../../supabase';
import { loadClient } from '../clients';
import type { ClientContext } from '../types';
import { parseSocialPostOutput, findBannedPhraseViolations } from '@/lib/admin/run-output';
import { isDeliveryActive } from '@/lib/billing/entitlements';
import {
  claimContentPublication,
  decidePublicationClaim,
  finalizeContentPublication,
  markContentPublicationForReconciliation,
  releaseContentPublicationClaim,
  type PublicationPlatform,
} from './publication-checkpoints';

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
  | 'publish-reconcile'
  | 'publish-error';

export interface PublishRunOutcome {
  status: PublishRunStatus;
  publishedCount: number;
}

interface PublishedPost {
  reference: string;
  description: string;
  payload: Record<string, unknown>;
}

interface DraftPost {
  caption: string;
  hashtags: string[];
}

type ProviderPublishResult =
  | { published: true; post: PublishedPost }
  | { published: false; status: PublishRunStatus };

function outcome(status: PublishRunStatus, publishedCount = 0): PublishRunOutcome {
  return { status, publishedCount };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 600 ? `${message.slice(0, 600)}...` : message;
}

async function markForReconciliation(publicationId: string, error: unknown) {
  try {
    await markContentPublicationForReconciliation(publicationId, errorMessage(error));
  } catch (checkpointError) {
    console.error('[publishApprovedRun/reconcile]', checkpointError);
  }
}

async function publishOnePost(input: {
  platform: PublicationPlatform;
  client: ClientContext;
  message: string;
  post: DraftPost;
  imageUrls: string[];
}): Promise<ProviderPublishResult> {
  if (input.platform === 'google_business') {
    const { publishApprovedSocialPostToGoogle } = await import('./google-business-profile');
    const result = await publishApprovedSocialPostToGoogle({
      client: input.client,
      summary: input.message,
    });
    if (!result.published) {
      return {
        published: false,
        status: result.code === 'unconfigured' ? 'publish-unconfigured' : 'publish-error',
      };
    }
    return {
      published: true,
      post: {
        reference: result.post.searchUrl ?? result.post.name,
        description: 'Google Business local post published by Forge.',
        payload: { name: result.post.name, searchUrl: result.post.searchUrl },
      },
    };
  }

  if (input.platform === 'facebook') {
    const { publishApprovedFacebookPost } = await import('./meta');
    const result = await publishApprovedFacebookPost({
      message: input.message,
      link: input.client.website,
    });
    if (!result.published) {
      return {
        published: false,
        status: result.code === 'unconfigured' ? 'publish-unconfigured' : 'publish-error',
      };
    }
    return {
      published: true,
      post: {
        reference: result.post.url,
        description: 'Facebook page post published by Forge.',
        payload: { id: result.post.id, url: result.post.url },
      },
    };
  }

  const { publishApprovedInstagramPost } = await import('./instagram');
  const result = await publishApprovedInstagramPost({
    caption: input.post.caption,
    hashtags: input.post.hashtags,
    imageUrls: input.imageUrls,
  });
  if (!result.published) {
    return {
      published: false,
      status:
        result.code === 'unconfigured'
          ? 'publish-unconfigured'
          : result.code === 'missing_image'
            ? 'publish-missing-image'
            : 'publish-error',
    };
  }
  return {
    published: true,
    post: {
      reference: result.post.url,
      description: 'Instagram post published by Forge.',
      payload: { mediaId: result.post.mediaId, url: result.post.url },
    },
  };
}

// Publish an approved social-post run to its platform. This is the single
// fail-closed publish path: it re-validates the approval and current brand policy,
// then claims and finalizes one durable checkpoint per post. Existing publishing
// or reconciliation checkpoints block automatic retries because the external
// provider may already have accepted that post.
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

    // Evidence created before per-post checkpoints did not include a post index.
    // Preserve the old whole-run idempotency behavior for those historical runs.
    const { data: publishedEvidence } = await supabase
      .from('forge_run_evidence')
      .select('payload')
      .eq('run_id', runId)
      .eq('kind', 'published_url');
    const hasLegacyPublishedEvidence = (publishedEvidence ?? []).some(
      (row: { payload: unknown }) =>
        !row.payload ||
        typeof row.payload !== 'object' ||
        !Number.isInteger((row.payload as Record<string, unknown>).postIndex),
    );
    if (hasLegacyPublishedEvidence) return outcome('publish-already');

    const messages = parsed.posts.map((post) =>
      [post.caption, post.hashtags.join(' ')].filter(Boolean).join('\n\n'),
    );

    const imagesByIndex = new Map<number, string[]>();
    if (parsed.platform === 'instagram') {
      const { data: assets } = await supabase
        .from('content_assets')
        .select('post_index, asset_index, public_url')
        .eq('run_id', runId)
        .eq('kind', 'image')
        .order('post_index', { ascending: true })
        .order('asset_index', { ascending: true });
      for (const row of (assets ?? []) as Array<{ post_index: number; public_url: string }>) {
        const urls = imagesByIndex.get(row.post_index) ?? [];
        urls.push(row.public_url);
        imagesByIndex.set(row.post_index, urls);
      }
      if (parsed.posts.some((_, index) => (imagesByIndex.get(index) ?? []).length === 0)) {
        return outcome('publish-missing-image');
      }
    }

    let publishedCount = 0;
    let skippedCount = 0;

    for (const [postIndex, post] of parsed.posts.entries()) {
      const claim = await claimContentPublication({
        runId,
        clientId: run.client_id,
        postIndex,
        platform: parsed.platform as PublicationPlatform,
      });
      const decision = decidePublicationClaim(claim);
      if (decision === 'skip') {
        skippedCount += 1;
        continue;
      }
      if (decision === 'reconcile') return outcome('publish-reconcile', publishedCount);

      let providerResult: ProviderPublishResult;
      try {
        providerResult = await publishOnePost({
          platform: parsed.platform,
          client,
          message: messages[postIndex],
          post,
          imageUrls: imagesByIndex.get(postIndex) ?? [],
        });
      } catch (error) {
        await markForReconciliation(claim.publication_id, error);
        return outcome('publish-reconcile', publishedCount);
      }

      if (!providerResult.published) {
        try {
          await releaseContentPublicationClaim(claim.publication_id);
        } catch (error) {
          await markForReconciliation(claim.publication_id, error);
          return outcome('publish-reconcile', publishedCount);
        }
        return outcome(providerResult.status, publishedCount);
      }

      try {
        await finalizeContentPublication({
          publicationId: claim.publication_id,
          reference: providerResult.post.reference,
          description: providerResult.post.description,
          payload: {
            ...providerResult.post.payload,
            postIndex,
            platform: parsed.platform,
            checkpointId: claim.publication_id,
          },
        });
        publishedCount += 1;
      } catch (error) {
        await markForReconciliation(claim.publication_id, error);
        return outcome('publish-reconcile', publishedCount);
      }
    }

    return skippedCount === parsed.posts.length
      ? outcome('publish-already')
      : outcome('publish-complete', publishedCount);
  } catch (error) {
    console.error('[publishApprovedRun]', error);
    return outcome('publish-error');
  }
}
