-- Phase 00 foundation: leads (waitlist capture) + profiles (auth mirror).
-- Launch board blocker: supabase-foundation-migration.

-- ── leads ────────────────────────────────────────────────────────────
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  source      text not null default 'website',
  referrer    text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table leads enable row level security;

-- Anon visitors may insert (waitlist form); nobody but service role reads.
create policy "anon can insert leads"
  on leads for insert
  to anon
  with check (true);

-- ── profiles ─────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'member',
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users can read own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "users can update own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- Auto-create a profile row on signup.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
