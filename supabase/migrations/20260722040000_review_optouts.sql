-- Review-request delivery compliance: a suppression list so a customer who opts out is
-- never contacted again. Populated when someone clicks the email unsubscribe link
-- (/u/<token>) or replies STOP to an SMS (Twilio inbound webhook). Global by (channel,
-- contact): one opt-out suppresses that address across every client this Forge sends for,
-- which is the safe reading of CAN-SPAM / TCPA for a single sending identity.

create table if not exists public.review_optouts (
  id         uuid primary key default gen_random_uuid(),
  channel    text not null check (channel in ('email', 'sms')),
  contact    text not null,            -- normalized: lowercased email / E.164 phone
  reason     text,                     -- 'email_unsubscribe' | 'sms_stop' | 'manual'
  created_at timestamptz not null default now(),
  unique (channel, contact)
);

alter table public.review_optouts enable row level security;
revoke all on table public.review_optouts from anon, authenticated;
grant select, insert, update, delete on table public.review_optouts to service_role;
