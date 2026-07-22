// Pure builder for the customer-facing review-request message. No env/IO so it's
// unit-testable. Kept short and warm; the operator sends it via their own channel
// (SMS/email) in v1. AI-personalization per brand voice is a future enhancement.

export interface ReviewRequestMessageInput {
  businessName: string;
  reviewUrl: string;
  customerName?: string | null;
}

function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

export function buildReviewRequestMessage(input: ReviewRequestMessageInput): string {
  const business = input.businessName.trim() || 'us';
  const name = firstName(input.customerName);
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  return (
    `${greeting} thanks for choosing ${business}! ` +
    `If you had a good experience, a quick Google review would mean a lot and ` +
    `helps other locals find us: ${input.reviewUrl}`
  );
}
