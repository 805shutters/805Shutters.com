-- ============================================================================
-- 805 CRM — pending production schema (run once in the Supabase SQL Editor)
-- ============================================================================
-- Combines the migrations the deployed app needs but that a code deploy
-- does NOT apply on its own:
--   * 20260610000000_profit_split_50_50.sql   (ken_cut_override + job expenses)
--   * 20260617000000_create_ken_payments_and_settings.sql (Ken checks + payoff)
--   * 20260620000000_create_installation_invoice_email_ingest.sql (Gmail invoice puller)
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
    category in ('materials', 'installation_extra', 'processing_fee', 'permit', 'repair', 'referral', 'other')
  ),
  constraint crm_job_expenses_source_check check (
    source in ('crm_quote', 'legacy_sheet', 'manual')
  ),
  constraint crm_job_expenses_target_check check (
    bookkeeping_entry_id is not null or quote_id is not null or job_id is not null
  )
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

-- ---- Installation invoice Gmail ingest ------------------------------------
create table if not exists public.crm_installation_invoice_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mailbox_email text not null default '805@805shutters.com',
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
      'calendar_event', 'customer', 'ken_payment', 'settings', 'session', 'system'
    )
  );
