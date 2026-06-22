-- ============================================================================
-- 805 CRM — pending production schema (run once in the Supabase SQL Editor)
-- ============================================================================
-- Combines the migrations the deployed app needs but that a code deploy
-- does NOT apply on its own:
--   * 20260610000000_profit_split_50_50.sql   (ken_cut_override + job expenses)
--   * 20260617000000_create_ken_payments_and_settings.sql (Ken checks + payoff)
--   * 20260620000000_create_installation_invoice_email_ingest.sql (Gmail invoice puller)
--   * 20260621000000_create_order_cogs_and_commission_payments.sql
--   * 20260621010000_create_partner_payment_allocations.sql
--   * 20260621020000_allow_remake_job_expenses.sql (Remake expense category)
--
-- Safe to run anytime: every statement is idempotent (IF NOT EXISTS / IF EXISTS
-- / ON CONFLICT DO NOTHING), so re-running causes no harm if already applied.
-- ============================================================================

-- ---- Ken-cut override (per-row) -------------------------------------------
alter table public.crm_quote_bookkeeping_entries
  add column if not exists ken_cut_override numeric(12, 2);

-- ---- Per-job expenses ------------------------------------------------------
create table if not exists public.crm_job_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete cascade,
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete set null,
  label text not null,
  category text not null default 'other',
  amount numeric(12, 2) not null default 0,
  incurred_on date,
  notes text,
  source text not null default 'manual',
  meta jsonb not null default '{}'::jsonb,
  constraint crm_job_expenses_category_check check (
    category in ('materials', 'installation_extra', 'processing_fee', 'permit', 'repair', 'remake', 'referral', 'other')
  ),
  constraint crm_job_expenses_source_check check (
    source in ('crm_quote', 'legacy_sheet', 'manual')
  ),
  constraint crm_job_expenses_target_check check (
    bookkeeping_entry_id is not null or quote_id is not null or job_id is not null
  )
);

alter table public.crm_job_expenses
  drop constraint if exists crm_job_expenses_category_check;

alter table public.crm_job_expenses
  add constraint crm_job_expenses_category_check check (
    category in ('materials', 'installation_extra', 'processing_fee', 'permit', 'repair', 'remake', 'referral', 'other')
  );

create index if not exists crm_job_expenses_entry_idx on public.crm_job_expenses (bookkeeping_entry_id);
create index if not exists crm_job_expenses_quote_idx on public.crm_job_expenses (quote_id);
create index if not exists crm_job_expenses_job_idx on public.crm_job_expenses (job_id);

drop trigger if exists crm_job_expenses_set_updated_at on public.crm_job_expenses;
create trigger crm_job_expenses_set_updated_at
before update on public.crm_job_expenses
for each row execute function public.set_updated_at();

alter table public.crm_job_expenses enable row level security;
drop policy if exists "service role can manage crm job expenses" on public.crm_job_expenses;
create policy "service role can manage crm job expenses"
on public.crm_job_expenses for all to service_role using (true) with check (true);

