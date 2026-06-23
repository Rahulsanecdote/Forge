import { z } from 'zod';
import { generateText } from 'ai';
import { parseJsonBlock } from '../util';
import type { ForgeTool } from '../types';

const reviewSchema = z.object({
  author: z.string().default('Customer'),
  rating: z.number().int().min(1).max(5),
  text: z.string(),
});

const schema = z.object({
  reviews: z.array(reviewSchema).min(1).describe('The customer reviews to respond to.'),
});

type Input = z.infer<typeof schema>;

interface ReviewReply {
  author: string;
  rating: number;
  reply: string;
  needs_manager: boolean;
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
      'Return ONLY a JSON array. Each item: {"author": string, "rating": number, "reply": string, "needs_manager": boolean}. No code fences.',
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await generateText({ model: ctx.model, prompt, maxOutputTokens: 2048 });
    return parseJsonBlock<ReviewReply[]>(text) ?? [];
  },
};
