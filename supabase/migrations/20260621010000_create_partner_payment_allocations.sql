-- Job-level payment allocations for the unified Ken/Mike/Jessica payment ledger.
-- Payment batch history remains in crm_ken_payments and crm_commission_payments.

create table if not exists public.crm_ken_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payment_id uuid not null references public.crm_ken_payments(id) on delete cascade,
  source text not null,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete set null,
  job_id uuid references public.crm_jobs(id) on delete set null,
  item_key text not null,
  customer_name text not null,
  closed_at date,
  amount numeric(12, 2) not null default 0,
  period_month date,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_ken_payment_allocations_source_check check (
    source in ('manual', 'legacy_sheet', 'crm_quote')
  )
);

create table if not exists public.crm_commission_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payment_id uuid not null references public.crm_commission_payments(id) on delete cascade,
  recipient text not null,
  source text not null,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete set null,
  job_id uuid references public.crm_jobs(id) on delete set null,
  item_key text not null,
  customer_name text not null,
  closed_at date,
  amount numeric(12, 2) not null default 0,
  period_month date,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_commission_payment_allocations_recipient_check check (
    recipient in ('mike', 'jessica')
  ),
  constraint crm_commission_payment_allocations_source_check check (
    source in ('manual', 'legacy_sheet', 'crm_quote')
  )
);

create index if not exists crm_ken_payment_allocations_payment_idx
on public.crm_ken_payment_allocations (payment_id);

create index if not exists crm_ken_payment_allocations_item_idx
on public.crm_ken_payment_allocations (item_key);

create index if not exists crm_commission_payment_allocations_payment_idx
on public.crm_commission_payment_allocations (payment_id);

create index if not exists crm_commission_payment_allocations_recipient_item_idx
on public.crm_commission_payment_allocations (recipient, item_key);

drop trigger if exists crm_ken_payment_allocations_set_updated_at on public.crm_ken_payment_allocations;
create trigger crm_ken_payment_allocations_set_updated_at
before update on public.crm_ken_payment_allocations
for each row
execute function public.set_updated_at();

drop trigger if exists crm_commission_payment_allocations_set_updated_at on public.crm_commission_payment_allocations;
create trigger crm_commission_payment_allocations_set_updated_at
before update on public.crm_commission_payment_allocations
for each row
execute function public.set_updated_at();

alter table public.crm_ken_payment_allocations enable row level security;
alter table public.crm_commission_payment_allocations enable row level security;

drop policy if exists "service role can manage crm ken payment allocations"
on public.crm_ken_payment_allocations;
create policy "service role can manage crm ken payment allocations"
on public.crm_ken_payment_allocations
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm commission payment allocations"
on public.crm_commission_payment_allocations;
create policy "service role can manage crm commission payment allocations"
on public.crm_commission_payment_allocations
for all
to service_role
using (true)
with check (true);

create or replace function public.crm_create_ken_payment_batch(
  p_paid_on date,
  p_period_month date,
  p_amount numeric,
  p_note text,
  p_created_by_email text,
  p_meta jsonb,
  p_allocations jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_allocation jsonb;
begin
  insert into public.crm_ken_payments (
    paid_on,
    period_month,
    amount,
    note,
    created_by_email,
    meta
  ) values (
    p_paid_on,
    p_period_month,
    p_amount,
    p_note,
    p_created_by_email,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_payment_id;

  for v_allocation in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    insert into public.crm_ken_payment_allocations (
      payment_id,
      source,
      quote_id,
      bookkeeping_entry_id,
      job_id,
      item_key,
      customer_name,
      closed_at,
      amount,
      period_month,
      meta
    ) values (
      v_payment_id,
      v_allocation->>'source',
      nullif(v_allocation->>'quote_id', '')::uuid,
      nullif(v_allocation->>'bookkeeping_entry_id', '')::uuid,
      nullif(v_allocation->>'job_id', '')::uuid,
      v_allocation->>'item_key',
      v_allocation->>'customer_name',
      nullif(v_allocation->>'closed_at', '')::date,
      (v_allocation->>'amount')::numeric,
      nullif(v_allocation->>'period_month', '')::date,
      coalesce(v_allocation->'meta', '{}'::jsonb)
    );
  end loop;

  return v_payment_id;
end;
$$;

create or replace function public.crm_create_commission_payment_batch(
  p_recipient text,
  p_paid_on date,
  p_period_month date,
  p_amount numeric,
  p_note text,
  p_created_by_email text,
  p_meta jsonb,
  p_allocations jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_allocation jsonb;
begin
  if p_recipient not in ('mike', 'jessica') then
    raise exception 'invalid commission recipient';
  end if;

  insert into public.crm_commission_payments (
    recipient,
    paid_on,
    period_month,
    amount,
    note,
    created_by_email,
    meta
  ) values (
    p_recipient,
    p_paid_on,
    p_period_month,
    p_amount,
    p_note,
    p_created_by_email,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_payment_id;

  for v_allocation in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    insert into public.crm_commission_payment_allocations (
      payment_id,
      recipient,
      source,
      quote_id,
      bookkeeping_entry_id,
      job_id,
      item_key,
      customer_name,
      closed_at,
      amount,
      period_month,
      meta
    ) values (
      v_payment_id,
      p_recipient,
      v_allocation->>'source',
      nullif(v_allocation->>'quote_id', '')::uuid,
      nullif(v_allocation->>'bookkeeping_entry_id', '')::uuid,
      nullif(v_allocation->>'job_id', '')::uuid,
      v_allocation->>'item_key',
      v_allocation->>'customer_name',
      nullif(v_allocation->>'closed_at', '')::date,
      (v_allocation->>'amount')::numeric,
      nullif(v_allocation->>'period_month', '')::date,
      coalesce(v_allocation->'meta', '{}'::jsonb)
    );
  end loop;

  return v_payment_id;
end;
$$;

grant execute on function public.crm_create_ken_payment_batch(date, date, numeric, text, text, jsonb, jsonb)
to service_role;

grant execute on function public.crm_create_commission_payment_batch(text, date, date, numeric, text, text, jsonb, jsonb)
to service_role;
