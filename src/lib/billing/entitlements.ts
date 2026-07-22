// Pure billing-entitlement logic. No env/IO so it's unit-testable and safe to import
// anywhere (crons, publish path, dashboard). The single source of truth for "should Forge
// keep doing automated work for this client?"

export const SUBSCRIPTION_STATUSES = [
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface BillingState {
  subscriptionStatus?: string | null;
  billingOverride?: boolean | null;
}

// A comped client (operator override) is always active. Otherwise only a live Stripe
// subscription — active or trialing — entitles automated delivery. past_due/canceled/
// incomplete/inactive all fail closed.
export function isDeliveryActive(state: BillingState): boolean {
  if (state.billingOverride) return true;
  return state.subscriptionStatus === 'active' || state.subscriptionStatus === 'trialing';
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

// Map a Stripe subscription.status to our stored enum. Stripe's `unpaid` collapses to
// past_due (both mean "billing is failing"); anything unrecognized is treated as inactive.
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    default:
      return 'inactive';
  }
}

export interface BillingSummary {
  active: boolean;
  status: SubscriptionStatus;
  label: string;
  comped: boolean;
}

export function billingSummary(state: BillingState): BillingSummary {
  const status = (state.subscriptionStatus && isSubscriptionStatus(state.subscriptionStatus)
    ? state.subscriptionStatus
    : 'inactive') as SubscriptionStatus;
  const comped = Boolean(state.billingOverride);
  const labels: Record<SubscriptionStatus, string> = {
    active: 'Active',
    trialing: 'Trialing',
    past_due: 'Past due',
    canceled: 'Canceled',
    incomplete: 'Incomplete',
    inactive: 'No subscription',
  };
  return {
    active: isDeliveryActive(state),
    status,
    label: comped ? 'Comped (override)' : labels[status],
    comped,
  };
}
