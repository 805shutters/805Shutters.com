-- Each signed contract gets its own durable technical measure. Archival remains
-- metadata so the form, lines, contract association, and audit history survive.

alter table public.crm_technical_measure_forms
  drop constraint if exists crm_technical_measure_forms_job_unique;

create unique index if not exists crm_technical_measure_forms_quote_unique
  on public.crm_technical_measure_forms (quote_id);

create index if not exists crm_technical_measure_forms_customer_idx
  on public.crm_technical_measure_forms (customer_id, updated_at desc);
