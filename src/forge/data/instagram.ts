import { env } from '../../env';
import {
  buildInstagramCaption,
  parseInstagramId,
  parseInstagramPermalink,
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

// Two-step Instagram publish: create a media container from a public image_url + caption,
// then publish the container. Best-effort permalink fetch for the evidence reference.
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

  let url = `https://www.instagram.com/`;
  try {
    const permalinkResponse = await fetch(
      `${base}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(input.accessToken)}`,
    );
    if (permalinkResponse.ok) {
      const permalink = parseInstagramPermalink(await permalinkResponse.json().catch(() => null));
      if (permalink) url = permalink;
    }
  } catch {
    // Non-fatal: the post is published; we just couldn't resolve its permalink.
  }

  return { mediaId, url };
}

// Publish each approved post to Instagram. Fails closed when the IG account/token is
// missing or any post lacks a generated image; throws if Instagram rejects a post.
export async function publishApprovedInstagramPosts(input: {
  posts: Array<{ caption: string; hashtags: string[]; imageUrl: string | null }>;
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

  if (input.posts.some((post) => !post.imageUrl)) {
    return {
      published: false,
      code: 'missing_image',
      reason: 'Every Instagram post needs a generated image before it can be published.',
    };
  }

  const posts: InstagramPostResult[] = [];
  for (const post of input.posts) {
    posts.push(
      await publishInstagramPost({
        igUserId: config.igUserId,
        accessToken: config.accessToken,
        imageUrl: post.imageUrl as string,
        caption: buildInstagramCaption(post.caption, post.hashtags),
      }),
    );
  }
  return { published: true, posts };
}
