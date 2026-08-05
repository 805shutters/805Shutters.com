create table if not exists public.crm_sold_quote_sms_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  event_key text not null default 'contract_signed',
  source text not null,
  recipient text not null,
  recipient_e164 text,
  message_body text not null,
  status text not null default 'sending',
  attempt_count integer not null default 1,
  last_attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_sid text,
  last_error text,
  constraint crm_sold_quote_sms_notifications_status_check
    check (status in ('sending', 'sent', 'failed', 'invalid', 'unknown')),
  constraint crm_sold_quote_sms_notifications_attempt_count_check
    check (attempt_count >= 0),
  constraint crm_sold_quote_sms_notifications_unique
    unique (quote_id, event_key, recipient)
);

create index if not exists crm_sold_quote_sms_notifications_status_idx
on public.crm_sold_quote_sms_notifications (status, updated_at desc);

create index if not exists crm_sold_quote_sms_notifications_quote_idx
on public.crm_sold_quote_sms_notifications (quote_id, created_at desc);

alter table public.crm_sold_quote_sms_notifications enable row level security;

drop policy if exists "service role can manage sold quote sms notifications"
on public.crm_sold_quote_sms_notifications;
create policy "service role can manage sold quote sms notifications"
on public.crm_sold_quote_sms_notifications
for all
to service_role
using (true)
with check (true);

create or replace function public.claim_crm_sold_quote_sms_notification(
  p_quote_id uuid,
  p_event_key text,
  p_source text,
  p_recipient text,
  p_recipient_e164 text,
  p_message_body text
)
returns setof public.crm_sold_quote_sms_notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  insert into public.crm_sold_quote_sms_notifications (
    quote_id,
    event_key,
    source,
    recipient,
    recipient_e164,
    message_body,
    status,
    attempt_count,
    last_attempted_at
  )
  values (
    p_quote_id,
    p_event_key,
    p_source,
    p_recipient,
    p_recipient_e164,
    p_message_body,
    'sending',
    1,
    now()
  )
  on conflict (quote_id, event_key, recipient) do update
  set
    source = excluded.source,
    recipient_e164 = excluded.recipient_e164,
    message_body = excluded.message_body,
    status = 'sending',
    attempt_count = public.crm_sold_quote_sms_notifications.attempt_count + 1,
    last_attempted_at = now(),
    last_error = null,
    updated_at = now()
  where public.crm_sold_quote_sms_notifications.status = 'failed'
  returning public.crm_sold_quote_sms_notifications.*;
end;
$$;

revoke all on function public.claim_crm_sold_quote_sms_notification(
  uuid,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.claim_crm_sold_quote_sms_notification(
  uuid,
  text,
  text,
  text,
  text,
  text
) to service_role;

-- Existing signatures predate durable tracking. Their provider outcome cannot
-- be inferred safely, so preserve them as unknown instead of risking duplicate
-- business alerts on a later customer retry.
insert into public.crm_sold_quote_sms_notifications (
  quote_id,
  event_key,
  source,
  recipient,
  recipient_e164,
  message_body,
  status,
  attempt_count,
  last_attempted_at,
  last_error
)
select
  quote.id,
  'contract_signed',
  'historical_backfill',
  recipient.e164,
  recipient.e164,
  '',
  'unknown',
  0,
  quote.signed_at,
  'Signature predates durable SMS tracking; reconcile against Twilio before any resend.'
from public.crm_quotes as quote
cross join (
  values
    ('+18052985555'::text),
    ('+18059144917'::text)
) as recipient(e164)
where quote.signed_at is not null
  and quote.signed_at >= now() - interval '180 days'
on conflict (quote_id, event_key, recipient) do nothing;

comment on table public.crm_sold_quote_sms_notifications is
  'Durable, per-recipient delivery state for 805 sold-contract business SMS notifications.';
comment on column public.crm_sold_quote_sms_notifications.status is
  'sending is never auto-retried because the provider may have accepted the message before a process interruption; unknown likewise requires reconciliation.';
