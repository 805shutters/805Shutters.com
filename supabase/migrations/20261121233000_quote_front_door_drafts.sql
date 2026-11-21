-- Quoter front-door drafts. Additive only.
-- Not applied to production by the pull request that adds this file.
-- A row can only be a draft. Sending a quote stays in the CRM UI.
-- This migration does not email, text, or call a payment provider.

create table if not exists public.crm_quote_front_door_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_id uuid references public.crm_customers(id) on delete set null,
  job_id uuid references public.crm_jobs(id) on delete set null,
  calendar_event_id uuid references public.crm_calendar_events(id) on delete set null,
  appointment_id uuid references public.sales_805_appointments(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  manufacturer text not null,
  category text not null,
  catalog_version text,
  spec jsonb not null,
  multiplier numeric(6, 3) not null,
  status text not null default 'draft',
  read_back text not null,
  created_by uuid,
  created_by_email text,
  constraint crm_quote_front_door_drafts_status_draft check (status = 'draft'),
  constraint crm_quote_front_door_drafts_multiplier_positive check (multiplier > 0),
  constraint crm_quote_front_door_drafts_customer_name_present check (length(btrim(customer_name)) > 0),
  constraint crm_quote_front_door_drafts_read_back_present check (length(btrim(read_back)) > 0),
  constraint crm_quote_front_door_drafts_manufacturer_present check (length(btrim(manufacturer)) > 0),
  constraint crm_quote_front_door_drafts_category_present check (length(btrim(category)) > 0)
);

comment on table public.crm_quote_front_door_drafts is
  'Draft quotes started by the Quoter front door. Status is draft only. Mike sends quotes from the CRM UI.';

create index if not exists crm_quote_front_door_drafts_customer_idx
  on public.crm_quote_front_door_drafts (customer_id);

create index if not exists crm_quote_front_door_drafts_created_idx
  on public.crm_quote_front_door_drafts (created_at desc);

create trigger crm_quote_front_door_drafts_set_updated_at
before update on public.crm_quote_front_door_drafts
for each row execute function public.set_updated_at();

alter table public.crm_quote_front_door_drafts enable row level security;
alter table public.crm_quote_front_door_drafts force row level security;

create policy crm_quote_front_door_drafts_staff_read
  on public.crm_quote_front_door_drafts
  for select
  to authenticated
  using (public.is_805_crm_user());

create policy crm_quote_front_door_drafts_service_read
  on public.crm_quote_front_door_drafts
  for select
  to service_role
  using (true);

create policy crm_quote_front_door_drafts_service_insert
  on public.crm_quote_front_door_drafts
  for insert
  to service_role
  with check (status = 'draft');

grant usage on schema public to anon, authenticated, service_role;
revoke all on public.crm_quote_front_door_drafts from public, anon, authenticated, service_role;
grant select on public.crm_quote_front_door_drafts to authenticated, service_role;
grant insert on public.crm_quote_front_door_drafts to service_role;
