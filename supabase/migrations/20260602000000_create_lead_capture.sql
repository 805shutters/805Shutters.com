create extension if not exists pgcrypto;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'website',
  status text not null default 'new',
  name text not null,
  phone text not null,
  email text,
  city text,
  interest text,
  notes text,
  page_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  meta jsonb not null default '{}'::jsonb,
  constraint leads_status_check check (
    status in ('new', 'contacted', 'qualified', 'booked', 'closed', 'spam')
  )
);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  note text,
  meta jsonb not null default '{}'::jsonb
);

create index leads_created_at_idx on public.leads (created_at desc);
create index leads_status_created_at_idx on public.leads (status, created_at desc);
create index leads_phone_idx on public.leads (phone);
create index lead_events_lead_id_created_at_idx on public.lead_events (lead_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;

-- Website submissions go through the Next.js API using the service-role key.
-- Keep anon/authenticated clients from reading or writing leads directly.
create policy "service role can manage leads"
on public.leads
for all
to service_role
using (true)
with check (true);

create policy "service role can manage lead events"
on public.lead_events
for all
to service_role
using (true)
with check (true);
