-- Reporting runs store durable report output evidence. The original authority
-- foundation constraint predated the reporting workflow and only allowed older
-- evidence kinds.

alter table public.forge_run_evidence
  drop constraint if exists forge_run_evidence_kind_check;

alter table public.forge_run_evidence
  add constraint forge_run_evidence_kind_check
  check (kind in (
    'output',
    'api_response',
    'published_url',
    'screenshot',
    'metric',
    'approval',
    'rollback',
    'error',
    'report'
  ));
