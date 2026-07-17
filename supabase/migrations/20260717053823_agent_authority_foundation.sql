-- Phase 02.5: Agent Authority Layer foundation and single-operator RLS audit.
-- This extends the existing tool_runs audit table; it does not claim retry,
-- checkpoint, resume, publishing, or rollback executors that are not built yet.

create table if not exists public.forge_agents (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name       text not null,
  client_id  uuid references public.clients(id) on delete cascade,
  status     text not null default 'active'
             check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.forge_tools (
  name                 text primary key,
  required_permission  text not null default 'execute'
                       check (required_permission in ('read', 'execute', 'admin')),
  requires_approval    boolean not null default false,
  approval_action_type text,
  verification_gates   jsonb not null default '[]'::jsonb
                       check (jsonb_typeof(verification_gates) = 'array'),
  rollback_policy      jsonb,
  created_at           timestamptz not null default now(),
  check (not requires_approval or approval_action_type is not null)
);

create table if not exists public.forge_agent_tool_permissions (
  agent_id        uuid not null references public.forge_agents(id) on delete cascade,
  tool_name       text not null references public.forge_tools(name) on delete cascade,
  permission_level text not null check (permission_level in ('read', 'execute', 'admin')),
  allowed         boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (agent_id, tool_name)
);

insert into public.forge_agents (id, key, name, status)
values ('00000000-0000-4000-8000-000000000001', 'default', 'Default Forge Agent', 'active')
on conflict (key) do update set name = excluded.name;

insert into public.forge_tools (name, required_permission)
values
  ('create_social_posts', 'execute'),
  ('draft_review_responses', 'execute'),
  ('generate_report', 'execute'),
  ('research_keywords', 'execute'),
  ('analyze_competitors', 'execute')
on conflict (name) do nothing;

insert into public.forge_agent_tool_permissions (agent_id, tool_name, permission_level, allowed)
select agent.id, tool.name, 'execute', true
from public.forge_agents agent
cross join public.forge_tools tool
where agent.key = 'default'
  and tool.name in (
    'create_social_posts',
    'draft_review_responses',
    'generate_report',
    'research_keywords',
    'analyze_competitors'
  )
on conflict (agent_id, tool_name) do nothing;

alter table public.tool_runs
  add column if not exists agent_id uuid references public.forge_agents(id) on delete set null,
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists error text;

update public.tool_runs
set agent_id = coalesce(agent_id, '00000000-0000-4000-8000-000000000001'),
    status = coalesce(status, 'succeeded'),
    started_at = coalesce(started_at, created_at),
    completed_at = coalesce(completed_at, created_at);

alter table public.tool_runs
  alter column agent_id set default '00000000-0000-4000-8000-000000000001',
  alter column status set default 'pending',
  alter column status set not null;

alter table public.tool_runs
  drop constraint if exists tool_runs_status_check;
alter table public.tool_runs
  add constraint tool_runs_status_check
  check (status in ('pending', 'running', 'awaiting_approval', 'succeeded', 'failed', 'rolled_back'));

alter table public.tool_runs
  drop constraint if exists tool_runs_tool_fkey;
alter table public.tool_runs
  add constraint tool_runs_tool_fkey
  foreign key (tool) references public.forge_tools(name);

create index if not exists tool_runs_agent_status_idx
  on public.tool_runs (agent_id, status, created_at desc);

create table if not exists public.forge_run_evidence (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.tool_runs(id) on delete cascade,
  kind        text not null
              check (kind in ('output', 'api_response', 'published_url', 'screenshot', 'metric', 'approval', 'rollback', 'error')),
  description text not null check (length(trim(description)) > 0),
  reference   text,
  payload     jsonb,
  created_at  timestamptz not null default now(),
  check (kind not in ('published_url', 'screenshot') or nullif(trim(reference), '') is not null)
);

create index if not exists forge_run_evidence_run_idx
  on public.forge_run_evidence (run_id, created_at);

create table if not exists public.forge_run_audits (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.tool_runs(id) on delete cascade,
  status     text not null check (status in ('succeeded', 'needs_attention', 'failed')),
  summary    text not null check (length(trim(summary)) > 0),
  findings   jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists forge_run_audits_run_idx
  on public.forge_run_audits (run_id, created_at desc);

-- Every operator/runtime table is reachable only through the server-side service role.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients',
    'brand_voices',
    'tool_runs',
    'reviews',
    'content_approvals',
    'forge_agents',
    'forge_tools',
    'forge_agent_tool_permissions',
    'forge_run_evidence',
    'forge_run_audits'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;

-- Preserve the deliberate browser-facing contracts and make their grants explicit.
alter table public.leads enable row level security;
revoke all on table public.leads from anon, authenticated;
grant insert on table public.leads to anon;
grant select, insert, update, delete on table public.leads to service_role;

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Some hosted projects install this event-trigger helper in public. It never needs
-- to be callable through PostgREST, so remove inherited API execution privileges.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    execute 'grant execute on function public.rls_auto_enable() to service_role';
  end if;
end;
$$;

-- Secure defaults for future tables/functions created by this migration role.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
