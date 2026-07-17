-- Human approval gate for generated content in the single-operator portal.
create table if not exists public.content_approvals (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null unique references public.tool_runs(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  notes        text,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz
);

create index if not exists content_approvals_client_status_idx
  on public.content_approvals (client_id, status, requested_at desc);

alter table public.content_approvals enable row level security;

-- The alpha portal only accesses this table through a server-side service-role client.
revoke all on table public.content_approvals from anon, authenticated;
grant select, insert, update, delete on table public.content_approvals to service_role;
