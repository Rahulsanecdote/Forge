-- Post-publish analytics: reach / engagement for published posts.
-- One row per published post (run_id + platform + external post id), holding the
-- latest metrics snapshot so the dashboard can show current numbers without scanning
-- evidence history. Each refresh also appends a durable `metric` row to
-- forge_run_evidence (see analytics.ts). Only Meta channels (Instagram, Facebook)
-- expose per-post engagement; Google Business has no per-post metrics API.

create table if not exists public.content_metrics (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.tool_runs(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  platform      text not null check (platform in ('instagram', 'facebook')),
  external_id   text not null,
  permalink     text,
  likes         int,
  comments      int,
  shares        int,
  saved         int,
  reach         int,
  impressions   int,
  video_views   int,
  interactions  int,
  raw           jsonb,
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (run_id, platform, external_id)
);

create index if not exists content_metrics_run_idx on public.content_metrics (run_id);

alter table public.content_metrics enable row level security;
revoke all on table public.content_metrics from anon, authenticated;
grant select, insert, update, delete on table public.content_metrics to service_role;
