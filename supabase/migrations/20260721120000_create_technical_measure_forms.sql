-- Durable technical measure sheets and customer-signed change order addendums.

create table if not exists public.crm_technical_measure_forms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid not null references public.crm_jobs(id) on delete cascade,
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  customer_id uuid references public.crm_customers(id) on delete set null,
  contract_id uuid references public.crm_customer_contracts(id) on delete set null,
  status text not null default 'draft',
  customer_snapshot jsonb not null default '{}'::jsonb,
  quote_snapshot jsonb not null default '{}'::jsonb,
  baseline_total numeric(12, 2) not null default 0,
  current_total numeric(12, 2) not null default 0,
  technician_email text,
  technician_name text,
  submitted_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_technical_measure_forms_status_check
    check (status in ('draft', 'awaiting_signature', 'submitted')),
  constraint crm_technical_measure_forms_job_unique unique (job_id)
);

create table if not exists public.crm_technical_measure_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  form_id uuid not null references public.crm_technical_measure_forms(id) on delete cascade,
  quote_line_item_id uuid not null,
  sort_order integer not null default 0,
  baseline jsonb not null default '{}'::jsonb,
  current_values jsonb not null default '{}'::jsonb,
  baseline_unit_price numeric(12, 2) not null default 0,
  current_unit_price numeric(12, 2) not null default 0,
  price_status text not null default 'ok',
  constraint crm_technical_measure_lines_form_line_unique unique (form_id, quote_line_item_id)
);

create table if not exists public.crm_technical_measure_addendums (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  form_id uuid not null references public.crm_technical_measure_forms(id) on delete cascade,
  status text not null default 'required',
  changes jsonb not null default '[]'::jsonb,
  original_total numeric(12, 2) not null default 0,
  revised_total numeric(12, 2) not null default 0,
  price_difference numeric(12, 2) not null default 0,
  acknowledged boolean not null default false,
  signer_name text,
  signature_strokes jsonb,
  signed_at timestamptz,
  signed_by_technician text,
  pdf_base64 text,
  emailed_at timestamptz,
  email_recipient text,
  email_message_id text,
  email_error text,
  constraint crm_technical_measure_addendums_status_check
    check (status in ('required', 'signed', 'emailed', 'email_failed', 'superseded'))
);

create index if not exists crm_technical_measure_forms_quote_idx
  on public.crm_technical_measure_forms (quote_id);
create index if not exists crm_technical_measure_forms_status_idx
  on public.crm_technical_measure_forms (status, updated_at desc);
create index if not exists crm_technical_measure_lines_form_idx
  on public.crm_technical_measure_lines (form_id, sort_order);
create index if not exists crm_technical_measure_addendums_form_idx
  on public.crm_technical_measure_addendums (form_id, created_at desc);

drop trigger if exists crm_technical_measure_forms_set_updated_at on public.crm_technical_measure_forms;
create trigger crm_technical_measure_forms_set_updated_at
before update on public.crm_technical_measure_forms
for each row execute function public.set_updated_at();

drop trigger if exists crm_technical_measure_lines_set_updated_at on public.crm_technical_measure_lines;
create trigger crm_technical_measure_lines_set_updated_at
before update on public.crm_technical_measure_lines
for each row execute function public.set_updated_at();

drop trigger if exists crm_technical_measure_addendums_set_updated_at on public.crm_technical_measure_addendums;
create trigger crm_technical_measure_addendums_set_updated_at
before update on public.crm_technical_measure_addendums
for each row execute function public.set_updated_at();

alter table public.crm_technical_measure_forms enable row level security;
alter table public.crm_technical_measure_lines enable row level security;
alter table public.crm_technical_measure_addendums enable row level security;

drop policy if exists "service role can manage technical measure forms" on public.crm_technical_measure_forms;
create policy "service role can manage technical measure forms"
on public.crm_technical_measure_forms for all to service_role using (true) with check (true);

drop policy if exists "service role can manage technical measure lines" on public.crm_technical_measure_lines;
create policy "service role can manage technical measure lines"
on public.crm_technical_measure_lines for all to service_role using (true) with check (true);

drop policy if exists "service role can manage technical measure addendums" on public.crm_technical_measure_addendums;
create policy "service role can manage technical measure addendums"
on public.crm_technical_measure_addendums for all to service_role using (true) with check (true);
