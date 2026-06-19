-- Whole-quote versions ("Quote A / Quote B / Quote C").
-- Sibling crm_quotes that share a quote_group_id are alternative whole quotes the
-- customer can compare and pick ONE of. Each version is an independent quote with
-- its own line items.
--
-- Bookkeeping rule (kept clean on purpose): alternative versions do NOT get a
-- bookkeeping entry on creation, so unsold alternatives never inflate the pipeline.
-- An entry is ensured only when a version is actually sold (see public-quote.ts).

alter table public.crm_quotes
  add column if not exists quote_group_id uuid,
  add column if not exists quote_label text;

create index if not exists crm_quotes_group_idx
  on public.crm_quotes (quote_group_id)
  where quote_group_id is not null;
