// Plan catalog. Pure/static so it's testable and shared by the dashboard, checkout, and
// enforcement. Each plan maps to a Stripe Price via an env var name (resolved server-side
// at checkout) — the id itself never lives in code.

export interface Plan {
  key: string;
  name: string;
  priceMonthly: number; // USD, for display
  blurb: string;
  priceEnvVar: string; // env var holding the Stripe Price id (e.g. price_123)
  features: string[];
}

export const PLANS: Record<string, Plan> = {
  starter: {
    key: 'starter',
    name: 'Starter',
    priceMonthly: 299,
    blurb: 'Done-for-you local marketing for a single-location business.',
    priceEnvVar: 'STRIPE_PRICE_STARTER',
    features: [
      'Weekly on-brand social posts',
      'Review responses + review generation',
      'Scheduling + performance dashboard',
      'Client portal',
    ],
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    priceMonthly: 599,
    blurb: 'Higher cadence and multi-location coverage.',
    priceEnvVar: 'STRIPE_PRICE_GROWTH',
    features: [
      'Everything in Starter',
      'Higher posting cadence',
      'Multi-location support',
      'Priority review turnaround',
    ],
  },
};

export const PLAN_KEYS = Object.keys(PLANS);
export const DEFAULT_PLAN_KEY = 'starter';

export function getPlan(key: string | null | undefined): Plan | null {
  if (!key) return null;
  return PLANS[key] ?? null;
}
