import { env } from '../../env';
import {
  buildInstagramCaption,
  parseInstagramId,
  parseInstagramPermalink,
  planInstagramMedia,
  type InstagramPostResult,
} from './instagram-mapping';

const DEFAULT_GRAPH_VERSION = 'v21.0';

interface InstagramConfig {
  igUserId: string;
  accessToken: string;
}

export type PublishInstagramResult =
  | { published: true; posts: InstagramPostResult[] }
  | { published: false; code: 'unconfigured' | 'missing_image' | 'no_posts'; reason: string };

function graphVersion() {
  return env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

function resolveInstagramConfig(): InstagramConfig | null {
  const igUserId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  const accessToken = env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!igUserId || !accessToken) return null;
  return { igUserId, accessToken };
}

async function readErrorBody(response: Response) {
  const text = await response.text().catch(() => '');
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

async function graphPostId(url: string, params: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!response.ok) {
    throw new Error(`Instagram request failed (${response.status}): ${await readErrorBody(response)}`);
  }
  const parsed = parseInstagramId(await response.json().catch(() => null));
  if (!parsed) throw new Error('Instagram request succeeded without returning an id.');
  return parsed.id;
}

// Best-effort permalink fetch for a published media id. Non-fatal: the post is live
// either way; a missing permalink just falls back to the Instagram home URL.
async function resolvePermalink(base: string, mediaId: string, accessToken: string): Promise<string> {
  try {
    const response = await fetch(
      `${base}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (response.ok) {
      const permalink = parseInstagramPermalink(await response.json().catch(() => null));
      if (permalink) return permalink;
    }
  } catch {
    // ignore — see note above.
  }
  return 'https://www.instagram.com/';
}

// Two-step single-image publish: create a media container from a public image_url +
// caption, then publish it.
export async function publishInstagramPost(input: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<InstagramPostResult> {
  const base = `https://graph.facebook.com/${graphVersion()}`;

  const creationId = await graphPostId(`${base}/${encodeURIComponent(input.igUserId)}/media`, {
    image_url: input.imageUrl,
    caption: input.caption,
    access_token: input.accessToken,
  });

  const mediaId = await graphPostId(`${base}/${encodeURIComponent(input.igUserId)}/media_publish`, {
    creation_id: creationId,
    access_token: input.accessToken,
  });

  return { mediaId, url: await resolvePermalink(base, mediaId, input.accessToken) };
}

// Three-step carousel publish: create one child container per image (marked
// is_carousel_item), create a CAROUSEL parent referencing the children + caption,
// then publish the parent. `imageUrls` must already be 2–10 items (see planInstagramMedia).
export async function publishInstagramCarousel(input: {
  igUserId: string;
  accessToken: string;
  imageUrls: string[];
  caption: string;
}): Promise<InstagramPostResult> {
  const base = `https://graph.facebook.com/${graphVersion()}`;
  const mediaUrl = `${base}/${encodeURIComponent(input.igUserId)}/media`;

  const childIds: string[] = [];
  for (const imageUrl of input.imageUrls) {
    childIds.push(
      await graphPostId(mediaUrl, {
        image_url: imageUrl,
        is_carousel_item: 'true',
        access_token: input.accessToken,
      }),
    );
  }

  const creationId = await graphPostId(mediaUrl, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption: input.caption,
    access_token: input.accessToken,
  });

  const mediaId = await graphPostId(`${base}/${encodeURIComponent(input.igUserId)}/media_publish`, {
    creation_id: creationId,
    access_token: input.accessToken,
  });

  return { mediaId, url: await resolvePermalink(base, mediaId, input.accessToken) };
}

// Publish each approved post to Instagram. A post with one image publishes as a
// single photo; a post with 2+ images publishes as a carousel (capped at 10). Fails
// closed when the IG account/token is missing or any post lacks a generated image;
// throws if Instagram rejects a post.
export async function publishApprovedInstagramPosts(input: {
  posts: Array<{ caption: string; hashtags: string[]; imageUrls: Array<string | null | undefined> }>;
}): Promise<PublishInstagramResult> {
  if (input.posts.length === 0) {
    return { published: false, code: 'no_posts', reason: 'No approved posts to publish.' };
  }

  const config = resolveInstagramConfig();
  if (!config) {
    return {
      published: false,
      code: 'unconfigured',
      reason: 'Missing INSTAGRAM_BUSINESS_ACCOUNT_ID or META_PAGE_ACCESS_TOKEN.',
    };
  }

  const plans = input.posts.map((post) => ({ post, plan: planInstagramMedia(post.imageUrls) }));
  if (plans.some(({ plan }) => plan.kind === 'none')) {
    return {
      published: false,
      code: 'missing_image',
      reason: 'Every Instagram post needs at least one generated image before it can be published.',
    };
  }

  const posts: InstagramPostResult[] = [];
  for (const { post, plan } of plans) {
    const caption = buildInstagramCaption(post.caption, post.hashtags);
    if (plan.kind === 'carousel') {
      posts.push(
        await publishInstagramCarousel({
          igUserId: config.igUserId,
          accessToken: config.accessToken,
          imageUrls: plan.imageUrls,
          caption,
        }),
      );
    } else if (plan.kind === 'single') {
      posts.push(
        await publishInstagramPost({
          igUserId: config.igUserId,
          accessToken: config.accessToken,
          imageUrl: plan.imageUrl,
          caption,
        }),
      );
    }
  }
  return { published: true, posts };
}
