-- Queue every CRM calendar insert, update, and delete onto the existing
-- booking outbox. The booking worker is the only Google Calendar writer.
-- Meta-only updates (id writeback, reminders, the in-progress backfill) do
-- not match the column list, so they do not enqueue a second event.
-- Rows that are already in the past and have no stored Google ids are left
-- alone. This migration does not backfill.

alter table public.booking_outbox add column if not exists calendar_event_id uuid;
alter table public.booking_outbox alter column booking_key drop not null;
alter table public.booking_outbox drop constraint if exists booking_outbox_has_target;
alter table public.booking_outbox add constraint booking_outbox_has_target
  check (booking_key is not null or calendar_event_id is not null);
create unique index if not exists booking_outbox_google_calendar_event_uidx
  on public.booking_outbox (calendar_event_id)
  where kind = 'google_calendar' and calendar_event_id is not null;

create or replace function booking_private.enqueue_google_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_action text;
  v_booking_key uuid;
  v_outbox_id uuid;
  v_payload jsonb;
  ids jsonb;
  has_ids boolean;
  old_has_ids boolean;
  src_meta jsonb;
  old_meta jsonb;
begin
  if tg_op = 'DELETE' then
    v_event_id := old.id;
    src_meta := coalesce(old.meta, '{}'::jsonb);
  else
    v_event_id := new.id;
    src_meta := coalesce(new.meta, '{}'::jsonb);
  end if;
  ids := case
    when jsonb_typeof(src_meta->'googleCalendarEventIds') = 'object' then src_meta->'googleCalendarEventIds'
    else '{}'::jsonb
  end;
  select exists (
    select 1 from jsonb_each_text(ids) entry where length(btrim(entry.value)) > 0
  ) into has_ids;

  if tg_op = 'DELETE' then
    if old.start_at <= now() and not has_ids then
      return null;
    end if;
    v_action := 'delete';
  elsif tg_op = 'INSERT' then
    if new.start_at <= now() and not has_ids then
      return null;
    end if;
    v_action := case when lower(btrim(coalesce(new.status, ''))) in ('canceled', 'cancelled') then 'delete' else 'upsert' end;
  else
    old_meta := coalesce(old.meta, '{}'::jsonb);
    select exists (
      select 1
      from jsonb_each_text(case
        when jsonb_typeof(old_meta->'googleCalendarEventIds') = 'object' then old_meta->'googleCalendarEventIds'
        else '{}'::jsonb
      end) entry
      where length(btrim(entry.value)) > 0
    ) into old_has_ids;
    if new.start_at <= now() and old.start_at <= now() and not has_ids and not old_has_ids then
      return null;
    end if;
    v_action := case when lower(btrim(coalesce(new.status, ''))) in ('canceled', 'cancelled') then 'delete' else 'upsert' end;
  end if;

  v_payload := jsonb_build_object(
    'sync', 'reconcile',
    'action', v_action,
    'calendarEventId', v_event_id,
    'googleCalendarEventIds', ids,
    'enqueuedAt', clock_timestamp(),
    'syncToken', gen_random_uuid()
  );

  select r.key into v_booking_key
  from public.booking_requests r
  where r.response->>'calendarEventId' = v_event_id::text
  order by r.created_at desc
  limit 1;

  update public.booking_outbox o
  set
    calendar_event_id = v_event_id,
    booking_key = coalesce(o.booking_key, v_booking_key),
    payload = coalesce(o.payload, '{}'::jsonb) || v_payload,
    status = case when o.status = 'processing' then o.status else 'pending' end,
    claimed_at = case when o.status = 'processing' then o.claimed_at else null end,
    completed_at = case when o.status = 'processing' then o.completed_at else null end,
    last_error = case when o.status = 'processing' then o.last_error else null end
  where o.id = (
    select candidate.id
    from public.booking_outbox candidate
    where candidate.kind = 'google_calendar'
      and (
        candidate.calendar_event_id = v_event_id
        or candidate.payload->>'calendarEventId' = v_event_id::text
        or (v_booking_key is not null and candidate.booking_key = v_booking_key)
      )
    order by case when candidate.calendar_event_id = v_event_id then 0 else 1 end, candidate.id
    limit 1
  )
  returning o.id into v_outbox_id;

  if not found then
    insert into public.booking_outbox (booking_key, calendar_event_id, kind, payload, status)
    values (v_booking_key, v_event_id, 'google_calendar', v_payload, 'pending')
    on conflict (calendar_event_id) where kind = 'google_calendar' and calendar_event_id is not null
    do update set
      booking_key = coalesce(public.booking_outbox.booking_key, excluded.booking_key),
      payload = coalesce(public.booking_outbox.payload, '{}'::jsonb) || excluded.payload,
      status = case when public.booking_outbox.status = 'processing' then public.booking_outbox.status else 'pending' end,
      claimed_at = case when public.booking_outbox.status = 'processing' then public.booking_outbox.claimed_at else null end,
      completed_at = case when public.booking_outbox.status = 'processing' then public.booking_outbox.completed_at else null end,
      last_error = case when public.booking_outbox.status = 'processing' then public.booking_outbox.last_error else null end;
  end if;
  return null;
end $$;

revoke all on function booking_private.enqueue_google_calendar_sync() from public, anon, authenticated;
grant execute on function booking_private.enqueue_google_calendar_sync() to service_role;

drop trigger if exists crm_calendar_events_google_sync on public.crm_calendar_events;
create constraint trigger crm_calendar_events_google_sync
after insert or delete or update of title, event_type, status, assigned_to, start_at, end_at, location, notes, job_id
on public.crm_calendar_events
deferrable initially deferred
for each row
execute function booking_private.enqueue_google_calendar_sync();
