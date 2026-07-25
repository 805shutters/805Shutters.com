-- Technical measures belong on Mike's calendar even when a sales consultation
-- already occupies the same start time. Keep the booking concurrency guard for
-- every other appointment type while excluding measure events from the unique
-- start-time constraint.

drop index if exists public.crm_calendar_events_unique_rep_slot;

create unique index crm_calendar_events_unique_rep_slot
  on public.crm_calendar_events (assigned_to, start_at)
  where status <> 'canceled'
    and assigned_to is not null
    and event_type <> 'measure';
