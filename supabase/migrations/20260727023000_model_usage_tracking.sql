alter table public.tool_runs
  add column if not exists model_usage jsonb;

alter table public.tool_runs
  drop constraint if exists tool_runs_model_usage_object_check;

alter table public.tool_runs
  add constraint tool_runs_model_usage_object_check
  check (model_usage is null or jsonb_typeof(model_usage) = 'object');
