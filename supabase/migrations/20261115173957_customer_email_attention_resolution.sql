-- Staff can mark one customer-email attention row handled.
-- Signing and paid-in-full mail both live on this outbox. The health monitor
-- reads no other outbox, so the columns are added only here.
-- Existing rows stay unchanged. There is no backfill.
-- Apply by hand after merge. Needs Mike's approval.

alter table public.crm_customer_signed_contract_email_outbox
  add column attention_resolved_at timestamptz,
  add column attention_resolved_by text,
  add column attention_resolved_note text;

comment on column public.crm_customer_signed_contract_email_outbox.attention_resolved_at is
  'When a signed-in CRM user marked this attention row handled. Null keeps the row in the health count.';
comment on column public.crm_customer_signed_contract_email_outbox.attention_resolved_by is
  'Signed-in CRM user who marked the row handled.';
comment on column public.crm_customer_signed_contract_email_outbox.attention_resolved_note is
  'Optional staff note. It is not sent to the customer.';
