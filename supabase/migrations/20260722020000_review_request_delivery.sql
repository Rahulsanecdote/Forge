-- Review automation: send review requests for the operator instead of copy/paste.
-- Each request now carries how it was (or will be) delivered and the outcome, so the
-- dashboard can show "sent / needs manual send / failed" per customer. Delivery is
-- best-effort and env-gated (Resend for email, Twilio for SMS); when no provider is
-- configured for a channel the row is created and marked 'skipped' so the operator can
-- still copy the link and send it by hand — nothing is ever silently dropped.

alter table public.review_requests
  add column if not exists channel text not null default 'manual'
    check (channel in ('manual', 'email', 'sms')),
  add column if not exists contact text,
  add column if not exists send_status text not null default 'pending'
    check (send_status in ('pending', 'sent', 'failed', 'skipped')),
  add column if not exists sent_at timestamptz,
  add column if not exists delivery_error text;
