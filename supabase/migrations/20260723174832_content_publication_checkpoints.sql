-- One durable checkpoint per generated post. The runtime claims a checkpoint
-- before calling an external platform so retries can never blindly duplicate a
-- post after a process crash or ambiguous provider response.
create table if not exists public.content_publications (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.tool_runs(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  post_index    integer not null check (post_index >= 0),
  platform      text not null
                check (platform in ('google_business', 'facebook', 'instagram')),
  status        text not null default 'publishing'
                check (status in ('publishing', 'published', 'reconcile')),
  attempts      integer not null default 1 check (attempts >= 1),
  reference     text,
  payload       jsonb not null default '{}'::jsonb,
  last_error    text,
  claimed_at    timestamptz not null default now(),
  published_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique (run_id, post_index),
  check (
    status <> 'published'
    or (
      nullif(trim(reference), '') is not null
      and published_at is not null
    )
  ),
  check (
    status <> 'reconcile'
    or nullif(trim(last_error), '') is not null
  )
);

create index if not exists content_publications_client_status_idx
  on public.content_publications (client_id, status, updated_at desc);

alter table public.content_publications enable row level security;
revoke all on table public.content_publications from anon, authenticated;
grant select, insert, update, delete on table public.content_publications to service_role;

create or replace function public.claim_content_publication(
  p_run_id uuid,
  p_client_id uuid,
  p_post_index integer,
  p_platform text
)
returns table (
  publication_id uuid,
  publication_status text,
  publication_claimed boolean,
  publication_reference text
)
language sql
security invoker
set search_path = ''
as $$
  with inserted as (
    insert into public.content_publications (
      run_id,
      client_id,
      post_index,
      platform
    )
    select
      p_run_id,
      p_client_id,
      p_post_index,
      p_platform
    from public.tool_runs as run
    where run.id = p_run_id
      and run.client_id = p_client_id
    on conflict (run_id, post_index) do nothing
    returning id, status, reference
  )
  select
    inserted.id,
    inserted.status,
    true,
    inserted.reference
  from inserted

  union all

  select
    publication.id,
    publication.status,
    false,
    publication.reference
  from public.content_publications as publication
  where publication.run_id = p_run_id
    and publication.post_index = p_post_index
    and not exists (select 1 from inserted)
  limit 1;
$$;

create or replace function public.finalize_content_publication(
  p_publication_id uuid,
  p_reference text,
  p_payload jsonb,
  p_description text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  update public.content_publications
  set
    status = 'published',
    reference = p_reference,
    payload = p_payload,
    last_error = null,
    published_at = now(),
    updated_at = now()
  where id = p_publication_id
    and status = 'publishing'
  returning run_id into v_run_id;

  if v_run_id is null then
    raise exception 'publication checkpoint is not claimable';
  end if;

  insert into public.forge_run_evidence (
    run_id,
    kind,
    description,
    reference,
    payload
  )
  values (
    v_run_id,
    'published_url',
    p_description,
    p_reference,
    p_payload
  );
end;
$$;

create or replace function public.mark_content_publication_for_reconciliation(
  p_publication_id uuid,
  p_error text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.content_publications
    set
      status = 'reconcile',
      last_error = left(p_error, 600),
      updated_at = now()
    where id = p_publication_id
      and status = 'publishing'
    returning id
  )
  select exists(select 1 from updated);
$$;

create or replace function public.release_content_publication_claim(
  p_publication_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with deleted as (
    delete from public.content_publications
    where id = p_publication_id
      and status = 'publishing'
    returning id
  )
  select exists(select 1 from deleted);
$$;

create or replace function public.resolve_content_publication_as_published(
  p_publication_id uuid,
  p_reference text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_post_index integer;
  v_platform text;
  v_payload jsonb;
begin
  update public.content_publications
  set
    status = 'published',
    reference = p_reference,
    payload = payload || jsonb_build_object('reconciledBy', 'operator'),
    last_error = null,
    published_at = now(),
    updated_at = now()
  where id = p_publication_id
    and status = 'reconcile'
    and nullif(trim(p_reference), '') is not null
  returning run_id, post_index, platform, payload
  into v_run_id, v_post_index, v_platform, v_payload;

  if v_run_id is null then
    raise exception 'publication checkpoint is not reconcilable';
  end if;

  insert into public.forge_run_evidence (
    run_id,
    kind,
    description,
    reference,
    payload
  )
  values (
    v_run_id,
    'published_url',
    'External publication confirmed by an operator during reconciliation.',
    p_reference,
    v_payload || jsonb_build_object(
      'postIndex', v_post_index,
      'platform', v_platform,
      'checkpointId', p_publication_id
    )
  );
end;
$$;

create or replace function public.resolve_content_publication_for_retry(
  p_publication_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_post_index integer;
  v_platform text;
begin
  delete from public.content_publications
  where id = p_publication_id
    and status = 'reconcile'
  returning run_id, post_index, platform
  into v_run_id, v_post_index, v_platform;

  if v_run_id is null then
    return false;
  end if;

  insert into public.forge_run_evidence (
    run_id,
    kind,
    description,
    payload
  )
  values (
    v_run_id,
    'rollback',
    'External publication confirmed absent by an operator; checkpoint re-armed.',
    jsonb_build_object(
      'postIndex', v_post_index,
      'platform', v_platform,
      'checkpointId', p_publication_id,
      'reconciledBy', 'operator'
    )
  );

  return true;
end;
$$;

revoke all on function public.claim_content_publication(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.finalize_content_publication(uuid, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.mark_content_publication_for_reconciliation(uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_content_publication_claim(uuid)
  from public, anon, authenticated;
revoke all on function public.resolve_content_publication_as_published(uuid, text)
  from public, anon, authenticated;
revoke all on function public.resolve_content_publication_for_retry(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_content_publication(uuid, uuid, integer, text)
  to service_role;
grant execute on function public.finalize_content_publication(uuid, text, jsonb, text)
  to service_role;
grant execute on function public.mark_content_publication_for_reconciliation(uuid, text)
  to service_role;
grant execute on function public.release_content_publication_claim(uuid)
  to service_role;
grant execute on function public.resolve_content_publication_as_published(uuid, text)
  to service_role;
grant execute on function public.resolve_content_publication_for_retry(uuid)
  to service_role;
