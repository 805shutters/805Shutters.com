-- Keep legacy/quote-dashboard 805 sales appointments authoritative for public
-- booking availability by mirroring them into crm_calendar_events.
--
-- Public booking only checks crm_calendar_events. Rows written directly to
-- sales_805_appointments were visible in the quote dashboard, but they did not
-- block customer self-booking unless someone manually added a CRM calendar
-- block. This trigger makes the write path consistent.

create unique index if not exists crm_calendar_events_sales_805_appointment_uidx
on public.crm_calendar_events ((meta->>'sales_805_appointment_id'))
where meta ? 'sales_805_appointment_id';

create or replace function public.sales_805_appointment_calendar_start(
  appointment_date date,
  start_time time
)
returns timestamptz
language sql
immutable
as $$
  select (appointment_date + start_time) at time zone 'America/Los_Angeles'
$$;

create or replace function public.sales_805_appointment_calendar_end(
  appointment_date date,
  start_time time,
  end_time time
)
returns timestamptz
language sql
immutable
as $$
  select case
    when end_time is null then ((appointment_date + start_time) at time zone 'America/Los_Angeles') + interval '1 hour'
    when end_time > start_time then (appointment_date + end_time) at time zone 'America/Los_Angeles'
    else ((appointment_date + start_time) at time zone 'America/Los_Angeles') + interval '1 hour'
  end
$$;

create or replace function public.mirror_sales_805_appointment_to_crm_calendar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  calendar_start timestamptz;
  calendar_end timestamptz;
  calendar_status text;
  appointment_meta jsonb;
begin
  if tg_op = 'DELETE' then
    update public.crm_calendar_events
    set
      status = 'canceled',
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
        'sales_805_appointment_status', 'deleted',
        'sales_805_appointment_deleted_at', now()
      )
    where meta->>'sales_805_appointment_id' = old.id::text;

    return old;
  end if;

  calendar_start := public.sales_805_appointment_calendar_start(new.appointment_date, new.start_time);
  calendar_end := public.sales_805_appointment_calendar_end(new.appointment_date, new.start_time, new.end_time);
  calendar_status := case new.status
    when 'cancelled' then 'canceled'
    when 'completed' then 'complete'
    else 'scheduled'
  end;

  appointment_meta := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'sales_805_appointments_mirror',
      'sales_805_appointment_id', new.id::text,
      'sales_805_appointment_status', new.status,
      'sales_805_appointment_source', new.source,
      'mts_quote_id', new.quote_id,
      'customer_name', new.customer_name,
      'customer_phone', new.customer_phone,
      'customer_address', new.customer_address
    );

  update public.crm_calendar_events
  set
    title = new.customer_name || ' consultation',
    event_type = 'sales_consult',
    status = calendar_status,
    assigned_to = new.assigned_to,
    start_at = calendar_start,
    end_at = calendar_end,
    location = new.customer_address,
    notes = new.notes,
    meta = appointment_meta
  where meta->>'sales_805_appointment_id' = new.id::text;

  if found then
    return new;
  end if;

  -- If a real CRM/website event already owns the slot, leave it alone. The slot
  -- is already protected, and this avoids breaking the direct Supabase insert.
  if exists (
    select 1
    from public.crm_calendar_events event
    where event.status <> 'canceled'
      and event.assigned_to = new.assigned_to
      and event.start_at = calendar_start
  ) then
    return new;
  end if;

  insert into public.crm_calendar_events (
    title,
    event_type,
    status,
    assigned_to,
    start_at,
    end_at,
    location,
    notes,
    meta
  )
  values (
    new.customer_name || ' consultation',
    'sales_consult',
    calendar_status,
    new.assigned_to,
    calendar_start,
    calendar_end,
    new.customer_address,
    new.notes,
    appointment_meta
  );

  return new;
end;
$$;

drop trigger if exists sales_805_appointments_mirror_calendar on public.sales_805_appointments;
create trigger sales_805_appointments_mirror_calendar
after insert or update or delete on public.sales_805_appointments
for each row
execute function public.mirror_sales_805_appointment_to_crm_calendar();

insert into public.crm_calendar_events (
  title,
  event_type,
  status,
  assigned_to,
  start_at,
  end_at,
  location,
  notes,
  meta
)
select
  appointment.customer_name || ' consultation',
  'sales_consult',
  case appointment.status
    when 'cancelled' then 'canceled'
    when 'completed' then 'complete'
    else 'scheduled'
  end,
  appointment.assigned_to,
  public.sales_805_appointment_calendar_start(appointment.appointment_date, appointment.start_time),
  public.sales_805_appointment_calendar_end(appointment.appointment_date, appointment.start_time, appointment.end_time),
  appointment.customer_address,
  appointment.notes,
  coalesce(appointment.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'sales_805_appointments_mirror',
      'sales_805_appointment_id', appointment.id::text,
      'sales_805_appointment_status', appointment.status,
      'sales_805_appointment_source', appointment.source,
      'mts_quote_id', appointment.quote_id,
      'customer_name', appointment.customer_name,
      'customer_phone', appointment.customer_phone,
      'customer_address', appointment.customer_address
    )
from public.sales_805_appointments appointment
where not exists (
    select 1
    from public.crm_calendar_events event
    where event.meta->>'sales_805_appointment_id' = appointment.id::text
  )
  and not exists (
    select 1
    from public.crm_calendar_events event
    where event.status <> 'canceled'
      and event.assigned_to = appointment.assigned_to
      and event.start_at = public.sales_805_appointment_calendar_start(appointment.appointment_date, appointment.start_time)
  );
