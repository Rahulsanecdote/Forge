import { env } from '../../env';
import { facebookPostUrl, parseFacebookPostResponse, type FacebookPostResult } from './meta-mapping';

const DEFAULT_GRAPH_VERSION = 'v21.0';

interface MetaPageConfig {
  pageId: string;
  accessToken: string;
}

export type PublishFacebookResult =
  | { published: true; posts: FacebookPostResult[] }
  | { published: false; code: 'unconfigured' | 'no_posts'; reason: string };

export type PublishSingleFacebookResult =
  | { published: true; post: FacebookPostResult }
  | { published: false; code: 'unconfigured' | 'no_posts'; reason: string };

function graphVersion() {
  return env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

function resolveMetaPageConfig(): MetaPageConfig | null {
  const pageId = env.META_PAGE_ID?.trim();
  const accessToken = env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !accessToken) return null;
  return { pageId, accessToken };
}

async function readErrorBody(response: Response) {
  const text = await response.text().catch(() => '');
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

// Publish a single text post to a Facebook Page feed. Requires a Page access token
// with pages_manage_posts. Feed posts may be text-only (no media required).
export async function publishFacebookPagePost(input: {
  pageId: string;
  accessToken: string;
  message: string;
  link?: string | null;
}): Promise<FacebookPostResult> {
  const body = new URLSearchParams({ message: input.message, access_token: input.accessToken });
  const link = input.link?.trim();
  if (link) body.set('link', link);

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(input.pageId)}/feed`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body },
  );

  if (!response.ok) {
    throw new Error(`Facebook page post failed (${response.status}): ${await readErrorBody(response)}`);
  }

  const parsed = parseFacebookPostResponse(await response.json().catch(() => null));
  if (!parsed) {
    throw new Error('Facebook page post succeeded without returning a post id.');
  }
  return { id: parsed.id, url: facebookPostUrl(parsed.id) };
}

// Publish each approved post message to the configured Facebook Page. Fails closed
// when the page/token is missing; throws if Facebook rejects a post so the caller
// records no false success. Posts created before a mid-batch failure remain live.
export async function publishApprovedFacebookPosts(input: {
  messages: string[];
  link?: string | null;
}): Promise<PublishFacebookResult> {
  const messages = input.messages.map((message) => message.trim()).filter(Boolean);
  if (messages.length === 0) {
    return { published: false, code: 'no_posts', reason: 'No approved post content to publish.' };
  }

  const posts: FacebookPostResult[] = [];
  for (const message of messages) {
    const result = await publishApprovedFacebookPost({ message, link: input.link });
    if (!result.published) return result;
    posts.push(result.post);
  }
  return { published: true, posts };
}

export async function publishApprovedFacebookPost(input: {
  message: string;
  link?: string | null;
}): Promise<PublishSingleFacebookResult> {
  const message = input.message.trim();
  if (!message) {
    return { published: false, code: 'no_posts', reason: 'No approved post content to publish.' };
  }

  const config = resolveMetaPageConfig();
  if (!config) {
    return {
      published: false,
      code: 'unconfigured',
      reason: 'Missing META_PAGE_ID or META_PAGE_ACCESS_TOKEN.',
    };
  }

  return {
    published: true,
    post: await publishFacebookPagePost({
      pageId: config.pageId,
      accessToken: config.accessToken,
      message,
      link: input.link,
    }),
  };
}
