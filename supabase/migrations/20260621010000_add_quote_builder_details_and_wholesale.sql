-- Quote builder detail selections + internal wholesale snapshots.
--
-- details stores structured non-price options (mount, color, louver, control side,
-- etc.) so the CRM can build manufacturer-ready quotes without stuffing product
-- choices into notes. wholesale_unit_price is internal-only and never projected
-- through the public quote API.

alter table public.crm_quote_designs
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists wholesale_unit_price numeric(12, 2);
