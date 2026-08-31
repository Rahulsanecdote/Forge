# Security model

Read this before pointing Forge at a real client's Google Business Profile, Meta account,
or customer list.

Forge is a **single-operator** system. That one sentence explains most of the design: one
trusted person runs it, many businesses are managed *through* it, and the businesses are
not users of the same system in any meaningful sense. Where that assumption holds, the
model below is sound. Where it does not — a shared instance, several staff, a client you
would not hand the database to — it stops being sound, and the last section says so
plainly.

## Trust boundaries

| Who | Trust | Reaches |
|---|---|---|
| **Operator** | Fully trusted | Everything. The dashboard has no privilege levels. |
| **Client (portal)** | Semi-trusted | Read their own reports and drafts; approve or reject their own content. Nothing else, and nothing belonging to another client. |
| **Anonymous internet** | Untrusted | The marketing site, the lead form, review-link redirects, unsubscribe links, `/source`. |
| **Providers** (Stripe, Twilio, Meta, Google) | Authenticated by signature | Stripe and Twilio webhooks mutate state and are verified cryptographically. |
| **The model** (Anthropic/OpenAI/Google/local) | Untrusted output | Anything it produces passes an approval gate and a banned-phrase check before it can reach the public. |

## The tenant boundary is application code, not the database

This is the single most important thing to understand, and the thing most likely to
surprise someone who assumes "Supabase, therefore RLS".

Forge's server uses the **service-role key**, which bypasses row-level security entirely.
RLS is configured deny-by-default — the migrations revoke `anon` and `authenticated` on
every table and grant to `service_role` — but that configuration is a *backstop against a
leaked anon key*, not the mechanism that keeps clients apart.

Two exceptions to "revoked", both deliberate and both narrow:

- `leads` grants `INSERT` to `anon`, so the marketing contact form can write without a
  server round-trip. No `SELECT`.
- `profiles` grants `SELECT` and `UPDATE` to `authenticated`, restricted by RLS policies to
  the row where `auth.uid() = id`. This is scaffolding from Supabase Auth, which Forge's own
  operator and portal logins do not use; it is the only place the `authenticated` role
  reaches anything.

Note what the migrations do **not** do: they do not install an event trigger that enables
RLS on future tables. Some hosted Supabase projects ship an `rls_auto_enable()` helper, and
the migrations harden its privileges *if it already exists* — but a self-hosted deployment
has no such automation, so **RLS is not switched on for you.**

A new table is not thereby exposed, though. `alter default privileges in schema public
revoke all on tables from anon, authenticated` means a table created by the migration role
grants those API roles nothing from the moment it exists, RLS or no RLS. That is the
grant layer doing the work, and it is the reason a forgotten `enable row level security`
is a latent problem rather than an immediate leak.

Two things still make explicit RLS and revocations the required convention: default
privileges apply only to objects created by *that* role, so a table added through the
Supabase dashboard or by a different migration user inherits nothing from them; and the
grant layer alone gives you no row-level policy if you ever do grant a role access. Follow
the existing migrations — `enable row level security`, `revoke all … from anon,
authenticated`, `grant … to service_role`.

What actually keeps client A from seeing client B is that every portal query is scoped by
the `client_id` taken from a verified session cookie. It is enforced in TypeScript, in one
place per action, on purpose. **A missing `.eq('client_id', …)` in a portal query is a
tenant-isolation bug, not a style issue** — treat any change to `src/lib/portal/` or
`src/app/portal/` accordingly.

## Authentication

### Operator

A single shared password (`FORGE_ADMIN_PASSWORD`). The session cookie is
`HMAC-SHA256(password, "forge-admin-session")`, compared with `timingSafeEqual`, and set
`httpOnly`, `sameSite=lax`, `secure` in production, scoped to `path=/dashboard` so it is
never sent to the portal or the public API routes.

Two consequences worth stating outright, because neither is obvious from the code:

- **The token is deterministic and carries no expiry.** It is a pure function of the
  password. The cookie's 8-hour `maxAge` is a browser-side hint, not server-side
  invalidation. A stolen cookie stays valid until `FORGE_ADMIN_PASSWORD` changes —
  **rotating the password is the only logout that means anything.**
- **There is no rate limiting on the login form.** Password strength is the entire defence.
  Use a long random one.

### Client portal

Clients never get a password. An operator copies a signed link containing a login key; the
key mints a session cookie (`forge_portal`, 7 days).

Both are signed with a **per-client derived secret**:
`HMAC(FORGE_PORTAL_SECRET, client_id + portal_key_version)`. That derivation is what makes
revocation surgical:

- **Revoke one client** — the operator's "Revoke & rotate" bumps that client's
  `portal_key_version`, invalidating only their links and sessions.
- **Revoke everyone** — rotate `FORGE_PORTAL_SECRET`. This is the kill switch.

`FORGE_PORTAL_SECRET` falls back to `FORGE_ADMIN_PASSWORD` when unset, so the portal works
out of the box. Set it separately in production: sharing the secret means rotating the
operator password also logs out every client, and vice versa.

Like the operator token, the portal token is deterministic and carries no embedded expiry —
the cookie lifetime is a hint, and a version bump or secret rotation is the real
revocation.

## Webhooks

Both inbound webhooks verify cryptographically and fail closed, and both are disabled
entirely when their secret is unset — an unconfigured webhook rejects rather than accepts.

