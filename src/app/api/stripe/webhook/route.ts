import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/admin/data';
import { constructWebhookEvent, webhookSecret } from '@/lib/billing/stripe';
import { mapStripeStatus } from '@/lib/billing/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe webhook: keep each client's subscription state in sync with Stripe. Verifies the
// signature (fail closed), then applies subscription lifecycle events. Env-gated: with no
// STRIPE_WEBHOOK_SECRET the endpoint is disabled and the operator manages state by hand.

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function eventObject(event: Record<string, unknown>): Record<string, unknown> {
  const data = event.data as { object?: unknown } | undefined;
  return (data?.object as Record<string, unknown>) ?? {};
}

// Update the client this event belongs to. We stamp `metadata.client_id` on both the
// Checkout session and the subscription, so that's the primary key; fall back to matching
// on the Stripe customer/subscription id we previously stored.
async function applyToClient(
  patch: Record<string, unknown>,
  keys: { clientId: string | null; customerId: string | null; subscriptionId: string | null },
): Promise<void> {
  const supabase = getAdminSupabase();
  const table = supabase.from('clients');
  // Supabase resolves with { error } instead of throwing, so an ignored error would let us
  // ACK the webhook while the row stayed stale (a paid client stuck inactive). Surface it so
  // the POST handler returns 5xx and Stripe retries. A missing match is not an error.
  const { error } = keys.clientId
    ? await table.update(patch).eq('id', keys.clientId)
    : keys.subscriptionId
      ? await table.update(patch).eq('stripe_subscription_id', keys.subscriptionId)
      : keys.customerId
        ? await table.update(patch).eq('stripe_customer_id', keys.customerId)
        : { error: null };
  if (error) throw new Error(`clients update failed: ${error.message}`);
}

function metadataClientId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  return asString(metadata?.client_id);
}

// The current period end as a unix timestamp. Older Stripe API versions expose it on the
// subscription; newer ones (2025-03+) moved it onto each subscription item, so fall back to
// the latest item's value. Returns null when neither is present.
function subscriptionPeriodEnd(object: Record<string, unknown>): number | null {
  if (typeof object.current_period_end === 'number') return object.current_period_end;
  const items = (object.items as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(items)) return null;
  const ends = items
    .map((item) => (item as { current_period_end?: unknown })?.current_period_end)
    .filter((value): value is number => typeof value === 'number');
  return ends.length > 0 ? Math.max(...ends) : null;
}

export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) {
    return NextResponse.json({ error: 'Stripe webhook not configured.' }, { status: 503 });
  }

  const body = await request.text();
  const event = constructWebhookEvent(body, request.headers.get('stripe-signature'), secret);
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const type = asString(event.type);
  const object = eventObject(event);

  try {
    if (type === 'checkout.session.completed') {
      await applyToClient(
        {
          stripe_customer_id: asString(object.customer),
          stripe_subscription_id: asString(object.subscription),
        },
        {
          clientId: asString(object.client_reference_id) ?? metadataClientId(object),
          customerId: asString(object.customer),
          subscriptionId: asString(object.subscription),
        },
      );
    } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const status = asString(object.status);
      const periodEnd = subscriptionPeriodEnd(object);
      await applyToClient(
        {
          subscription_status: status ? mapStripeStatus(status) : 'inactive',
          stripe_customer_id: asString(object.customer),
          stripe_subscription_id: asString(object.id),
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        },
        {
          clientId: metadataClientId(object),
          customerId: asString(object.customer),
          subscriptionId: asString(object.id),
        },
      );
    } else if (type === 'customer.subscription.deleted') {
      await applyToClient(
        { subscription_status: 'canceled' },
        {
          clientId: metadataClientId(object),
          customerId: asString(object.customer),
          subscriptionId: asString(object.id),
        },
      );
    }
  } catch (error) {
    console.error('[stripe webhook]', type, error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
