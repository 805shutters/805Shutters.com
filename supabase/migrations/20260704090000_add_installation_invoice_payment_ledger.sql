alter table public.crm_installation_invoice_emails
  add column if not exists installation_invoice_paid_at date,
  add column if not exists installation_invoice_paid_amount numeric(12, 2) not null default 0,
  add column if not exists installation_invoice_payment_method text,
  add column if not exists installation_invoice_payment_notes text;

alter table public.crm_quote_bookkeeping_entries
  add column if not exists installation_invoice_paid_at date,
  add column if not exists installation_invoice_paid_amount numeric(12, 2) not null default 0,
  add column if not exists installation_invoice_payment_method text,
  add column if not exists installation_invoice_payment_notes text;

alter table public.crm_installation_invoice_emails
  drop constraint if exists crm_installation_invoice_emails_paid_amount_check,
  add constraint crm_installation_invoice_emails_paid_amount_check
    check (installation_invoice_paid_amount >= 0);

alter table public.crm_quote_bookkeeping_entries
  drop constraint if exists crm_quote_bookkeeping_entries_install_paid_amount_check,
  add constraint crm_quote_bookkeeping_entries_install_paid_amount_check
    check (installation_invoice_paid_amount >= 0);

create index if not exists crm_installation_invoice_emails_paid_idx
on public.crm_installation_invoice_emails (installation_invoice_paid_at, created_at desc);

create index if not exists crm_bookkeeping_install_invoice_paid_idx
on public.crm_quote_bookkeeping_entries (installation_invoice_paid_at, sold_date desc);
