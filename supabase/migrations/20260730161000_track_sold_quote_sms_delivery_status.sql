alter table public.crm_sold_quote_sms_notifications
  add column if not exists provider_status text,
  add column if not exists provider_error_code text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists delivered_at timestamptz;

alter table public.crm_sold_quote_sms_notifications
  drop constraint if exists crm_sold_quote_sms_notifications_status_check;

-- A successful Messages API response means Twilio accepted the request. It is
-- not carrier delivery proof, so rename the pre-callback state accordingly.
update public.crm_sold_quote_sms_notifications
set
  status = 'accepted',
  provider_status = coalesce(provider_status, 'accepted'),
  status_updated_at = coalesce(status_updated_at, updated_at)
where status = 'sent';

alter table public.crm_sold_quote_sms_notifications
  add constraint crm_sold_quote_sms_notifications_status_check
  check (
    status in (
      'sending',
      'accepted',
      'delivered',
      'undelivered',
      'failed',
      'invalid',
      'unknown'
    )
  );

create unique index if not exists crm_sold_quote_sms_notifications_provider_sid_idx
on public.crm_sold_quote_sms_notifications (provider_message_sid)
where provider_message_sid is not null;

create or replace function public.record_crm_sold_quote_sms_provider_status(
  p_message_sid text,
  p_provider_status text,
  p_error_code text default null
)
returns setof public.crm_sold_quote_sms_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_status text := lower(trim(coalesce(p_provider_status, '')));
begin
  if coalesce(trim(p_message_sid), '') = '' or normalized_status = '' then
    return;
  end if;

  return query
  update public.crm_sold_quote_sms_notifications as notification
  set
    status = case
      -- Twilio warns that callbacks may arrive out of order. Once a terminal
      -- carrier outcome is stored, never downgrade it with a late queue event.
      when notification.status in ('delivered', 'undelivered')
        then notification.status
      when normalized_status = 'delivered'
        then 'delivered'
      when normalized_status in ('failed', 'undelivered', 'canceled')
        then 'undelivered'
      when normalized_status in ('accepted', 'scheduled', 'queued', 'sending', 'sent')
        then 'accepted'
      else notification.status
    end,
    provider_status = case
      when notification.status in ('delivered', 'undelivered')
        then notification.provider_status
      else normalized_status
    end,
    provider_error_code = case
      when notification.status in ('delivered', 'undelivered')
        then notification.provider_error_code
      when normalized_status in ('failed', 'undelivered', 'canceled')
        then nullif(trim(coalesce(p_error_code, '')), '')
      else null
    end,
    last_error = case
      when notification.status in ('delivered', 'undelivered')
        then notification.last_error
      when normalized_status in ('failed', 'undelivered', 'canceled')
        then concat(
          'Twilio delivery status: ',
          normalized_status,
          case
            when nullif(trim(coalesce(p_error_code, '')), '') is null then ''
            else concat(' (', trim(p_error_code), ')')
          end
        )
      else null
    end,
    delivered_at = case
      when notification.status = 'delivered'
        then notification.delivered_at
      when normalized_status = 'delivered'
        then now()
      else notification.delivered_at
    end,
    status_updated_at = now(),
    updated_at = now()
  where notification.provider_message_sid = p_message_sid
  returning notification.*;
end;
$$;

revoke all on function public.record_crm_sold_quote_sms_provider_status(
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.record_crm_sold_quote_sms_provider_status(
  text,
  text,
  text
) to service_role;

comment on column public.crm_sold_quote_sms_notifications.status is
  'accepted means Twilio accepted the API request; delivered and undelivered are terminal carrier outcomes from signed status callbacks.';
comment on column public.crm_sold_quote_sms_notifications.provider_status is
  'Most recent non-stale Twilio MessageStatus recorded by the signed callback endpoint.';
