-- Review generation: proactively ask happy customers for a Google review.
-- Each request is a click-tracked short link (/r/<token>) that redirects to the
-- business's public Google review URL and records the click, so an operator can
-- measure the request -> click funnel and drive more reviews. The token is an
-- opaque tracking id (the destination is a public URL, nothing secret), so it's
-- stored in plaintext and the link can be re-displayed.

alter table public.clients
  add column if not exists google_review_url text;

create table if not exists public.review_requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  customer_name text,
  token         text not null unique,
  target_url    text not null,
  status        text not null default 'created' check (status in ('created', 'clicked')),
  created_at    timestamptz not null default now(),
  clicked_at    timestamptz
);

create index if not exists review_requests_client_idx
  on public.review_requests (client_id, created_at desc);

alter table public.review_requests enable row level security;
revoke all on table public.review_requests from anon, authenticated;
grant select, insert, update, delete on table public.review_requests to service_role;
