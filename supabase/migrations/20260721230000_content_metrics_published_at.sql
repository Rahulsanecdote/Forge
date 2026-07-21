-- Best-time-to-post insights: record when each measured post went live, so engagement
-- can be bucketed by weekday/hour. Populated by the metrics refresh from the post's
-- published_url evidence timestamp.

alter table public.content_metrics
  add column if not exists published_at timestamptz;
