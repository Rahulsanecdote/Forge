-- Forge — reviews queue for the review-sweep cron.
-- New reviews land here with status 'new' (fed by a Google Business Profile or other
-- integration in increment 2). The review-sweep job drafts replies and marks them 'drafted'.

create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  author        text default 'Customer',
  rating        int not null check (rating between 1 and 5),
  text          text not null,
  platform      text default 'google',
  status        text not null default 'new',   -- 'new' | 'drafted' | 'posted'
  draft_reply   text,
  needs_manager boolean default false,
  created_at    timestamptz default now()
);

create index if not exists reviews_client_status_idx on reviews (client_id, status);
