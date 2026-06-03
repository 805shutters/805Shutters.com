alter table public.crm_jobs
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_quotes
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_quote_bookkeeping_entries
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_quote_bookkeeping_payments
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_quote_bookkeeping_credits
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_customers
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_customer_products
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.crm_customer_contracts
  add column if not exists external_source text,
  add column if not exists external_id text;

create unique index if not exists crm_jobs_external_unique_idx
on public.crm_jobs (external_source, external_id)
;

create unique index if not exists crm_quotes_external_unique_idx
on public.crm_quotes (external_source, external_id)
;

create unique index if not exists crm_quote_bookkeeping_entries_external_unique_idx
on public.crm_quote_bookkeeping_entries (external_source, external_id)
;

create unique index if not exists crm_quote_bookkeeping_payments_external_unique_idx
on public.crm_quote_bookkeeping_payments (external_source, external_id)
;

create unique index if not exists crm_quote_bookkeeping_credits_external_unique_idx
on public.crm_quote_bookkeeping_credits (external_source, external_id)
;

create unique index if not exists crm_customer_products_external_unique_idx
on public.crm_customer_products (external_source, external_id)
;

create unique index if not exists crm_customer_contracts_external_unique_idx
on public.crm_customer_contracts (external_source, external_id)
;
