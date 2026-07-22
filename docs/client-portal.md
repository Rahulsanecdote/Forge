# Client portal (read-only)

Forge is single-operator: all drafting, approval, scheduling, and publishing happen in
the operator dashboard. The **client portal** is a separate, **read-only** surface at
`/portal` where a client can see their own content pipeline and results — without any
ability to change the workflow.

## What a client sees

- **Overview stats** — items awaiting review, scheduled posts, measured posts, total reach.
- **Scheduled to publish** — upcoming scheduled posts, shown in the client's timezone.
- **Content pipeline** — each content run with its status (awaiting review / approved /
  rejected), platform, post count, and a caption preview.
- **Top posts by engagement** — the client's best-performing published posts.

There are no write actions: no approve/reject, no publish, no edits. Those stay with the
operator.

## Access model

The portal reuses Forge's custom-cookie auth (the same posture as the operator portal),
not Supabase Auth:

- Each client has a **signed login link**: `/portal/login?c=<clientId>&k=<key>`, where
  `k` is an HMAC of the client id over a server secret. The operator copies this link
  from the client's **Manage** page ("Client Portal" section) and shares it.
- Visiting the link verifies the key and sets a **client-scoped, HMAC-signed session
  cookie** (`forge_portal`, path `/portal`, 7 days). The key is stripped from the URL on
  redirect.
- Every data read is **filtered by the verified `client_id`** from that cookie
  (`src/lib/portal/data.ts`) — this is the sole tenant boundary. Reads go through the
  service role, exactly like the operator portal; nothing in the portal writes.

**Secret & revocation.** Links/sessions are signed with `FORGE_PORTAL_SECRET`, falling
back to `FORGE_ADMIN_PASSWORD` when unset (so it works with no extra config). The link is
a bearer credential — anyone with it gets that client's read-only view. Revocation is
currently coarse: **rotate `FORGE_PORTAL_SECRET`** (or the admin password) to invalidate
every outstanding link and session. Per-client revocation is a future increment.

## Files

| File | Role |
|---|---|
| `src/lib/portal/token.ts` | Pure HMAC helpers (login key + session token); unit-tested |
| `src/lib/portal/session.ts` | Server-only: secret resolution + cookie read/write |
| `src/lib/portal/data.ts` | Read-only, client-scoped data loader (service role) |
| `src/app/portal/login/route.ts` | Verifies the link key, sets the session cookie |
| `src/app/portal/page.tsx` | The read-only portal view (`noindex`) |
| `src/app/portal/actions.ts` | `portalLogout` |

## Roadmap

This is the read-only first slice. Client **write** actions (e.g. a client approving
their own drafts) would move to real per-client authentication (Supabase Auth) with
tenant-scoped Row-Level Security policies, replacing the service-role reads here. See
[Data model → Row-Level Security](./data-model.md#row-level-security).
