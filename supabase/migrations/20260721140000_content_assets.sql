-- Generated post creatives (images) for social publishing.
-- One asset per (run, post_index); stored in a public Storage bucket so channels
-- like Instagram can fetch the image_url. Operator-facing tables stay service-role only.

create table if not exists public.content_assets (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.tool_runs(id) on delete cascade,
  client_id    uuid references public.clients(id) on delete set null,
  post_index   int not null,
  kind         text not null default 'image' check (kind in ('image')),
  provider     text,
  prompt       text,
  storage_path text,
  public_url   text not null,
  media_type   text,
  status       text not null default 'ready' check (status in ('ready', 'failed')),
  created_at   timestamptz not null default now(),
  unique (run_id, post_index, kind)
);

create index if not exists content_assets_run_idx on public.content_assets (run_id, post_index);

alter table public.content_assets enable row level security;
revoke all on table public.content_assets from anon, authenticated;
grant select, insert, update, delete on table public.content_assets to service_role;

-- Public bucket: objects are world-readable via their public URL (required so external
-- channels can fetch the image). Writes go through the server-side service role only.
insert into storage.buckets (id, name, public)
values ('content-images', 'content-images', true)
on conflict (id) do nothing;
