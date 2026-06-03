create table public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  email text not null unique,
  display_name text,
  role text not null default 'sales',
  active boolean not null default true,
  constraint crm_profiles_role_check check (
    role in ('owner', 'admin', 'sales', 'bookkeeping')
  )
);

create table public.crm_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'manual',
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'new',
  priority text not null default 'normal',
  customer_name text not null,
  phone text not null,
  email text,
  address text,
  city text,
  product_interest text not null default 'shutters',
  sales_owner text not null default 'Unassigned',
  next_action text,
  next_action_due date,
  appointment_start timestamptz,
  appointment_end timestamptz,
  estimated_total numeric(12, 2) not null default 0,
  deposit_paid numeric(12, 2) not null default 0,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_jobs_status_check check (
    status in ('new', 'follow_up', 'scheduled', 'quoted', 'sold', 'ordered', 'installed', 'invoiced', 'closed', 'lost')
  ),
  constraint crm_jobs_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  )
);

create table public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid not null references public.crm_jobs(id) on delete cascade,
  quote_number text,
  status text not null default 'draft',
  quote_total numeric(12, 2) not null default 0,
  materials_cost numeric(12, 2) not null default 0,
  labor_cost numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  deposit_required numeric(12, 2) not null default 0,
  balance_due numeric(12, 2) not null default 0,
  sold_by text,
  sent_at timestamptz,
  approved_at timestamptz,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_quotes_status_check check (
    status in ('draft', 'sent', 'approved', 'ordered', 'installed', 'invoiced', 'paid', 'lost')
  )
);

create table public.crm_quote_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  room text,
  product_category text not null default 'shutters',
  description text not null,
  width_in numeric(8, 2),
  height_in numeric(8, 2),
  quantity integer not null default 1,
  unit_price numeric(12, 2) not null default 0,
  total_price numeric(12, 2) not null default 0
);

create table public.crm_calendar_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid references public.crm_jobs(id) on delete set null,
  title text not null,
  event_type text not null default 'sales_consult',
  status text not null default 'scheduled',
  assigned_to text not null default 'Unassigned',
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_calendar_events_type_check check (
    event_type in ('sales_consult', 'measure', 'install', 'follow_up', 'block')
  ),
  constraint crm_calendar_events_status_check check (
    status in ('scheduled', 'complete', 'canceled', 'rescheduled')
  ),
  constraint crm_calendar_events_time_check check (end_at > start_at)
);

create index crm_jobs_created_at_idx on public.crm_jobs (created_at desc);
create index crm_jobs_status_due_idx on public.crm_jobs (status, next_action_due);
create index crm_jobs_phone_idx on public.crm_jobs (phone);
create index crm_quotes_job_status_idx on public.crm_quotes (job_id, status);
create index crm_quotes_status_created_at_idx on public.crm_quotes (status, created_at desc);
create index crm_quote_items_quote_idx on public.crm_quote_items (quote_id);
create index crm_calendar_events_start_idx on public.crm_calendar_events (start_at);
create index crm_calendar_events_job_idx on public.crm_calendar_events (job_id);

create trigger crm_profiles_set_updated_at
before update on public.crm_profiles
for each row
execute function public.set_updated_at();

create trigger crm_jobs_set_updated_at
before update on public.crm_jobs
for each row
execute function public.set_updated_at();

create trigger crm_quotes_set_updated_at
before update on public.crm_quotes
for each row
execute function public.set_updated_at();

create trigger crm_quote_items_set_updated_at
before update on public.crm_quote_items
for each row
execute function public.set_updated_at();

create trigger crm_calendar_events_set_updated_at
before update on public.crm_calendar_events
for each row
execute function public.set_updated_at();

alter table public.crm_profiles enable row level security;
alter table public.crm_jobs enable row level security;
alter table public.crm_quotes enable row level security;
alter table public.crm_quote_items enable row level security;
alter table public.crm_calendar_events enable row level security;

create policy "service role can manage crm profiles"
on public.crm_profiles
for all
to service_role
using (true)
with check (true);

create policy "service role can manage crm jobs"
on public.crm_jobs
for all
to service_role
using (true)
with check (true);

create policy "service role can manage crm quotes"
on public.crm_quotes
for all
to service_role
using (true)
with check (true);

create policy "service role can manage crm quote items"
on public.crm_quote_items
for all
to service_role
using (true)
with check (true);

create policy "service role can manage crm calendar events"
on public.crm_calendar_events
for all
to service_role
using (true)
with check (true);