-- ---- Business payoff settings (key/value) ---------------------------------
create table if not exists public.crm_settings (
  key text primary key,
  value numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.crm_settings (key, value) values
  ('payoff_target', 500000),
  ('ken_opening_balance', 0)
on conflict (key) do nothing;

-- ---- Ken payments (each check cut to Ken) ---------------------------------
create table if not exists public.crm_ken_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_on date,
  period_month date,
  amount numeric(12, 2) not null default 0,
  note text,
  created_by_email text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists crm_ken_payments_paid_on_idx on public.crm_ken_payments (paid_on desc);

drop trigger if exists crm_settings_set_updated_at on public.crm_settings;
create trigger crm_settings_set_updated_at
before update on public.crm_settings
for each row execute function public.set_updated_at();

drop trigger if exists crm_ken_payments_set_updated_at on public.crm_ken_payments;
create trigger crm_ken_payments_set_updated_at
before update on public.crm_ken_payments
for each row execute function public.set_updated_at();

alter table public.crm_settings enable row level security;
alter table public.crm_ken_payments enable row level security;

drop policy if exists "service role can manage crm settings" on public.crm_settings;
create policy "service role can manage crm settings"
on public.crm_settings for all to service_role using (true) with check (true);

drop policy if exists "service role can manage crm ken payments" on public.crm_ken_payments;
create policy "service role can manage crm ken payments"
on public.crm_ken_payments for all to service_role using (true) with check (true);

-- ---- Order COGS Gmail ingest ---------------------------------------------
create table if not exists public.crm_order_cogs_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mailbox_email text not null default '805shutters@gmail.com',
  gmail_message_id text not null,
  gmail_thread_id text,
  gmail_history_id text,
  from_email text,
  to_email text,
  subject text,
  sent_at timestamptz,
  snippet text,
  attachment_names text[] not null default '{}'::text[],
  email_url text,
  extracted_customer_name text,
  extracted_order_amount numeric(12, 2),
  extracted_order_number text,
  extraction_confidence numeric(5, 4) not null default 0,
  matched_job_id uuid references public.crm_jobs(id) on delete set null,
  matched_quote_id uuid references public.crm_quotes(id) on delete set null,
  matched_bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete set null,
  match_status text not null default 'needs_review',
  match_confidence numeric(5, 4) not null default 0,
  match_reason text,
  processed_at timestamptz,
  applied_at timestamptz,
  error_message text,
  raw jsonb not null default '{}'::jsonb,
  constraint crm_order_cogs_emails_message_unique unique (gmail_message_id),
  constraint crm_order_cogs_emails_status_check check (
    match_status in ('matched', 'needs_review', 'unmatched', 'skipped', 'error')
  ),
  constraint crm_order_cogs_emails_extraction_confidence_check check (
    extraction_confidence >= 0 and extraction_confidence <= 1
  ),
  constraint crm_order_cogs_emails_match_confidence_check check (
    match_confidence >= 0 and match_confidence <= 1
  )
);

create index if not exists crm_order_cogs_emails_mailbox_processed_idx
on public.crm_order_cogs_emails (mailbox_email, processed_at desc);

create index if not exists crm_order_cogs_emails_status_idx
on public.crm_order_cogs_emails (match_status, created_at desc);

create index if not exists crm_order_cogs_emails_entry_idx
on public.crm_order_cogs_emails (matched_bookkeeping_entry_id);

create index if not exists crm_order_cogs_emails_job_idx
on public.crm_order_cogs_emails (matched_job_id);

drop trigger if exists crm_order_cogs_emails_set_updated_at on public.crm_order_cogs_emails;
create trigger crm_order_cogs_emails_set_updated_at
before update on public.crm_order_cogs_emails
for each row execute function public.set_updated_at();

alter table public.crm_order_cogs_emails enable row level security;

drop policy if exists "service role can manage crm order cogs emails"
on public.crm_order_cogs_emails;
create policy "service role can manage crm order cogs emails"
on public.crm_order_cogs_emails
for all
to service_role
using (true)
with check (true);

-- ---- Mike/Jessica commission payments ------------------------------------
create table if not exists public.crm_commission_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recipient text not null,
  paid_on date,
  period_month date,
  amount numeric(12, 2) not null default 0,
  note text,
  created_by_email text,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_commission_payments_recipient_check check (
    recipient in ('mike', 'jessica')
  )
);

create index if not exists crm_commission_payments_recipient_paid_on_idx
on public.crm_commission_payments (recipient, paid_on desc);

create index if not exists crm_commission_payments_period_idx
on public.crm_commission_payments (period_month desc);

drop trigger if exists crm_commission_payments_set_updated_at on public.crm_commission_payments;
create trigger crm_commission_payments_set_updated_at
before update on public.crm_commission_payments
for each row execute function public.set_updated_at();

alter table public.crm_commission_payments enable row level security;

drop policy if exists "service role can manage crm commission payments"
on public.crm_commission_payments;
create policy "service role can manage crm commission payments"
on public.crm_commission_payments
for all
to service_role
using (true)
with check (true);

