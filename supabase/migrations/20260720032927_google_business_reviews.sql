-- Lane A: Google Business Profile review ingestion.
-- No new public tables are introduced here. The single-operator runtime keeps
-- using service-role access against the existing clients/reviews tables.

alter table public.clients
  add column if not exists google_business_account_id text,
  add column if not exists google_business_location_id text;

alter table public.reviews
  add column if not exists external_review_id text,
  add column if not exists external_review_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists reviewer_profile_photo_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists reviews_google_external_review_idx
  on public.reviews (client_id, platform, external_review_id)
  where external_review_id is not null;

create index if not exists reviews_client_reviewed_at_idx
  on public.reviews (client_id, reviewed_at desc);
