-- Forge alpha — initial schema
-- Run in the Supabase SQL editor, or via the Supabase CLI.

create extension if not exists vector;

-- A client Forge runs marketing for (your own businesses first).
create table if not exists clients (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  industry   text,
  website    text,
  locations  int default 1,
  created_at timestamptz default now()
);

-- The voice Forge writes in for a given client. Loaded directly (no embeddings needed yet).
create table if not exists brand_voices (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  tone           text[] default '{}',   -- e.g. {warm, community-first}
  about          text,                  -- what the business is / how it positions
  audience       text,                  -- who it's talking to
  dos            text[] default '{}',
  donts          text[] default '{}',
  sample_posts   text[] default '{}',   -- few-shot examples of on-brand copy
  banned_phrases text[] default '{}',
  created_at     timestamptz default now(),
  unique (client_id)
);

-- Audit log of every tool the agent runs. Cheap, and it doubles as your case-study data.
create table if not exists tool_runs (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients(id) on delete set null,
  task       text,
  tool       text,
  input      jsonb,
  output     jsonb,
  created_at timestamptz default now()
);

-- RESERVED FOR INCREMENT 2: retrieval over past content + performance memory.
-- Not used by the two alpha tools yet. Dimension 768 matches Google text-embedding-004;
-- change it to match whichever embedding model you wire up.
create table if not exists client_memory (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  kind       text not null,            -- 'post' | 'review' | 'report' ...
  content    text not null,
  embedding  vector(768),
  metadata   jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists client_memory_embedding_idx
  on client_memory using hnsw (embedding vector_cosine_ops);

-- NOTE ON RLS: this alpha is single-operator (you, via the service-role key in a CLI).
-- Row-Level Security policies land in increment 3 when the multi-tenant cloud portal is built
-- and clients/teammates get their own authenticated access.