-- ---- Partner payment allocation rows and batch RPCs -----------------------
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
for each row execute function public.set_updated_at();

drop trigger if exists crm_commission_payment_allocations_set_updated_at on public.crm_commission_payment_allocations;
create trigger crm_commission_payment_allocations_set_updated_at
before update on public.crm_commission_payment_allocations
for each row execute function public.set_updated_at();

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

-- ---- Installation invoice Gmail ingest ------------------------------------
create table if not exists public.crm_installation_invoice_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mailbox_email text not null default '805shutters@gmail.com',
  gmail_message_id text not null,
  gmail_thread_id text,
  gmail_history_id text,
  from_email text,
  to_email text,
  subject text,
  sent_at timestamptz,
  snippet text,
  attachment_names text[] not null default '{}'::text[],
  email_url text,
  extracted_customer_name text,
  extracted_invoice_amount numeric(12, 2),
  extracted_invoice_number text,
  extraction_confidence numeric(5, 4) not null default 0,
  matched_job_id uuid references public.crm_jobs(id) on delete set null,
  matched_quote_id uuid references public.crm_quotes(id) on delete set null,
  matched_bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete set null,
  match_status text not null default 'needs_review',
  match_confidence numeric(5, 4) not null default 0,
  match_reason text,
  processed_at timestamptz,
  applied_at timestamptz,
  error_message text,
  raw jsonb not null default '{}'::jsonb,
  constraint crm_installation_invoice_emails_message_unique unique (gmail_message_id),
  constraint crm_installation_invoice_emails_status_check check (
    match_status in ('matched', 'needs_review', 'unmatched', 'skipped', 'error')
  ),
  constraint crm_installation_invoice_emails_extraction_confidence_check check (
    extraction_confidence >= 0 and extraction_confidence <= 1
  ),
  constraint crm_installation_invoice_emails_match_confidence_check check (
    match_confidence >= 0 and match_confidence <= 1
  )
);

create index if not exists crm_installation_invoice_emails_mailbox_processed_idx
on public.crm_installation_invoice_emails (mailbox_email, processed_at desc);

create index if not exists crm_installation_invoice_emails_status_idx
on public.crm_installation_invoice_emails (match_status, created_at desc);

create index if not exists crm_installation_invoice_emails_entry_idx
on public.crm_installation_invoice_emails (matched_bookkeeping_entry_id);

create index if not exists crm_installation_invoice_emails_job_idx
on public.crm_installation_invoice_emails (matched_job_id);

drop trigger if exists crm_installation_invoice_emails_set_updated_at on public.crm_installation_invoice_emails;
create trigger crm_installation_invoice_emails_set_updated_at
before update on public.crm_installation_invoice_emails
for each row execute function public.set_updated_at();

alter table public.crm_installation_invoice_emails enable row level security;

drop policy if exists "service role can manage crm installation invoice emails"
on public.crm_installation_invoice_emails;
create policy "service role can manage crm installation invoice emails"
on public.crm_installation_invoice_emails
for all
to service_role
using (true)
with check (true);

-- ---- Activity audit log: allow the new entity types (final superset) ------
alter table public.crm_activity_events drop constraint if exists crm_activity_events_entity_type_check;
alter table public.crm_activity_events
  add constraint crm_activity_events_entity_type_check check (
    entity_type in (
      'job', 'quote', 'bookkeeping_entry', 'bookkeeping_payment', 'expense',
      'calendar_event', 'customer', 'ken_payment', 'commission_payment',
      'order_cogs_email', 'settings', 'session', 'system'
    )
  );

-- ---- Per-line quote discount (applies at pricing time) ---------------------
-- 20260622120000_add_line_item_discount_percent.sql
alter table public.crm_quote_line_items
  add column if not exists discount_percent numeric(5, 2) not null default 0;

alter table public.crm_quote_line_items
  drop constraint if exists crm_quote_line_items_discount_percent_check;
alter table public.crm_quote_line_items
  add constraint crm_quote_line_items_discount_percent_check
  check (discount_percent >= 0 and discount_percent <= 100);
