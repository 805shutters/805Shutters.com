-- Known customer retail may be saved without inventing dealer cost. Historical rows are unchanged.
-- Apply after installation/shipping helpers, unchanged-manual saver, and manual-charge patches.
create or replace function public.quote_v2_has_unresolved_quote_cost(p_retail jsonb,p_cost jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_retail) is distinct from 'object'
    or p_retail->>'quotePricingPolicy' is distinct from 'grid_options_quote_v1'
    or coalesce(p_retail->>'catalogAsOf','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    or p_retail->>'catalogAsOf' < '2026-09-21'
    or jsonb_typeof(p_cost) is distinct from 'object'
    or p_cost->>'quotePricingPolicy' is distinct from 'grid_options_quote_v1'
    or p_cost->>'status' is distinct from 'unresolved'
    or p_cost->>'costStatus' is distinct from 'incomplete'
    or p_cost->'landedCostTotal' is distinct from 'null'::jsonb
  then return false; end if;
  foreach k in array array['productCostUnit','productCostTotal','freightAllocated','oversizeAllocated','processingFeeAllocated'] loop
    v := p_cost->k;
    if v is null then return false; end if;
    if jsonb_typeof(v)='number' then
      if (v #>> '{}')::numeric < 0 then return false; end if;
    elsif v is distinct from 'null'::jsonb then return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.quote_v2_has_unresolved_quote_cost(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.quote_v2_has_unresolved_quote_cost(jsonb,jsonb) to service_role;

alter table public.sales_quote_v2_price_snapshots alter column internal_landed_cost_total drop not null;
alter table public.sales_quote_v2_price_snapshots add constraint sales_quote_v2_explicit_unknown_cost_check
  check (internal_landed_cost_total is not null or public.quote_v2_has_unresolved_quote_cost(retail_snapshot,internal_cost_snapshot));

alter table public.crm_quotes alter column materials_cost drop not null;
alter table public.crm_quotes add constraint crm_quotes_explicit_unknown_cost_check check (materials_cost is not null or (meta->>'quote_cost_status'='unresolved' and meta->>'quotePricingPolicy'='grid_options_quote_v1') is true);

do $migration$
declare definition text; previous text;
begin
  definition := pg_get_functiondef('public.save_quote_v2_catalog_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure);
  previous := definition;
  definition := replace(definition,$old$  v_internal_total numeric(12, 2);$old$,$new$  v_internal_total numeric(12, 2);
  v_unresolved_cost boolean;$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  previous := definition;
  definition := replace(definition,$old$      if jsonb_typeof(v_internal_cost_snapshot) is distinct from 'object'
        or jsonb_typeof(v_internal_cost_snapshot -> 'productCostTotal')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'freightAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'oversizeAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'processingFeeAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'landedCostTotal')
            is distinct from 'number'
      then
        raise exception 'An authoritative protected-cost snapshot is required for every priced line.'
          using errcode = '22023';
      end if;

$old$,$new$      v_unresolved_cost := public.quote_v2_has_unresolved_quote_cost(v_authoritative_snapshot,v_internal_cost_snapshot);
      if not v_unresolved_cost then
      if jsonb_typeof(v_internal_cost_snapshot) is distinct from 'object'
        or jsonb_typeof(v_internal_cost_snapshot -> 'productCostTotal')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'freightAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'oversizeAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'processingFeeAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'landedCostTotal')
            is distinct from 'number'
      then
        raise exception 'An authoritative protected-cost snapshot is required for every priced line.'
          using errcode = '22023';
      end if;

      end if;

$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  previous := definition;
  definition := replace(definition,$old$        or v_internal_total is null or v_internal_total < 0$old$,$new$        or (not v_unresolved_cost and (v_internal_total is null or v_internal_total < 0))$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  previous := definition;
  definition := replace(definition,$old$      if (v_internal_cost_snapshot ->> 'productCostTotal')::numeric < 0
        or (v_internal_cost_snapshot ->> 'freightAllocated')::numeric < 0
        or (v_internal_cost_snapshot ->> 'oversizeAllocated')::numeric < 0
        or (v_internal_cost_snapshot ->> 'processingFeeAllocated')::numeric < 0
        or round(v_internal_total, 2) is distinct from round(
          (v_internal_cost_snapshot ->> 'productCostTotal')::numeric
          + (v_internal_cost_snapshot ->> 'freightAllocated')::numeric
          + (v_internal_cost_snapshot ->> 'oversizeAllocated')::numeric
          + (v_internal_cost_snapshot ->> 'processingFeeAllocated')::numeric,
          2
        )
      then
        raise exception 'Landed cost must equal product cost plus allocated freight, oversize, and processing charges.'
          using errcode = '22023';
      end if;

$old$,$new$      if not v_unresolved_cost then
      if (v_internal_cost_snapshot ->> 'productCostTotal')::numeric < 0
        or (v_internal_cost_snapshot ->> 'freightAllocated')::numeric < 0
        or (v_internal_cost_snapshot ->> 'oversizeAllocated')::numeric < 0
        or (v_internal_cost_snapshot ->> 'processingFeeAllocated')::numeric < 0
        or round(v_internal_total, 2) is distinct from round(
          (v_internal_cost_snapshot ->> 'productCostTotal')::numeric
          + (v_internal_cost_snapshot ->> 'freightAllocated')::numeric
          + (v_internal_cost_snapshot ->> 'oversizeAllocated')::numeric
          + (v_internal_cost_snapshot ->> 'processingFeeAllocated')::numeric,
          2
        )
      then
        raise exception 'Landed cost must equal product cost plus allocated freight, oversize, and processing charges.'
          using errcode = '22023';
      end if;

      end if;

$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  previous := definition;
  definition := replace(definition,$old$    coalesce(sum(
      case
        when designs.quote_v2_price_status = 'authoritative'
          then snapshots.internal_landed_cost_total
        else 0
      end
    ), 0)::numeric(12, 2),$old$,$new$    case when bool_or(designs.quote_v2_price_status = 'authoritative'
      and snapshots.internal_landed_cost_total is null) then null else
coalesce(sum(
      case
        when designs.quote_v2_price_status = 'authoritative'
          then snapshots.internal_landed_cost_total
        else 0
      end
    ), 0)::numeric(12, 2) end,$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  previous := definition;
  definition := replace(definition,$old$      - 'authoritative_price_status';$old$,$new$      - 'authoritative_price_status'
      - 'authoritative_price_error';$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  previous := definition;
  definition := replace(definition,$old$        'authoritative_price_status', v_price_status,$old$,$new$        'authoritative_price_status', v_price_status,
        'authoritative_price_error',case when jsonb_typeof(v_result->'staffPricingError')='string' then nullif(left(btrim(v_result->>'staffPricingError'),2000),'') else null end,$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.save_quote_v2_catalog_pricing_batch'; end if;
  execute definition;
end $migration$;

do $migration$
declare definition text; previous text;
begin
  definition := pg_get_functiondef('public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure);
  previous := definition;
  definition := replace(definition,$old$  v_line_wholesale_unit_price numeric(12, 2);$old$,$new$  v_line_wholesale_unit_price numeric(12, 2);
  v_unresolved_cost boolean;$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.prepare_native_quote_customer_snapshot'; end if;
  previous := definition;
  definition := replace(definition,$old$    if jsonb_typeof(v_line.internal_cost_snapshot) is distinct from 'object'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'productCostUnit')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'productCostTotal')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'freightAllocated')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'oversizeAllocated')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'processingFeeAllocated')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'landedCostTotal')
          is distinct from 'number'
    then
      raise exception 'A selected Quote V2 protected-cost snapshot is incomplete.'
        using errcode = '22023';
    end if;

$old$,$new$    v_unresolved_cost := public.quote_v2_has_unresolved_quote_cost(v_line.retail_snapshot,v_line.internal_cost_snapshot);
    if not v_unresolved_cost then
    if jsonb_typeof(v_line.internal_cost_snapshot) is distinct from 'object'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'productCostUnit')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'productCostTotal')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'freightAllocated')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'oversizeAllocated')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'processingFeeAllocated')
          is distinct from 'number'
      or jsonb_typeof(v_line.internal_cost_snapshot -> 'landedCostTotal')
          is distinct from 'number'
    then
      raise exception 'A selected Quote V2 protected-cost snapshot is incomplete.'
        using errcode = '22023';
    end if;

    end if;

$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.prepare_native_quote_customer_snapshot'; end if;
  previous := definition;
  definition := replace(definition,$old$      or v_line_internal_landed_cost is distinct from round(
        (v_line.internal_cost_snapshot ->> 'productCostTotal')::numeric
        + (v_line.internal_cost_snapshot ->> 'freightAllocated')::numeric
        + (v_line.internal_cost_snapshot ->> 'oversizeAllocated')::numeric
        + (v_line.internal_cost_snapshot ->> 'processingFeeAllocated')::numeric,
        2
      )$old$,$new$      or (not v_unresolved_cost and v_line_internal_landed_cost is distinct from round(
        (v_line.internal_cost_snapshot ->> 'productCostTotal')::numeric
        + (v_line.internal_cost_snapshot ->> 'freightAllocated')::numeric
        + (v_line.internal_cost_snapshot ->> 'oversizeAllocated')::numeric
        + (v_line.internal_cost_snapshot ->> 'processingFeeAllocated')::numeric,
        2
      ))$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.prepare_native_quote_customer_snapshot'; end if;
  previous := definition;
  definition := replace(definition,$old$    )
      into v_line_wholesale_unit_price
      from public.sales_quote_v2_price_snapshots snapshots$old$,$new$    ), public.quote_v2_has_unresolved_quote_cost(snapshots.retail_snapshot,snapshots.internal_cost_snapshot)
      into v_line_wholesale_unit_price,v_unresolved_cost
      from public.sales_quote_v2_price_snapshots snapshots$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.prepare_native_quote_customer_snapshot'; end if;
  previous := definition;
  definition := replace(definition,$old$    if v_line_wholesale_unit_price is null then$old$,$new$    if v_line_wholesale_unit_price is null and not coalesce(v_unresolved_cost,false) then$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.prepare_native_quote_customer_snapshot'; end if;
  previous := definition;
  definition := replace(definition,$old$      'adjustments', v_adjustments,$old$,$new$      'adjustments', v_adjustments,
      'quote_cost_status',case when v_internal_landed_cost_total is null then 'unresolved' else 'complete' end,
      'quotePricingPolicy',case when v_internal_landed_cost_total is null then 'grid_options_quote_v1' else null end,$new$);
  if definition = previous then raise exception 'Retail-only cost migration target changed: public.prepare_native_quote_customer_snapshot'; end if;
  execute definition;
end $migration$;

