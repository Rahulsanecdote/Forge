-- Forge — client_memory (pgvector retrieval over past content + performance memory).
-- RESERVED FOR INCREMENT 2. Not used by the alpha tools yet, so this migration is
-- optional for now — apply it only when you wire up retrieval.
--
-- Requires the pgvector extension. Supabase ships it; on a self-hosted Postgres install
-- the OS package first (e.g. `apt-get install postgresql-16-pgvector`), then run this.

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
