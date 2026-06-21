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
for each row
execute function public.set_updated_at();

alter table public.crm_installation_invoice_emails enable row level security;

drop policy if exists "service role can manage crm installation invoice emails"
on public.crm_installation_invoice_emails;
create policy "service role can manage crm installation invoice emails"
on public.crm_installation_invoice_emails
for all
to service_role
using (true)
with check (true);
