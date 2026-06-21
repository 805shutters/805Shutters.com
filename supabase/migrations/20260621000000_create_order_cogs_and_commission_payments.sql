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
for each row
execute function public.set_updated_at();

alter table public.crm_order_cogs_emails enable row level security;

drop policy if exists "service role can manage crm order cogs emails"
on public.crm_order_cogs_emails;
create policy "service role can manage crm order cogs emails"
on public.crm_order_cogs_emails
for all
to service_role
using (true)
with check (true);

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
for each row
execute function public.set_updated_at();

alter table public.crm_commission_payments enable row level security;

drop policy if exists "service role can manage crm commission payments"
on public.crm_commission_payments;
create policy "service role can manage crm commission payments"
on public.crm_commission_payments
for all
to service_role
using (true)
with check (true);

alter table public.crm_activity_events drop constraint if exists crm_activity_events_entity_type_check;
alter table public.crm_activity_events
  add constraint crm_activity_events_entity_type_check check (
    entity_type in (
      'job',
      'quote',
      'bookkeeping_entry',
      'bookkeeping_payment',
      'expense',
      'calendar_event',
      'customer',
      'ken_payment',
      'commission_payment',
      'order_cogs_email',
      'settings',
      'session',
      'system'
    )
  );
