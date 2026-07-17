# Data model

Forge stores everything in Supabase (Postgres). The schema lives in
`supabase/migrations/` and applies on any Postgres with **no extensions
required**. The optional pgvector table is in `supabase/optional/`.

## Migrations

| File | Creates |
|---|---|
| `supabase/migrations/0001_init.sql` | `clients`, `brand_voices`, `tool_runs` |
| `supabase/migrations/0002_reviews.sql` | `reviews` (+ index) |
| `supabase/migrations/20260717011053_content_approvals.sql` | `content_approvals` (+ index, RLS, service-role grants) |
| `supabase/optional/client_memory.sql` | `client_memory` + pgvector (reserved for a later increment; apply by hand) |

Apply locally with `supabase db reset`; in a hosted project, run the SQL files in
the Supabase SQL editor in order.

## Tables

### `clients`

A business Forge runs marketing for.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `slug` | text | **unique**, not null — the handle you use in the CLI |
| `name` | text | not null |
| `industry` | text | nullable |
| `website` | text | nullable |
| `locations` | int | default 1 |
| `created_at` | timestamptz | default `now()` |

### `brand_voices`

How Forge writes for a client. One row per client (`unique(client_id)`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `client_id` | uuid | FK → `clients(id)`, `on delete cascade`, **unique** |
| `tone` | text[] | e.g. `{warm, community-first}` |
| `about` | text | what the business is / how it positions |
| `audience` | text | who it's talking to |
| `dos` | text[] | |
| `donts` | text[] | |
| `sample_posts` | text[] | few-shot examples of on-brand copy |
| `banned_phrases` | text[] | |
| `created_at` | timestamptz | default `now()` |

> Note the column casing: the DB uses `snake_case` (`sample_posts`,
> `banned_phrases`); Forge's `ClientContext` uses `camelCase` (`samplePosts`,
> `bannedPhrases`). The mapping happens in `src/forge/clients.ts`.

### `tool_runs`

Audit log of every tool the agent runs — cheap, and doubles as case-study data.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `client_id` | uuid | FK → `clients(id)`, `on delete set null` |
| `task` | text | the task string passed to `runForge` |
| `tool` | text | tool name |
| `input` | jsonb | tool input |
| `output` | jsonb | tool output |
| `created_at` | timestamptz | default `now()` |

### `reviews`

Queue for the review-sweep cron. New reviews land here with `status = 'new'` (fed
by an integration in a later increment; insert by hand to test now).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `client_id` | uuid | FK → `clients(id)`, `on delete cascade` |
| `author` | text | default `'Customer'` |
| `rating` | int | not null, `check (rating between 1 and 5)` |
| `text` | text | not null |
| `platform` | text | default `'google'` |
| `status` | text | not null, default `'new'` — `'new'` \| `'drafted'` \| `'posted'` |
| `draft_reply` | text | filled by the sweep |
| `needs_manager` | boolean | default `false` |
| `created_at` | timestamptz | default `now()` |

Index: `reviews_client_status_idx on reviews (client_id, status)`.

The review sweep selects `status = 'new'` rows, drafts replies, and sets
`status = 'drafted'` **only when a usable reply was generated** (otherwise the row
stays `new` for a later retry). See [Scheduled jobs](./scheduled-jobs.md).

### `content_approvals`

Human decision gate for generated content. Social-post runs create one pending row; the
single-operator dashboard can approve or reject it after current brand-policy checks pass.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `run_id` | uuid | unique FK → `tool_runs(id)`, `on delete cascade` |
| `client_id` | uuid | FK → `clients(id)`, `on delete cascade` |
| `status` | text | `pending` \| `approved` \| `rejected` |
| `notes` | text | optional operator decision notes |
| `requested_at` | timestamptz | default `now()` |
| `decided_at` | timestamptz | set when the operator decides |

RLS is enabled. Only `service_role` receives table privileges during the single-operator alpha;
there are no browser-facing policies.

### `client_memory` (optional — pgvector)

Reserved for a later increment (retrieval over past content + performance
memory). **Not** applied by the core migrations. Requires the pgvector extension.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `client_id` | uuid | FK → `clients(id)`, `on delete cascade` |
| `kind` | text | not null — `'post'` \| `'review'` \| `'report'` … |
| `content` | text | not null |
| `embedding` | vector(768) | 768 matches Google `text-embedding-004`; change to fit your model |
| `metadata` | jsonb | default `'{}'` |
| `created_at` | timestamptz | default `now()` |

Index: HNSW `client_memory_embedding_idx ... using hnsw (embedding vector_cosine_ops)`.

## Entity relationships

```
clients (1) ──< (1) brand_voices         # one brand voice per client
clients (1) ──< (N) tool_runs            # audit log
clients (1) ──< (N) reviews              # review queue
clients (1) ──< (N) content_approvals    # generated-content decision gate
clients (1) ──< (N) client_memory        # optional, reserved
```

## Row-Level Security

This alpha is single-operator: the service-role key in a CLI/server, no RLS
policies yet. Multi-tenant RLS lands when the cloud portal is built — see
[Deployment](./deployment.md).
