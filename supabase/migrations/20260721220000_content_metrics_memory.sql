-- Performance memory: tie each engagement snapshot back to the copy that earned it,
-- so the generator can learn from a client's best-performing past posts. The metrics
-- refresh pairs published posts (in publish order) with the run's generated captions.

alter table public.content_metrics
  add column if not exists post_index int,
  add column if not exists caption text;
