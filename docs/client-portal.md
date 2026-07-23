# Client portal

Forge is single-operator: drafting, scheduling, and publishing happen in the operator
dashboard. The **client portal** at `/portal` is a separate surface where a client can
**review and approve their own content** and track results. Approval is the one write
action clients have; scheduling and publishing stay with the operator.

## What a client sees

- **Overview stats** — items awaiting review, scheduled posts, measured posts, total reach.
- **Awaiting your approval** — each pending draft in full (every post's caption, hashtags,
  and images) with **Approve** / **Reject** buttons.
- **History** — decided runs (approved / rejected), compact.
- **Scheduled to publish** — upcoming scheduled posts, shown in the client's timezone.
- **Top posts by engagement** — the client's best-performing published posts.

## Self-approval

A client can approve or reject any of their **own pending** drafts:

- The decision runs through `decideClientApproval` (`src/lib/portal/approvals.ts`), which
  scopes every query to the verified `client_id` from the session cookie — a client can
  only ever decide their own content.
- Approving still enforces the client's **banned phrases** (the same gate as the operator
  path); a violating draft is blocked, not approved.
- The `content_approvals` update is **status-guarded** (`pending → approved/rejected`) so a
  client and operator can't double-decide, and a durable `approval` evidence row records
  that the client decided via the portal (rolled back if the evidence write fails).
- Publishing is unchanged: an approved run is scheduled/published by the operator (or the
  scheduled-publish cron), still subject to the billing gate.

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

**Secret & revocation.** Links/sessions are signed with a **per-client secret** derived
from the global secret + client id + the client's `portal_key_version`
(`portalClientSecret`, in `src/lib/portal/token.ts`). The global secret is
`FORGE_PORTAL_SECRET`, falling back to `FORGE_ADMIN_PASSWORD` when unset (so it works with
no extra config). The link is a bearer credential — anyone with it can act as that client
(including approving their drafts) — so there are two levels of revocation:

- **Per-client (targeted):** the client page's **Revoke & rotate** button bumps that
  client's `portal_key_version`. Every query in `session.ts` derives the signing secret
  from the *current* version, so all of that client's outstanding links and sessions stop
  verifying immediately and the page shows a fresh link to re-share. **Other clients are
  unaffected.** (`getPortalClientId` parses the client id from the cookie, loads that
  client's version, then verifies against the version-derived secret.)
- **Global (kill switch):** rotating `FORGE_PORTAL_SECRET` (or the admin password)
  invalidates **every** client's links and sessions at once.

Pre-migration (before `portal_key_version` exists) the version defaults to 1 and the portal
keeps working; per-client revoke needs the migration applied.

## Files

| File | Role |
|---|---|
| `src/lib/portal/token.ts` | Pure HMAC helpers (login key + session token + per-client derived secret); unit-tested |
| `src/lib/portal/session.ts` | Server-only: per-client secret derivation (reads `portal_key_version`) + cookie read/write |
| `src/lib/portal/data.ts` | Client-scoped data loader (service role), incl. pending drafts + images |
| `src/lib/portal/approvals.ts` | Client-scoped approve/reject write (banned-phrase gate, evidence) |
| `src/app/portal/login/route.ts` | Verifies the link key, sets the session cookie |
| `src/app/portal/page.tsx` | The portal view (`noindex`) with self-approval UI |
| `src/app/portal/actions.ts` | `portalLogout`, `decidePortalContent` |

## Roadmap

Client self-approval is scoped by the verified session `client_id` over service-role
reads/writes — the sole tenant boundary. A later increment would move this to real
per-client authentication (Supabase Auth) with tenant-scoped Row-Level Security policies,
replacing the service-role access here. See
[Data model → Row-Level Security](./data-model.md#row-level-security).
