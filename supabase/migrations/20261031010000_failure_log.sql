-- Fleetlog: one row per recorded agent failure, per client. Forge logs what
-- agents did in tool_runs; this logs what went wrong — the task, what the agent
-- did vs should have done, who caught it, severity, and the root-cause class —
-- so repeats can be promoted into written rules by a human.
create table if not exists public.failure_log (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  task             text not null,
  did              text not null,
  should_have      text not null,
  caught_by        text not null,
  severity         text not null check (severity in ('P1', 'P2', 'P3')),
  root_cause_class text not null,
  fix_ref          text,
  rule_created     text,
  created_at       timestamptz not null default now()
);

create index if not exists failure_log_client_class_idx
  on public.failure_log (client_id, root_cause_class);

alter table public.failure_log enable row level security;
revoke all on table public.failure_log from anon, authenticated;
grant select, insert, update, delete on table public.failure_log to service_role;
