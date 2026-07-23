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

// Subject line for the email channel. SMS has no subject; it sends the body directly.
export function buildReviewRequestSubject(businessName: string): string {
  const business = businessName.trim() || 'us';
  return `A quick favor — would you review ${business}?`;
}

// SMS opt-out disclosure. Carriers/TCPA expect a STOP instruction; Twilio then blocks
// further messages to a number that replies STOP.
export function appendSmsOptOut(body: string): string {
  return `${body}\n\nReply STOP to opt out.`;
}

// Email compliance footer (CAN-SPAM): a working unsubscribe link plus the sender's
// physical mailing address. Both are required; the address comes from config.
export function appendEmailFooter(
  body: string,
  opts: { businessName: string; unsubscribeUrl: string; mailingAddress?: string | null },
): string {
  const business = opts.businessName.trim() || 'us';
  const lines = [
    body,
    '',
    '—',
    `You received this because you're a customer of ${business}.`,
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ];
  const address = opts.mailingAddress?.trim();
  if (address) lines.push(address);
  return lines.join('\n');
}
