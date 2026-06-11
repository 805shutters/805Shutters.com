create table if not exists public.crm_availability_slots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner text not null default 'Jessica',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'available',
  source text not null default 'crm_click_availability',
  created_by_email text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_availability_slots_status_check check (status in ('available', 'canceled')),
  constraint crm_availability_slots_time_check check (end_at > start_at),
  constraint crm_availability_slots_owner_window_unique unique (owner, start_at, end_at)
);

create index if not exists crm_availability_slots_owner_window_idx
on public.crm_availability_slots (owner, start_at, end_at)
where status = 'available';

create trigger crm_availability_slots_set_updated_at
before update on public.crm_availability_slots
for each row
execute function public.set_updated_at();

alter table public.crm_availability_slots enable row level security;

drop policy if exists "service role can manage crm availability slots" on public.crm_availability_slots;
create policy "service role can manage crm availability slots"
on public.crm_availability_slots
for all
to service_role
using (true)
with check (true);
