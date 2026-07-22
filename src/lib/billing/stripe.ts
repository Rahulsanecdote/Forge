import 'server-only';

// Stripe integration via REST (no SDK dependency), matching the fetch pattern used for the
// other providers. Config is read lazily from process.env — importing the validated `@/env`
// object here would evaluate that module during build-time page collection, where it exits
// without SUPABASE_*. All optional: with no secret key, checkout is unconfigured and the
// operator manages billing state by hand.

export { constructWebhookEvent } from './webhook-signature';

const STRIPE_API = 'https://api.stripe.com/v1';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function stripeSecret(): string | undefined {
  return optionalEnv('STRIPE_SECRET_KEY');
}

export function stripeConfigured(): boolean {
  return Boolean(stripeSecret());
}

async function stripePost(path: string, form: URLSearchParams): Promise<Record<string, unknown>> {
  const secret = stripeSecret();
  if (!secret) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY).');
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      (json?.error as { message?: string } | undefined)?.message ?? `Stripe ${response.status}`;
    throw new Error(message);
  }
  return json ?? {};
}

export interface CheckoutInput {
  clientId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
  customerEmail?: string | null;
}

// Create a Stripe Checkout session for a subscription and return its hosted URL. The
// client id is stamped on both the session (client_reference_id) and the subscription
// metadata so the webhook can resolve the client without a separate lookup table.
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('line_items[0][price]', input.priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', input.successUrl);
  form.set('cancel_url', input.cancelUrl);
  form.set('client_reference_id', input.clientId);
  form.set('subscription_data[metadata][client_id]', input.clientId);
  form.set('metadata[client_id]', input.clientId);
  if (input.customerId) form.set('customer', input.customerId);
  else if (input.customerEmail) form.set('customer_email', input.customerEmail);

  const session = await stripePost('/checkout/sessions', form);
  const url = typeof session.url === 'string' ? session.url : null;
  if (!url) throw new Error('Stripe did not return a Checkout URL.');
  return url;
}

// Create a Stripe Billing Portal session so a client can manage/cancel their subscription.
export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const form = new URLSearchParams();
  form.set('customer', customerId);
  form.set('return_url', returnUrl);
  const session = await stripePost('/billing_portal/sessions', form);
  const url = typeof session.url === 'string' ? session.url : null;
  if (!url) throw new Error('Stripe did not return a Billing Portal URL.');
  return url;
}

export function webhookSecret(): string | undefined {
  return optionalEnv('STRIPE_WEBHOOK_SECRET');
}
