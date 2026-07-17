import { z } from 'zod';

const socialPostSchema = z
  .object({
    caption: z.string(),
    hashtags: z.array(z.string()).optional(),
    image_direction: z.string().optional(),
  })
  .passthrough();

const socialPostOutputSchema = z
  .object({
    platform: z.string().optional(),
    count: z.number().int().nonnegative().optional(),
    posts: z.array(socialPostSchema),
  })
  .passthrough();

export interface SocialPostDraft {
  caption: string;
  hashtags: string[];
  imageDirection: string | null;
}

export interface SocialPostDraftOutput {
  platform: string | null;
  posts: SocialPostDraft[];
}

export function parseSocialPostOutput(output: unknown): SocialPostDraftOutput | null {
  const parsed = socialPostOutputSchema.safeParse(output);
  if (!parsed.success) return null;

  return {
    platform: parsed.data.platform ?? null,
    posts: parsed.data.posts.map((post) => ({
      caption: post.caption,
      hashtags: (post.hashtags ?? []).map((hashtag) =>
        hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
      ),
      imageDirection: post.image_direction ?? null,
    })),
  };
}

export function formatRunPayload(payload: unknown) {
  if (payload === undefined) return 'No data recorded.';
  try {
    return JSON.stringify(payload, null, 2) ?? String(payload);
  } catch {
    return String(payload);
  }
}

export function findBannedPhraseViolations(payload: unknown, bannedPhrases: string[]) {
  const text = formatRunPayload(payload).toLocaleLowerCase();
  return bannedPhrases.filter((phrase) => text.includes(phrase.toLocaleLowerCase()));
}
