-- Forge — client_memory (pgvector retrieval over past content + performance memory).
-- RESERVED FOR INCREMENT 2. Not used by the alpha tools yet.
--
-- Deliberately kept OUT of supabase/migrations/ so the standard migration workflow
-- (`supabase db push` / `db reset`, which applies every tracked migration) does not pull
-- in pgvector — the core schema stays applicable on any Postgres. Apply this by hand only
-- when you wire up retrieval:
--   psql "$DATABASE_URL" -f supabase/optional/client_memory.sql
-- (or paste it into the Supabase SQL editor).
--
-- Requires the pgvector extension. Supabase ships it; on a self-hosted Postgres install the
-- OS package first (e.g. `apt-get install postgresql-16-pgvector`), then run this.

create extension if not exists vector;

create table if not exists client_memory (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  kind       text not null,            -- 'post' | 'review' | 'report' ...
  content    text not null,
  embedding  vector(768),              -- 768 matches Google text-embedding-004; change to fit your model
  metadata   jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists client_memory_embedding_idx
  on client_memory using hnsw (embedding vector_cosine_ops);
