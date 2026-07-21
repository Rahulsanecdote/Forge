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
| `supabase/migrations/20260717053823_agent_authority_foundation.sql` | AAL agents, tool registry, permissions, run states, evidence, audits, and operator-table RLS |
| `supabase/migrations/20260717233127_client_onboarding_invitations.sql` | Review-only client fields, hashed onboarding invitations, pending submissions, and token RPCs |
| `supabase/migrations/20260721140000_content_assets.sql` | `content_assets` (+ index, RLS, public `content-images` bucket) |
| `supabase/migrations/20260721160000_content_schedules.sql` | `content_schedules` (+ due index, RLS, service-role grants) |
| `supabase/migrations/20260721180000_content_assets_carousel.sql` | `content_assets.asset_index` slot + widened uniqueness (multi-image carousels) |
| `supabase/migrations/20260721200000_content_metrics.sql` | `content_metrics` (post-publish reach/engagement; RLS, service-role grants) |
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
| `geographic_market` | text | confirmed service area or market |
| `primary_goal` | text | operator-reviewed automation objective |
| `primary_cta` | text | approved call to action |
| `timezone` | text | scheduling timezone |
| `posting_frequency` | text | requested content cadence |
| `approval_mode` | text | constrained to `review` in the current phase |
| `google_business_account_id` | text | optional per-client GBP account override |
| `google_business_location_id` | text | optional per-client GBP location override |
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
| `agent_id` | uuid | FK → `forge_agents(id)` |
| `status` | text | `pending` \| `running` \| `awaiting_approval` \| `succeeded` \| `failed` \| `rolled_back` |
| `started_at` | timestamptz | execution start |
| `completed_at` | timestamptz | terminal timestamp |
| `error` | text | bounded failure message |
| `created_at` | timestamptz | default `now()` |

### Agent Authority Layer

`forge_agents` identifies runtime principals. `forge_tools` is the database-backed tool
registry, including required permission and future gate/rollback metadata.
`forge_agent_tool_permissions` grants `read`, `execute`, or `admin` authority per agent/tool.
The runtime checks all three tables before tool execution and fails closed for unknown,
suspended, denied, under-scoped, or unregistered combinations.

`forge_run_evidence` stores typed durable evidence (`output`, `approval`, `error`, and future
external references). `forge_run_audits` records the post-execution result and structured
findings. The current phase records generation and approval evidence; it does not claim that
external publishing, retry/checkpoint, resume, or rollback executors exist.

### `reviews`

Queue for the review-sweep cron. New reviews land here with `status = 'new'`,
either through Google Business Profile ingestion or by hand for testing.

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
| `external_review_id` | text | source review id for dedupe |
| `external_review_name` | text | full source resource name, when provided |
| `reviewed_at` | timestamptz | when the customer review was created at the source |
| `updated_at` | timestamptz | when the source review was last updated |
| `reviewer_profile_photo_url` | text | source reviewer avatar, when provided |
| `metadata` | jsonb | source-specific non-secret metadata |
| `created_at` | timestamptz | default `now()` |

Indexes: `reviews_client_status_idx on reviews (client_id, status)`,
`reviews_client_reviewed_at_idx on reviews (client_id, reviewed_at desc)`, and
the partial unique index `reviews_google_external_review_idx` for external GBP
dedupe.

The review sweep selects `status = 'new'` rows, drafts replies, and sets
`status = 'drafted'` **only when a usable reply was generated** (otherwise the row
stays `new` for a later retry). An operator can then publish a drafted reply back
to Google, which sets `status = 'posted'` and records the published reference under
`metadata.published_reply` (`{ reference, comment, published_at }`). See
[Scheduled jobs](./scheduled-jobs.md).

### `content_approvals`

Human decision gate for generated content. Social-post runs create one pending row; the
single-operator dashboard can approve or reject it after current brand-policy checks pass.
The dashboard surfaces these rows as an operator queue. Approved rows expose a copyable
publishing package on the run detail page. Approved posts can be published to their
platform: `google_business` → Google Business local posts, `facebook` → a Facebook Page
feed, and `instagram` → the Instagram Graph API (which additionally requires at least one
generated image per post — a post with 2+ images publishes as a carousel; see
`content_assets`). Each published post is recorded as a `published_url`
row in `forge_run_evidence` (with the post URL as its `reference`), which also makes
publishing idempotent.

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

### `content_assets`

Generated post creatives (images). One row per `(run_id, post_index, asset_index, kind)`,
so a post can carry an **ordered set** of images — a single photo, or 2–10 for an
Instagram carousel. Images are produced from a post's `image_direction` via the
configured image provider (`FORGE_IMAGE_PROVIDER`, default Google Imagen 4), uploaded
to a **public** Supabase Storage bucket (`content-images`), and referenced by
`public_url` — which is what external channels (e.g. Instagram, which requires a
fetchable `image_url`) consume.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `run_id` | uuid | FK → `tool_runs(id)`, `on delete cascade` |
| `client_id` | uuid | FK → `clients(id)`, `on delete set null` |
| `post_index` | int | which post in the run |
| `asset_index` | int | image slot within the post (0-based; ordered for carousels) |
| `kind` | text | `image` |
| `provider` | text | `google` \| `openai` |
| `prompt` | text | the image prompt used |
| `storage_path` | text | path inside the bucket |
| `public_url` | text | fetchable image URL |
| `media_type` | text | e.g. `image/png` |
| `status` | text | `ready` \| `failed` |

