-- Billing & plan enforcement. Each client carries a subscription state so Forge can
-- stop doing automated work for non-paying clients (hard block: crons skip them and the
-- publish path fails closed) while still letting an operator generate drafts to catch up.
-- Stripe is the source of truth when configured (synced via webhook); `billing_override`
-- lets an operator comp a client (pilots/free accounts) regardless of Stripe state.

alter table public.clients
  add column if not exists plan text,
  add column if not exists subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  add column if not exists billing_override boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz;

-- Webhook lookups resolve a client by its Stripe ids.
create index if not exists clients_stripe_customer_idx
  on public.clients (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists clients_stripe_subscription_idx
  on public.clients (stripe_subscription_id) where stripe_subscription_id is not null;
