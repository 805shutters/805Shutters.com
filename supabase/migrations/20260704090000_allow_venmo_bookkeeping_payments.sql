alter table public.crm_quote_bookkeeping_entries
  drop constraint if exists crm_quote_bookkeeping_entries_payment_type_check;

alter table public.crm_quote_bookkeeping_entries
  add constraint crm_quote_bookkeeping_entries_payment_type_check check (
    payment_type is null or payment_type in ('zelle', 'cash', 'check', 'credit_card', 'venmo', 'other')
  );

alter table public.crm_quote_bookkeeping_payments
  drop constraint if exists crm_quote_bookkeeping_payments_payment_type_check;

alter table public.crm_quote_bookkeeping_payments
  add constraint crm_quote_bookkeeping_payments_payment_type_check check (
    payment_type in ('zelle', 'cash', 'check', 'credit_card', 'venmo', 'other')
  );
