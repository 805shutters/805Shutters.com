alter table public.crm_quotes
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists customer_signature text,
  add column if not exists customer_printed_name text,
  add column if not exists signed_at timestamptz,
  add column if not exists share_token text;

create unique index if not exists crm_quotes_share_token_unique_idx
on public.crm_quotes (share_token)
where share_token is not null;

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'crm',
  display_name text not null,
  normalized_name text not null,
  phone text,
  email text,
  address text,
  city text,
  first_sold_date date,
  latest_sold_date date,
  latest_status text,
  lifetime_value numeric(12, 2) not null default 0,
  open_balance numeric(12, 2) not null default 0,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_customers_source_check check (
    source in ('crm', 'bookkeeping_import', 'manual')
  )
);

create table if not exists public.crm_customer_products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_id uuid references public.crm_customers(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete cascade,
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete cascade,
  room text,
  product_type text not null default 'Window Treatments',
  description text,
  width text,
  height text,
  quantity integer not null default 1,
  supplier text,
  material text,
  fabric text,
  color text,
  control_type text,
  mount_type text,
  unit_price numeric(12, 2) not null default 0,
  total_price numeric(12, 2) not null default 0,
  status text,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.crm_customer_contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_id uuid references public.crm_customers(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete cascade,
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete cascade,
  title text not null,
  contract_url text,
  share_token text,
  status text,
  signed_at timestamptz,
  total_amount numeric(12, 2) not null default 0,
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists crm_customers_normalized_unique_idx
on public.crm_customers (normalized_name);

create index if not exists crm_customer_products_customer_idx
on public.crm_customer_products (customer_id);

create index if not exists crm_customer_products_quote_idx
on public.crm_customer_products (quote_id);

create index if not exists crm_customer_products_bookkeeping_entry_idx
on public.crm_customer_products (bookkeeping_entry_id);

create index if not exists crm_customer_contracts_customer_idx
on public.crm_customer_contracts (customer_id);

create index if not exists crm_customer_contracts_quote_idx
on public.crm_customer_contracts (quote_id);

create index if not exists crm_customer_contracts_share_token_idx
on public.crm_customer_contracts (share_token);

drop trigger if exists crm_customers_set_updated_at on public.crm_customers;
create trigger crm_customers_set_updated_at
before update on public.crm_customers
for each row
execute function public.set_updated_at();

drop trigger if exists crm_customer_products_set_updated_at on public.crm_customer_products;
create trigger crm_customer_products_set_updated_at
before update on public.crm_customer_products
for each row
execute function public.set_updated_at();

drop trigger if exists crm_customer_contracts_set_updated_at on public.crm_customer_contracts;
create trigger crm_customer_contracts_set_updated_at
before update on public.crm_customer_contracts
for each row
execute function public.set_updated_at();

alter table public.crm_customers enable row level security;
alter table public.crm_customer_products enable row level security;
alter table public.crm_customer_contracts enable row level security;

drop policy if exists "service role can manage crm customers" on public.crm_customers;
create policy "service role can manage crm customers"
on public.crm_customers
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm customer products" on public.crm_customer_products;
create policy "service role can manage crm customer products"
on public.crm_customer_products
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm customer contracts" on public.crm_customer_contracts;
create policy "service role can manage crm customer contracts"
on public.crm_customer_contracts
for all
to service_role
using (true)
with check (true);
