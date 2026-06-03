alter table public.crm_quotes
  add column if not exists sold_at timestamptz,
  add column if not exists ordered_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists installed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists manufacturer_name text,
  add column if not exists manufacturer_order_ref text,
  add column if not exists manufacturer_order_url text,
  add column if not exists manufacturer_document_url text;

alter table public.crm_quotes drop constraint if exists crm_quotes_status_check;
alter table public.crm_quotes
  add constraint crm_quotes_status_check check (
    status in (
      'draft',
      'sent',
      'sold',
      'approved',
      'ordered',
      'received',
      'installed',
      'invoiced',
      'paid',
      'archived',
      'lost'
    )
  );

create table if not exists public.crm_quote_bookkeeping_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete cascade,
  source text not null default 'manual',
  customer_name text not null,
  sold_date date,
  total_amount numeric(12, 2) not null default 0,
  payment_type text,
  cogs_amount numeric(12, 2) not null default 0,
  sales_owner text,
  sales_owner_auth_user_id uuid references auth.users(id) on delete set null,
  sales_owner_set_at timestamptz,
  installation_invoice_document_id text,
  installation_invoice_amount numeric(12, 2) not null default 0,
  installation_invoice_number text,
  installation_invoice_url text,
  installation_match_status text not null default 'unmatched',
  installation_matched_at timestamptz,
  jessica_commission_paid_at timestamptz,
  manufacturer_name text,
  manufacturer_order_ref text,
  manufacturer_order_url text,
  manufacturer_document_url text,
  notes text,
  imported_sheet_row integer,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_quote_bookkeeping_entries_source_check check (
    source in ('crm_quote', 'legacy_sheet', 'manual')
  ),
  constraint crm_quote_bookkeeping_entries_payment_type_check check (
    payment_type is null or payment_type in ('zelle', 'cash', 'check', 'credit_card', 'other')
  ),
  constraint crm_quote_bookkeeping_entries_sales_owner_check check (
    sales_owner is null or sales_owner in ('mike', 'jessica')
  ),
  constraint crm_quote_bookkeeping_entries_installation_match_check check (
    installation_match_status in ('unmatched', 'matched', 'needs_review')
  )
);

create table if not exists public.crm_quote_bookkeeping_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete cascade,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete cascade,
  payment_label text not null,
  payment_type text not null default 'other',
  amount numeric(12, 2) not null default 0,
  paid_at date,
  notes text,
  source text not null default 'manual',
  meta jsonb not null default '{}'::jsonb,
  constraint crm_quote_bookkeeping_payments_payment_type_check check (
    payment_type in ('zelle', 'cash', 'check', 'credit_card', 'other')
  ),
  constraint crm_quote_bookkeeping_payments_source_check check (
    source in ('crm_quote', 'legacy_sheet', 'manual')
  )
);

create table if not exists public.crm_quote_bookkeeping_credits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  from_quote_id uuid references public.crm_quotes(id) on delete set null,
  from_bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete set null,
  to_quote_id uuid references public.crm_quotes(id) on delete set null,
  to_bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete set null,
  amount numeric(12, 2) not null default 0,
  credit_date date,
  note text,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.crm_accountability_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid references public.crm_jobs(id) on delete cascade,
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete cascade,
  task_type text not null,
  status text not null default 'open',
  title text not null,
  owner text not null default 'Unassigned',
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_accountability_tasks_type_check check (
    task_type in (
      'order_product',
      'collect_deposit',
      'collect_balance',
      'enter_cogs',
      'receive_product',
      'schedule_install',
      'bookkeeping_review',
      'pay_commission'
    )
  ),
  constraint crm_accountability_tasks_status_check check (
    status in ('open', 'done', 'blocked', 'canceled')
  )
);

create index if not exists crm_quote_bookkeeping_entries_quote_idx
on public.crm_quote_bookkeeping_entries (quote_id);

create unique index if not exists crm_quote_bookkeeping_entries_quote_unique_idx
on public.crm_quote_bookkeeping_entries (quote_id);

create index if not exists crm_quote_bookkeeping_entries_job_idx
on public.crm_quote_bookkeeping_entries (job_id);

create index if not exists crm_quote_bookkeeping_entries_sold_idx
on public.crm_quote_bookkeeping_entries (sold_date desc);

create index if not exists crm_quote_bookkeeping_payments_entry_idx
on public.crm_quote_bookkeeping_payments (bookkeeping_entry_id);

create index if not exists crm_quote_bookkeeping_payments_quote_idx
on public.crm_quote_bookkeeping_payments (quote_id);

create index if not exists crm_quote_bookkeeping_credits_entry_idx
on public.crm_quote_bookkeeping_credits (from_bookkeeping_entry_id, to_bookkeeping_entry_id);

create index if not exists crm_accountability_tasks_status_due_idx
on public.crm_accountability_tasks (status, due_at);

drop trigger if exists crm_quote_bookkeeping_entries_set_updated_at on public.crm_quote_bookkeeping_entries;
create trigger crm_quote_bookkeeping_entries_set_updated_at
before update on public.crm_quote_bookkeeping_entries
for each row
execute function public.set_updated_at();

drop trigger if exists crm_quote_bookkeeping_payments_set_updated_at on public.crm_quote_bookkeeping_payments;
create trigger crm_quote_bookkeeping_payments_set_updated_at
before update on public.crm_quote_bookkeeping_payments
for each row
execute function public.set_updated_at();

drop trigger if exists crm_quote_bookkeeping_credits_set_updated_at on public.crm_quote_bookkeeping_credits;
create trigger crm_quote_bookkeeping_credits_set_updated_at
before update on public.crm_quote_bookkeeping_credits
for each row
execute function public.set_updated_at();

drop trigger if exists crm_accountability_tasks_set_updated_at on public.crm_accountability_tasks;
create trigger crm_accountability_tasks_set_updated_at
before update on public.crm_accountability_tasks
for each row
execute function public.set_updated_at();

alter table public.crm_quote_bookkeeping_entries enable row level security;
alter table public.crm_quote_bookkeeping_payments enable row level security;
alter table public.crm_quote_bookkeeping_credits enable row level security;
alter table public.crm_accountability_tasks enable row level security;

drop policy if exists "service role can manage crm bookkeeping entries" on public.crm_quote_bookkeeping_entries;
create policy "service role can manage crm bookkeeping entries"
on public.crm_quote_bookkeeping_entries
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm bookkeeping payments" on public.crm_quote_bookkeeping_payments;
create policy "service role can manage crm bookkeeping payments"
on public.crm_quote_bookkeeping_payments
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm bookkeeping credits" on public.crm_quote_bookkeeping_credits;
create policy "service role can manage crm bookkeeping credits"
on public.crm_quote_bookkeeping_credits
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm accountability tasks" on public.crm_accountability_tasks;
create policy "service role can manage crm accountability tasks"
on public.crm_accountability_tasks
for all
to service_role
using (true)
with check (true);
