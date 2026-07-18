-- One-time client onboarding links. Browser roles receive no table or function
-- privileges; all access is mediated by token-validating server routes.

alter table public.clients
  add column if not exists geographic_market text,
  add column if not exists primary_goal text,
  add column if not exists primary_cta text,
  add column if not exists timezone text,
  add column if not exists posting_frequency text,
  add column if not exists approval_mode text not null default 'review';

alter table public.clients
  drop constraint if exists clients_approval_mode_check;
alter table public.clients
  add constraint clients_approval_mode_check check (approval_mode = 'review');

create table public.onboarding_invitations (
  id             uuid primary key default gen_random_uuid(),
  token_hash     text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  business_name  text not null check (length(trim(business_name)) between 1 and 120),
  email          text,
  expires_at     timestamptz not null,
  completed_at   timestamptz,
  revoked_at     timestamptz,
  analysis_count integer not null default 0 check (analysis_count between 0 and 10),
  created_at     timestamptz not null default now(),
  check (expires_at > created_at)
);

create index onboarding_invitations_active_idx
  on public.onboarding_invitations (expires_at)
  where completed_at is null and revoked_at is null;

create table public.onboarding_submissions (
  id                uuid primary key default gen_random_uuid(),
  invitation_id     uuid not null unique references public.onboarding_invitations(id) on delete cascade,
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  name              text not null check (length(trim(name)) between 1 and 120),
  website           text not null check (length(trim(website)) between 1 and 500),
  industry          text not null check (length(trim(industry)) between 1 and 120),
  locations         integer not null check (locations between 1 and 10000),
  about             text not null check (length(trim(about)) between 1 and 4000),
  audience          text not null check (length(trim(audience)) between 1 and 1000),
  geographic_market text not null check (length(trim(geographic_market)) between 1 and 500),
  primary_goal      text not null check (length(trim(primary_goal)) between 1 and 500),
  primary_cta       text not null check (length(trim(primary_cta)) between 1 and 500),
  timezone          text not null check (length(trim(timezone)) between 1 and 100),
  posting_frequency text not null check (length(trim(posting_frequency)) between 1 and 200),
  approval_mode     text not null default 'review'
                    check (approval_mode = 'review'),
  tone              text[] not null check (cardinality(tone) between 1 and 8),
  services          text[] not null check (cardinality(services) between 1 and 30),
  banned_phrases    text[] not null default '{}',
  client_id         uuid references public.clients(id) on delete set null,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz
);

create index onboarding_submissions_status_idx
  on public.onboarding_submissions (status, submitted_at desc);

alter table public.onboarding_invitations enable row level security;
alter table public.onboarding_submissions enable row level security;

revoke all on table public.onboarding_invitations from anon, authenticated;
revoke all on table public.onboarding_submissions from anon, authenticated;
grant select, insert, update, delete on table public.onboarding_invitations to service_role;
grant select, insert, update, delete on table public.onboarding_submissions to service_role;

-- Atomically reserve one of the invitation's bounded analysis attempts.
create or replace function public.claim_onboarding_analysis(p_token_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  update public.onboarding_invitations
  set analysis_count = analysis_count + 1
  where token_hash = p_token_hash
    and expires_at > now()
    and completed_at is null
    and revoked_at is null
    and analysis_count < 10
  returning id into claimed_id;

  return claimed_id is not null;
end;
$$;

-- Validate and consume the token in the same transaction as the submission.
create or replace function public.submit_onboarding_invitation(
  p_token_hash text,
  p_submission jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.onboarding_invitations%rowtype;
  submission_id uuid;
begin
  select * into invitation
  from public.onboarding_invitations
  where token_hash = p_token_hash
  for update;

  if invitation.id is null
    or invitation.expires_at <= now()
    or invitation.completed_at is not null
    or invitation.revoked_at is not null then
    raise exception 'invalid or expired onboarding invitation';
  end if;

  insert into public.onboarding_submissions (
    invitation_id, name, website, industry, locations, about, audience,
    geographic_market, primary_goal, primary_cta, timezone,
    posting_frequency, approval_mode, tone, services, banned_phrases
  ) values (
    invitation.id,
    p_submission->>'name',
    p_submission->>'website',
    p_submission->>'industry',
    (p_submission->>'locations')::integer,
    p_submission->>'about',
    p_submission->>'audience',
    p_submission->>'geographic_market',
    p_submission->>'primary_goal',
    p_submission->>'primary_cta',
    p_submission->>'timezone',
    p_submission->>'posting_frequency',
    'review',
    array(select jsonb_array_elements_text(p_submission->'tone')),
    array(select jsonb_array_elements_text(p_submission->'services')),
    array(select jsonb_array_elements_text(coalesce(p_submission->'banned_phrases', '[]'::jsonb)))
  )
  returning id into submission_id;

  update public.onboarding_invitations
  set completed_at = now()
  where id = invitation.id;

  return submission_id;
end;
$$;

revoke execute on function public.claim_onboarding_analysis(text) from public, anon, authenticated;
revoke execute on function public.submit_onboarding_invitation(text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_onboarding_analysis(text) to service_role;
grant execute on function public.submit_onboarding_invitation(text, jsonb) to service_role;
