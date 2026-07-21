import { z } from 'zod';
import { findBannedPhraseViolations as findViolations } from '@/forge/compliance';

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

const keywordClusterSchema = z
  .object({
    theme: z.string(),
    intent: z.string(),
    keywords: z.array(z.string()),
    content_angle: z.string(),
  })
  .passthrough();

const keywordMetricSchema = z
  .object({
    keyword: z.string(),
    search_volume: z.number().nullable(),
    keyword_difficulty: z.number().nullable(),
    cpc: z.number().nullable(),
    competition: z.number().nullable(),
    competition_level: z.string().nullable(),
    search_intent: z.string().nullable(),
    opportunity_score: z.number().nullable().optional(),
    opportunity_label: z.enum(['high', 'medium', 'low', 'unknown']).optional(),
  })
  .passthrough();

const keywordResearchOutputSchema = z
  .object({
    topic: z.string(),
    clusters: z.array(keywordClusterSchema),
    keyword_metrics: z.array(keywordMetricSchema).optional(),
    data_source: z
      .object({
        provider: z.string(),
        configured: z.boolean(),
        location: z.string(),
        language: z.string(),
        warning: z.string().optional(),
      })
      .optional(),
    note: z.string().optional(),
  })
  .passthrough();

export interface KeywordResearchOutput {
  topic: string;
  clusters: Array<{
    theme: string;
    intent: string;
    keywords: string[];
    contentAngle: string;
  }>;
  metrics: Array<{
    keyword: string;
    searchVolume: number | null;
    keywordDifficulty: number | null;
    cpc: number | null;
    competition: number | null;
    competitionLevel: string | null;
    searchIntent: string | null;
    opportunityScore: number | null;
    opportunityLabel: 'high' | 'medium' | 'low' | 'unknown';
  }>;
  dataSource: {
    provider: string;
    configured: boolean;
    location: string;
    language: string;
    warning: string | null;
  } | null;
  note: string | null;
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

export function parseKeywordResearchOutput(output: unknown): KeywordResearchOutput | null {
  const parsed = keywordResearchOutputSchema.safeParse(output);
  if (!parsed.success) return null;

  return {
    topic: parsed.data.topic,
    clusters: parsed.data.clusters.map((cluster) => ({
      theme: cluster.theme,
      intent: cluster.intent,
      keywords: cluster.keywords,
      contentAngle: cluster.content_angle,
    })),
    metrics: (parsed.data.keyword_metrics ?? []).map((metric) => ({
      keyword: metric.keyword,
      searchVolume: metric.search_volume,
      keywordDifficulty: metric.keyword_difficulty,
      cpc: metric.cpc,
      competition: metric.competition,
      competitionLevel: metric.competition_level,
      searchIntent: metric.search_intent,
      opportunityScore: metric.opportunity_score ?? null,
      opportunityLabel: metric.opportunity_label ?? 'unknown',
    })),
    dataSource: parsed.data.data_source
      ? {
          provider: parsed.data.data_source.provider,
          configured: parsed.data.data_source.configured,
          location: parsed.data.data_source.location,
          language: parsed.data.data_source.language,
          warning: parsed.data.data_source.warning ?? null,
        }
      : null,
    note: parsed.data.note ?? null,
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
  return findViolations(formatRunPayload(payload), bannedPhrases);
}
