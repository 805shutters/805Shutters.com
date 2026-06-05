create table if not exists public.crm_activity_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint crm_activity_events_entity_type_check check (
    entity_type in (
      'job',
      'quote',
      'bookkeeping_entry',
      'bookkeeping_payment',
      'calendar_event',
      'customer',
      'session',
      'system'
    )
  )
);

create index if not exists crm_activity_events_entity_idx
on public.crm_activity_events (entity_type, entity_id, created_at desc);

create index if not exists crm_activity_events_actor_idx
on public.crm_activity_events (actor_email, created_at desc);

create index if not exists crm_activity_events_created_at_idx
on public.crm_activity_events (created_at desc);

create index if not exists crm_jobs_customer_name_lower_idx
on public.crm_jobs (lower(customer_name));

create index if not exists crm_jobs_appointment_start_idx
on public.crm_jobs (appointment_start)
where appointment_start is not null;

create index if not exists crm_calendar_events_assigned_window_idx
on public.crm_calendar_events (assigned_to, start_at, end_at)
where status in ('scheduled', 'rescheduled');

create index if not exists crm_calendar_events_status_start_idx
on public.crm_calendar_events (status, start_at);

alter table public.crm_activity_events enable row level security;

drop policy if exists "service role can manage crm activity events" on public.crm_activity_events;
create policy "service role can manage crm activity events"
on public.crm_activity_events
for all
to service_role
using (true)
with check (true);
