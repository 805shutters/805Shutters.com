-- Manual prices are per window. Preserve their saved price and validated per-window
-- service charge when a legacy line quantity changes; do not reuse an old line total.
-- Automatic catalog snapshots retain their strict current-quantity validation.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.save_norman_quote_pricing(uuid,jsonb,jsonb,uuid)'::regprocedure) into definition;
  updated := replace(definition,$old$    coalesce(sum(case when chosen.options_json->'manual_price_override'='true'::jsonb and
      chosen.options_json->>'manual_customer_charge_policy' is distinct from 'blind-shade-install-ship-v1' then 0 else
$old$,$new$    coalesce(sum(case when chosen.options_json->'manual_price_override'='true'::jsonb then
      case when chosen.options_json->>'manual_customer_charge_policy'='blind-shade-install-ship-v1' then
        coalesce((public.quote_customer_charges(chosen.options_json->'customer_charges')->>'perWindowTotal')::numeric,0)*li.quantity
      else 0 end else
$new$);
  if updated=definition then raise exception 'Legacy manual quantity charge patch target changed.'; end if;
  execute updated;
end $migration$;
