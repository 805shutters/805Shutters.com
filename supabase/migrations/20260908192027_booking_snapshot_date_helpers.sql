-- Restore the date-conversion prerequisites for booking_schedule_snapshot.
-- 805 production has legacy appointment rows but the older mirror migration
-- was not applied. These pure helpers do not mirror or modify appointments.
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


notify pgrst, 'reload schema';
