import { z } from 'zod';
import { generateText } from 'ai';
import { findBannedPhraseViolations } from '../compliance';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const reviewSchema = z.object({
  reviewId: z.string().min(1),
  author: z.string().default('Customer'),
  rating: z.number().int().min(1).max(5),
  text: z.string().default(''),
});

const schema = z.object({
  reviews: z.array(reviewSchema).min(1).describe('The customer reviews to respond to.'),
});

type Input = z.infer<typeof schema>;

const reviewReplySchema = z.object({
  review_id: z.string().min(1),
  reply: z.string().trim().min(1),
  needs_manager: z.boolean(),
});

const reviewRepliesSchema = z.array(reviewReplySchema).min(1);

export type ReviewReply = z.infer<typeof reviewReplySchema>;

export function parseReviewReplies(text: string, expectedReviewIds: string[]) {
  const parsed = reviewRepliesSchema.safeParse(parseJsonBlock<unknown>(text));
  if (!parsed.success) {
    throw new Error(`Model returned invalid review reply JSON: ${z.prettifyError(parsed.error)}`);
  }

  const expected = new Set(expectedReviewIds);
  const returned = new Set(parsed.data.map((reply) => reply.review_id));
  if (
    parsed.data.length !== expectedReviewIds.length ||
    returned.size !== parsed.data.length ||
    returned.size !== expected.size ||
    [...returned].some((id) => !expected.has(id))
  ) {
    throw new Error('Model review replies did not match the requested review IDs exactly.');
  }

  return parsed.data;
}

export const draftReviewResponses: ForgeTool<Input> = {
  name: 'draft_review_responses',
  description:
    'Draft on-brand replies to customer reviews, calibrated to each rating, and flag any that need a manager.',
  schema,
  async execute(input, ctx) {
    const bv = ctx.client.brandVoice;
    const prompt = [
      `Draft a reply to each of these reviews for ${ctx.client.name}. Match the brand tone: ${
        bv.tone.join(', ') || 'warm and genuine'
      }.`,
      'Rules: For 4-5 stars, thank them warmly and specifically. For 1-2 stars, acknowledge the issue, apologize sincerely, and offer to make it right offline — never be defensive. Set "needs_manager": true for anything alleging illness, injury, discrimination, or demanding a refund.',
      bv.bannedPhrases.length ? `Never use: ${bv.bannedPhrases.join(', ')}.` : '',
      '',
      `Reviews:\n${JSON.stringify(input.reviews, null, 2)}`,
      '',
      'Preserve each reviewId exactly as review_id so replies can never be attached by array position.',
      'Return ONLY a JSON array. Each item: {"review_id": string, "reply": string, "needs_manager": boolean}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    const replies = parseReviewReplies(
      text,
      input.reviews.map((review) => review.reviewId),
    );
    const violations = findBannedPhraseViolations(
      replies.map((reply) => reply.reply).join('\n'),
      bv.bannedPhrases,
    );
    if (violations.length > 0) {
      throw new Error(`Generated review replies used banned phrase(s): ${violations.join(', ')}`);
    }
    return replies;
  },
};
