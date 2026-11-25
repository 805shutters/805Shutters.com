-- Run only after deploying the all-assignee Google Calendar sync policy.
-- Reconcile today's and upcoming active appointments, preserving Google ids.
-- Only Google outbox effects change; no CRM assignments, customer messages,
-- booking requests, or past/canceled appointments are modified.
-- Within a transaction, opt in with:
-- select set_config('crm.jessica_calendar_refresh', 'apply', true);

do $refresh$
declare
  appointment record;
  v_outbox_id uuid;
  v_booking_key uuid;
  v_payload jsonb;
begin
  if current_setting('crm.jessica_calendar_refresh', true) is distinct from 'apply' then
    raise exception 'Set crm.jessica_calendar_refresh=apply after deploying the all-assignee sync policy';
  end if;

  for appointment in
    select id, meta from public.crm_calendar_events
    where start_at >= (date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
      and status in ('scheduled', 'rescheduled')
  loop
    select r.key into v_booking_key from public.booking_requests r
    where r.response->>'calendarEventId' = appointment.id::text
    order by r.created_at desc limit 1;

    v_payload := jsonb_build_object(
      'sync', 'reconcile', 'action', 'upsert',
      'calendarEventId', appointment.id,
      'googleCalendarEventIds', coalesce(appointment.meta->'googleCalendarEventIds', '{}'::jsonb),
      'enqueuedAt', clock_timestamp(), 'syncToken', gen_random_uuid()
    );

    select o.id into v_outbox_id from public.booking_outbox o
    where o.kind = 'google_calendar' and (
      o.calendar_event_id = appointment.id
      or o.payload->>'calendarEventId' = appointment.id::text
      or (v_booking_key is not null and o.booking_key = v_booking_key)
    )
    order by case when o.calendar_event_id = appointment.id then 0 else 1 end, o.id
    limit 1;

    if v_outbox_id is not null then
      update public.booking_outbox o set
        calendar_event_id = appointment.id,
        payload = coalesce(o.payload, '{}'::jsonb) || v_payload,
        status = case when o.status = 'processing' then o.status else 'pending' end,
        claimed_at = case when o.status = 'processing' then o.claimed_at else null end,
        completed_at = case when o.status = 'processing' then o.completed_at else null end,
        last_error = case when o.status = 'processing' then o.last_error else null end
      where o.id = v_outbox_id;
    else
      insert into public.booking_outbox (booking_key, calendar_event_id, kind, payload, status)
      values (v_booking_key, appointment.id, 'google_calendar', v_payload, 'pending')
      on conflict (calendar_event_id) where kind = 'google_calendar' and calendar_event_id is not null
      do nothing;
    end if;
  end loop;
end
$refresh$;