- **Stripe** (`/api/stripe/webhook`) — signature and timestamp tolerance, compared with
  `timingSafeEqual`.
- **Twilio** (`/api/twilio/inbound`) — HMAC-SHA1 over the request URL plus sorted POST
  parameters, Twilio's scheme, same constant-time comparison. This endpoint carries STOP
  opt-outs, so forging it would let someone suppress a competitor's review requests. It
  could not un-suppress anyone: the handler only ever records an opt-out, and the
  suppression list has no delete or re-enable path.

## Outbound requests (SSRF)

Forge fetches URLs an operator supplies — the monitoring alert webhook, and the website
analysed during onboarding. Both go through `src/lib/net/private-address.ts`, which
resolves the hostname and rejects loopback, private, link-local, CGNAT, multicast, and the
IPv6 equivalents, **failing closed on a DNS error**. Requests use `redirect: 'manual'` (a
3xx is treated as a configuration error rather than followed) and a 10-second timeout.

**Known gap: DNS rebinding.** The address is checked at resolution time and the connection
is made afterwards, so a hostname that answers with a public address and then a private one
can slip between the two. Closing it properly needs a custom `undici` dispatcher that pins
the validated address for the connection. Not yet done, and listed below rather than
quietly omitted.

## Secrets

The Supabase service-role key and every provider key are server-only and never reach a
browser bundle. `src/env.ts` validates the environment at startup. Only `NEXT_PUBLIC_*`
variables are exposed to the client. The anon key is safe to publish because RLS leaves it
almost nothing: `INSERT` into `leads` and nothing else — no read access to any table.

`/source` (the AGPL §13 endpoint) rejects a `FORGE_SOURCE_URL` containing credentials and
never echoes the configured value into its response or its logs — a source link is public
by definition, so a clone URL with a token in it must not be accepted.

## Acting on the world

Every path that publishes, sends, or charges is gated, and the gates are shared between the
manual and the automated route so the cron cannot do something the dashboard would refuse:

- **Approval** — generated content cannot be published until a human approves it, whether
  through the operator dashboard or the client portal.
- **Banned phrases** — re-checked at approval *and* again at publish, so editing a client's
  banned list after approval still catches the draft.
- **Billing** — non-paying clients are hard-blocked from automated delivery.
- **Opt-outs** — a suppression list is consulted before every review request; email carries
  `List-Unsubscribe`, SMS carries "Reply STOP".
- **Idempotent publishing, for social posts** — publishing an approved run to Google
  Business, Facebook, or Instagram claims a durable checkpoint before each external call, so
  a crash mid-publish cannot silently double-post. An ambiguous outcome goes to an operator
  reconciliation queue instead of being retried blindly. **This covers `publishApprovedRun`
  only.** Publishing a drafted review reply takes a different path that writes to Google and
  then records the result, with no checkpoint and no reconciliation queue — a crash between
  those two steps leaves a reply posted that Forge has no record of. The Google call is
  itself idempotent (a `PUT` to the review's one `/reply` resource), so this costs you an
  accurate local record rather than a duplicate reply. Do not assume reconciliation coverage
  there.

## Known limitations

These are trade-offs, not undiscovered bugs. If any is unacceptable for your deployment,
Forge is the wrong tool for it today.

1. **One shared operator password.** No accounts, no MFA, no login rate limiting, and no
   record of *which* human took an action — `tool_runs` attributes to the agent, not a
   person. Fine for a solo operator; not fine for a team, and not fine for anything with a
   compliance requirement to attribute actions to individuals.
2. **Sessions cannot be individually revoked.** Both tokens are deterministic, so
   invalidation means rotating a secret, which logs out everyone in that class.
3. **Service-role blast radius.** Any server-side code injection reaches every client's
   data, because the database grants the server everything. There is no second layer under
   the application-level tenant check.
4. **DNS rebinding** against outbound fetches, as described above.
5. **The portal trusts the operator's link distribution.** Anyone holding a portal link is
   that client until it is revoked. Links go by whatever channel the operator chooses, and
   Forge cannot police that channel.
6. **No tagged releases or signed artefacts.** Self-hosters track `main` and are trusting
   the repository directly.
7. **Review-reply publishing is not checkpointed.** Social-post publishing claims a
   checkpoint and reconciles ambiguous outcomes; publishing a review reply does not, so a
   failure between the Google call and the database write leaves a reply live that Forge has
   no record of. This is a visibility problem rather than a duplication one: the reply is a
   `PUT` to the review's single `/reply` resource, so retrying replaces that one reply
   instead of adding another. What it costs you is an accurate local picture — the dashboard
   can show a failure, or nothing, while a reply is in fact published under the client's
   name.

## If you are deploying Forge

The short version:

- Use a long random `FORGE_ADMIN_PASSWORD`; it is the only thing between the internet and
  every client you manage.
- Set `FORGE_PORTAL_SECRET` to something different from it.
- Keep the service-role key server-side. Never in a `NEXT_PUBLIC_*` variable.
- Put the dashboard behind your own network controls if you can — Forge's own auth is one
  password.
- Rotate `FORGE_ADMIN_PASSWORD` whenever a device with an open session is lost, because
  that is the only thing that ends the session.
- Apply the migrations. Several fail-closed behaviours (publication checkpoints, per-client
  portal revocation) depend on columns and functions they create.

Found something this document does not cover, or something it gets wrong? See
[SECURITY.md](../SECURITY.md).
