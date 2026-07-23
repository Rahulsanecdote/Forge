-- Per-client portal revocation. Each client's portal login key and session cookie are
-- signed with a secret derived from the global portal secret + client id + this version.
-- Bumping a client's version invalidates only that client's outstanding links and
-- sessions (and rotates the link the operator shares) — replacing the previous coarse
-- "rotate FORGE_PORTAL_SECRET to invalidate everyone" mechanism.

alter table public.clients
  add column if not exists portal_key_version integer not null default 1;
