-- Opt-in queue for future CRM calendar rows that do not yet have a Google
-- event id. This is not a migration and it is not part of deploy.
-- It only inserts booking_outbox rows. The existing booking worker writes
-- Google Calendar. It does not email or text anyone, and it skips past rows.
--
-- A plain run refuses to write. To apply it:
--   begin;
--   select set_config('crm.google_calendar_backfill', 'apply', true);
--   \i scripts/sql/enqueue-future-crm-calendar-google-sync.sql
--   commit;

do $backfill$
declare queued integer;
begin
  if current_setting('crm.google_calendar_backfill', true) is distinct from 'apply' then
    raise exception 'Refusing to enqueue Google Calendar sync. Set crm.google_calendar_backfill=apply in this transaction to queue future CRM events that have no Google id.';
  end if;

  insert into public.booking_outbox (booking_key, calendar_event_id, kind, payload, status)
  select
    req.key,
    event.id,
    'google_calendar',
    jsonb_build_object(
      'sync', 'reconcile',
      'action', 'upsert',
      'calendarEventId', event.id,
      'googleCalendarEventIds', '{}'::jsonb,
      'enqueuedAt', clock_timestamp(),
      'syncToken', gen_random_uuid()
    ),
    'pending'
  from public.crm_calendar_events event
  left join lateral (
    select key
    from public.booking_requests
    where response->>'calendarEventId' = event.id::text
    order by created_at desc
    limit 1
  ) req on true
  where event.start_at > now()
    and lower(btrim(event.status)) not in ('canceled', 'cancelled')
    and not exists (
      select 1
      from jsonb_each_text(case
        when jsonb_typeof(event.meta->'googleCalendarEventIds') = 'object' then event.meta->'googleCalendarEventIds'
        else '{}'::jsonb
      end) entry
      where length(btrim(entry.value)) > 0
    )
    and not exists (
      select 1
      from public.booking_outbox existing
      where existing.kind = 'google_calendar'
        and existing.calendar_event_id = event.id
    )
  on conflict (calendar_event_id) where kind = 'google_calendar' and calendar_event_id is not null
  do nothing;

  get diagnostics queued = row_count;
  raise notice 'Queued % future CRM calendar events', queued;
end
$backfill$;
