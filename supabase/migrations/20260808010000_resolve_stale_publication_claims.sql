-- A checkpoint claimed by an invocation that then died (function timeout, crash, or a
-- failed attempt to mark the row for reconciliation) stays in 'publishing' forever.
-- Nothing reaps those claims, and the previous resolve functions only accepted rows
-- already in 'reconcile', so the run could never publish or schedule again — an
-- unrecoverable wedge that only a manual SQL edit could clear.
--
-- Both resolve functions now also accept a 'publishing' row whose claim is older than
-- p_stale_minutes. The caller passes the threshold so the operator UI and the database
-- agree on what "abandoned" means (see STALE_PUBLISHING_MINUTES in
-- src/forge/data/publication-checkpoint-policy.ts).
--
-- This stays safe against a claim that is merely slow rather than dead: the in-flight
-- invocation can only finish through finalize_content_publication, which still requires
-- status = 'publishing' and raises once the operator has resolved the row. A late provider
-- success therefore surfaces as a run failure, never as a silent duplicate post.

drop function if exists public.resolve_content_publication_as_published(uuid, text);
drop function if exists public.resolve_content_publication_for_retry(uuid);

create or replace function public.resolve_content_publication_as_published(
  p_publication_id uuid,
  p_reference text,
  p_stale_minutes integer
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
  if p_stale_minutes is null or p_stale_minutes < 0 then
    raise exception 'stale threshold must be a non-negative number of minutes';
  end if;

  update public.content_publications
  set
    status = 'published',
    reference = p_reference,
    payload = payload || jsonb_build_object('reconciledBy', 'operator'),
    last_error = null,
    published_at = now(),
    updated_at = now()
  where id = p_publication_id
    and (
      status = 'reconcile'
      or (
        status = 'publishing'
        and coalesce(updated_at, claimed_at)
              <= now() - make_interval(mins => p_stale_minutes)
      )
    )
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
  p_publication_id uuid,
  p_stale_minutes integer
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
  v_status text;
begin
  if p_stale_minutes is null or p_stale_minutes < 0 then
    raise exception 'stale threshold must be a non-negative number of minutes';
  end if;

  delete from public.content_publications
  where id = p_publication_id
    and (
      status = 'reconcile'
      or (
        status = 'publishing'
        and coalesce(updated_at, claimed_at)
              <= now() - make_interval(mins => p_stale_minutes)
      )
    )
  returning run_id, post_index, platform, status
  into v_run_id, v_post_index, v_platform, v_status;

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
      'reconciledBy', 'operator',
      'resolvedFromStatus', v_status
    )
  );

  return true;
end;
$$;

revoke all on function public.resolve_content_publication_as_published(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.resolve_content_publication_for_retry(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.resolve_content_publication_as_published(uuid, text, integer)
  to service_role;
grant execute on function public.resolve_content_publication_for_retry(uuid, integer)
  to service_role;
