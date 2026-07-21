-- Scheduled publishing for approved social-post runs.
-- One schedule per run (unique run_id): an operator picks a future time, and the
-- `scheduled-publish` Inngest cron claims due rows and publishes them through the
-- same fail-closed publish path as the immediate "Publish" button. Operator-facing
-- table stays service-role only.

create table if not exists public.content_schedules (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.tool_runs(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  scheduled_for timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'publishing', 'published', 'failed', 'canceled')),
  attempts      int not null default 0,
  last_error    text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (run_id)
);

-- The cron loads due work with (status = 'pending' and scheduled_for <= now()).
create index if not exists content_schedules_due_idx
  on public.content_schedules (status, scheduled_for);

alter table public.content_schedules enable row level security;
revoke all on table public.content_schedules from anon, authenticated;
grant select, insert, update, delete on table public.content_schedules to service_role;
