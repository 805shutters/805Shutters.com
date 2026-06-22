-- Per-line discount: a percent (0-100) applied to a window's retail price
-- (base + surcharges + motorization) at pricing time. Defaults to 0 (no discount)
-- so existing line items are unaffected. Wholesale/cost and once charges
-- (e.g. freight) are never discounted — only the per-window retail total.
--
-- Idempotent: safe to re-run.
alter table public.crm_quote_line_items
  add column if not exists discount_percent numeric(5, 2) not null default 0;

alter table public.crm_quote_line_items
  drop constraint if exists crm_quote_line_items_discount_percent_check;
alter table public.crm_quote_line_items
  add constraint crm_quote_line_items_discount_percent_check
  check (discount_percent >= 0 and discount_percent <= 100);
