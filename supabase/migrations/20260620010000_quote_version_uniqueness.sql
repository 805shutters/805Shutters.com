-- Hardening for whole-quote versions (audit batch D).
--
-- M6: only ONE version per group may be signed/sold. Without this, two sibling
-- version links signed at nearly the same instant can both flip to "sold" and
-- each get a bookkeeping entry (double billing). The app layer resolves the race
-- to a single winner; this index is the DB-level backstop.
--
-- M5: version labels (A/B/C) must be unique within a group. Concurrent version
-- creation could otherwise produce two "B"s.
--
-- Both are partial indexes scoped to grouped quotes, so ungrouped quotes are
-- unaffected (their quote_group_id is null and null values are distinct).

create unique index if not exists crm_quotes_one_signed_per_group
  on public.crm_quotes (quote_group_id)
  where quote_group_id is not null and signed_at is not null;

create unique index if not exists crm_quotes_unique_label_per_group
  on public.crm_quotes (quote_group_id, quote_label)
  where quote_group_id is not null and quote_label is not null;
