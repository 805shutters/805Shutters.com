-- Booking robustness (audit batch F, H9): prevent double-booking a rep into the
-- same time slot. Without this, two concurrent self-bookings can both pass the
-- availability check and each insert a calendar event for the same rep+time.
--
-- A unique index on (assigned_to, start_at) for non-canceled events makes the
-- second concurrent insert fail (23505); the booking route catches that and
-- returns 409 "that time was just booked", rolling back the job + lead it had
-- already created.
--
-- Partial (status <> 'canceled') so a canceled appointment frees the slot to be
-- re-booked. If prod already contains duplicate (assigned_to, start_at) rows,
-- de-duplicate them before applying.

create unique index if not exists crm_calendar_events_unique_rep_slot
  on public.crm_calendar_events (assigned_to, start_at)
  where status <> 'canceled' and assigned_to is not null;
