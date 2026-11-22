-- Opt-in registry backfill. Do not run this from a migration or the app.
--
-- What it changes:
--   Inserts one registry row for each distinct quote_number currently stored
--   on public.sales_quotes or public.crm_quotes, including soft-deleted rows
--   that are still in those tables.
--   Duplicate CRM numbers such as 805-0078 are stored once.
--   It does not update, renumber, or delete any quote row.
--   After it runs, allocate_805_quote_id will not issue those exact strings.
--   Numbers that were hard-deleted before this script cannot be recovered.

insert into public.crm_issued_quote_ids (quote_number, source)
select distinct btrim(quote_number), 'backfill_sales_quotes'
from public.sales_quotes
where nullif(btrim(quote_number), '') is not null
on conflict (quote_number) do nothing;

insert into public.crm_issued_quote_ids (quote_number, source)
select distinct btrim(quote_number), 'backfill_crm_quotes'
from public.crm_quotes
where nullif(btrim(quote_number), '') is not null
on conflict (quote_number) do nothing;
