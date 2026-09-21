-- Complete the active-read contract for the deployed draft line archive.
-- The base table, designs and immutable snapshots remain available for history.
create or replace view public.sales_quote_active_line_items
with (security_invoker = true) as
select * from public.sales_quote_line_items where archived_at is null;
revoke all on public.sales_quote_active_line_items from public, anon, authenticated;
grant select on public.sales_quote_active_line_items to authenticated;
grant all on public.sales_quote_active_line_items to service_role;

-- Restrict current quote work to active lines while retaining the existing
-- authentication, role, revision, frozen quote and snapshot integrity checks.
-- The simple view retains row locks and supports DELETE for unpriced lines.
do $migration$
declare fn record; original text; definition text;
begin
  for fn in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname = any(array[
      'mutate_quote_v2_structure', 'save_quote_v2_pricing_result',
      'save_quote_v2_catalog_pricing_batch', 'save_quote_v2_pricing_batch',
      'set_sales_quote_line_price', 'apply_quote_v2_custom_override',
      'prepare_native_quote_customer_snapshot', 'prepare_quote_v2_customer_send',
      'reserve_native_quote_delivery', 'crm_mark_measure_product_ordered',
      'quote_v2_legacy_state_hash',
      'enforce_v2_quote_line_limit', 'record_quote_v2_legacy_reprice_preview'
    ])
  loop
    original := pg_get_functiondef(fn.oid);
    definition := regexp_replace(original,
      '(from|join)([[:space:]]+)public[.]sales_quote_line_items\M',
      '\1\2public.sales_quote_active_line_items', 'gi');
    if definition = original then
      raise exception 'Expected active-line reads not found in %; refusing partial migration.', fn.proname;
    end if;
    execute definition;
  end loop;
end $migration$;