RLS is enabled; only `service_role` has table privileges. The `content-images` Storage
bucket is public-read (objects fetchable by URL); writes go through the service role.

### `content_schedules`

Deferred publishing for an approved social-post run. One row per run (`unique(run_id)`):
an operator picks a future time from the run's publishing panel, and the
`scheduled-publish` cron claims due rows and publishes them through the same
fail-closed `publishApprovedRun` path as the immediate "Publish" button. See
[Scheduled jobs](./scheduled-jobs.md).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `run_id` | uuid | **unique** FK → `tool_runs(id)`, `on delete cascade` |
| `client_id` | uuid | FK → `clients(id)`, `on delete set null` |
| `scheduled_for` | timestamptz | not null — when to publish (stored UTC; entered in the client's timezone) |
| `status` | text | `pending` \| `publishing` \| `published` \| `failed` \| `canceled` |
| `attempts` | int | default 0 — incremented when the cron claims the row |
| `last_error` | text | publish outcome status when `failed` |
| `published_at` | timestamptz | set when publishing succeeds |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |

Index: `content_schedules_due_idx on (status, scheduled_for)` for the cron's due query.
The cron claims each row atomically (`pending → publishing`, guarded by status) so
overlapping runs never publish the same run twice. RLS is enabled; only `service_role`
has table privileges.

### `content_metrics`

Post-publish analytics: the latest reach/engagement snapshot for each published post,
so the run detail page can show performance without scanning evidence history. One row
per `(run_id, platform, external_id)`, upserted on each refresh. Metrics are pulled from
the Meta Graph API for `instagram` and `facebook` posts (Google Business has no per-post
metrics API). Each refresh also appends a durable `metric` row to `forge_run_evidence`.
Refreshed on demand from the dashboard and periodically by the `refresh-metrics` cron;
see [Scheduled jobs](./scheduled-jobs.md). The run detail page shows per-post numbers,
and the client page rolls these rows up into a client-level performance view (totals,
per-platform breakdown, and top posts by engagement). The scheduler also uses
`published_at` + engagement to suggest the client's best weekday/hour slots to post,
computed in the client's timezone.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `run_id` | uuid | FK → `tool_runs(id)`, `on delete cascade` |
| `client_id` | uuid | FK → `clients(id)`, `on delete set null` |
| `platform` | text | `instagram` \| `facebook` |
| `external_id` | text | platform post/media id |
| `post_index` | int | which post in the run this metric belongs to |
| `caption` | text | the generated caption, captured for performance memory |
| `published_at` | timestamptz | when the post went live (for best-time-to-post insights) |
| `permalink` | text | link to the live post, when known |
| `likes` / `comments` / `shares` / `saved` | int | engagement counts (null when unavailable) |
| `reach` / `impressions` / `video_views` / `interactions` | int | delivery + interaction totals (null when unavailable) |
| `raw` | jsonb | full provider payload for auditing |
| `fetched_at` | timestamptz | when this snapshot was pulled |
| `created_at` | timestamptz | default `now()` |

RLS is enabled; only `service_role` has table privileges.

**Performance memory.** Because each metric row carries the `caption` that earned it,
the generator can learn from what worked: `create_social_posts` calls
`loadTopPerformingPosts(clientId)`, which ranks a client's past posts by an engagement
score (`interactions`, or a weighted sum of likes/comments/shares/saves) and injects
the best few into the generation prompt as "what resonated" guidance — write fresh
copy, never reuse wording, stay within the factual ceiling. It's best-effort: with no
metrics yet, generation is unchanged. (Semantic retrieval over post history via the
optional `client_memory` pgvector table remains a future enhancement.)

### Client onboarding invitations

`onboarding_invitations` stores only a SHA-256 token hash, invitation metadata, expiry,
revocation/completion state, and a bounded website-analysis count. The one-time plaintext token
is returned to the authenticated operator only when the invitation is created.

`onboarding_submissions` stores the client-confirmed factual and operational brief with a
`pending`, `approved`, or `rejected` review state. Submission consumes the invitation in the
same database transaction. Approval creates the client and brand voice; it never grants the
client dashboard access and never enables automatic publishing.

Both tables have RLS enabled and explicit `anon` and `authenticated` privilege revocation.
Token validation is performed by server routes calling service-role-only, security-invoker
functions; the browser never receives database credentials or direct table access.

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
tool_runs (1) ──< (N) content_assets     # generated post creatives (images)
tool_runs (1) ──< (1) content_schedules  # deferred publish schedule (one per run)
tool_runs (1) ──< (N) content_metrics    # post-publish reach/engagement snapshots
onboarding_invitations (1) ──< (1) onboarding_submissions
onboarding_submissions (0..1) ──> (1) clients  # after operator approval
forge_agents (1) ──< (N) forge_agent_tool_permissions >── (1) forge_tools
forge_agents (1) ──< (N) tool_runs
tool_runs (1) ──< (N) forge_run_evidence
tool_runs (1) ──< (N) forge_run_audits
clients (1) ──< (N) client_memory        # optional, reserved
```

## Row-Level Security

The alpha remains single-operator. All operator/runtime tables have RLS enabled, no policies
for `anon` or `authenticated`, explicit privilege revocation for both roles, and server-only
`service_role` grants. `leads` deliberately permits anon insert only. `profiles` permits an
authenticated user to select and update only their own row. Tenant-scoped client policies
remain deferred until client authentication replaces the single-operator portal.
