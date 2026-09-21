alter table public.sales_quote_line_price_overrides add column if not exists customer_charge_policy text check (customer_charge_policy is null or customer_charge_policy='blind-shade-install-ship-v1');
-- New draft pricing only. Existing immutable snapshots and historical all-in overrides remain unchanged.
create or replace function public.quote_manual_customer_charges(p_design jsonb,p_line jsonb,p_retail jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare
  opts jsonb := coalesce(p_design->'options_json','{}'::jsonb);
  sel jsonb := coalesce(p_design->'quote_v2_selection','{}'::jsonb);
  config jsonb;
  product text;
  identity text;
  selected text;
  keys text[] := array[]::text[];
  key text;
  units numeric := 1;
  qty numeric := (p_line->>'quantity')::numeric;
  charges jsonb;
  count numeric;
begin
  config := p_design || coalesce(sel->'configuration','{}'::jsonb) || opts;
  product := coalesce(opts->>'catalog_product_id',opts->>'quote_lab_product_id',sel->>'productId',p_retail->>'productId','');
  identity := regexp_replace(lower(concat_ws(' ',product,p_design->>'product_type',p_line->>'product_type',opts->>'catalog_program_id',opts->>'quote_lab_program_id',sel->>'programId',p_retail->>'programId')),'[_-]+',' ','g');
  if identity ~ '(shutter|headrail|head rail|vane|remote|accessor|parts|pillow|awning|drapery|fabric by|valance only)'
    or identity !~ '(blind|shade|roller|roman|honeycomb|cellular|sheer|smartdrape|smart drape|synchrony|faux|wood|vertical|mini|vinyl|polar (elite|titan|mega|all seasons|allseasons|interior|exterior))' then return null; end if;
  charges := public.quote_customer_charges(p_retail->'customerCharges');
  units := coalesce((charges->>'eligibleUnitsPerWindow')::numeric,(p_retail->>'configurationUnits')::numeric,1);
  selected := regexp_replace(lower(concat_ws(' ',config->>'lift_system',config->>'honeycomb_operating_system',config->>'shade_type',config->>'roller_application')),'[_&-]+',' ','g');
  if product='honeycomb' then units := case when selected ~ 'smartfit.*dual' then 2 else 1 end;
  elsif product like 'lotus_%' then keys:=array['lotus_blind_count'];
  elsif product in ('smartprivacy_faux','faux_wood') then keys:=array['faux_blind_count'];
  elsif product='roller' then
    keys:=array['roller_coupling_count','coupled_shade_count','lightguard_360_shade_count'];
    if selected ~ 'dual' then units:=2; end if;
  elsif product='roman' and selected ~ 'common valance' then units:=2;
  end if;
  foreach key in array keys loop
    if nullif(config->>key,'') is not null then units:=(config->>key)::numeric; exit; end if;
  end loop;
  if units is null or units::text in ('NaN','Infinity','-Infinity') or units<>trunc(units) or units<1 or units>4
    or qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<>trunc(qty) or qty<1 then
    raise exception 'Invalid physical blind/shade count or line quantity.';
  end if;
  count:=units*qty;
  return public.quote_customer_charges(jsonb_build_object('version','blind-shade-install-ship-v1',
    'eligibleUnitsPerWindow',units,'quantity',qty,'eligibleUnitCount',count,'installationPerUnit',25,'shippingPerUnit',14,
    'installationTotal',25*count,'shippingTotal',14*count,'perWindowTotal',39*units,'total',39*count),qty);
end $$;
revoke all on function public.quote_manual_customer_charges(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.quote_manual_customer_charges(jsonb,jsonb,jsonb) to service_role;

create or replace function public.set_sales_quote_line_price(
  p_quote_id uuid, p_line_item_id uuid, p_variant text, p_unit_price numeric,
  p_actor_id uuid, p_expected_revision bigint, p_request_id uuid,
  p_reapply boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.sales_quotes%rowtype;
  l public.sales_quote_line_items%rowtype;
  d public.sales_quote_designs%rowtype;
  previous public.sales_quote_line_price_events%rowtype;
  source_snapshot public.sales_quote_v2_price_snapshots%rowtype;
  snapshot_id uuid;
  fingerprint text;
  price_catalog text;
  retail jsonb;
  provenance jsonb;
  result jsonb;
  amount numeric(12,2);
  total numeric(12,2);
  revision bigint;
  complete boolean;
  fixed_charges numeric := 0;
  charges jsonb;
  inclusive_amount numeric(12,2);
  apply_charge_policy boolean;
begin
  if p_unit_price is null or p_unit_price < 0 or p_unit_price::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Enter a price of $0 or more.';
  end if;
  if p_actor_id is null or p_request_id is null or nullif(btrim(p_variant),'') is null then
    raise exception 'A staff identity, request ID and design are required.';
  end if;
  amount := round(p_unit_price, 2);
  select * into q from public.sales_quotes where id=p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  select * into previous from public.sales_quote_line_price_events where request_id=p_request_id;
  if found then
    if previous.quote_id <> p_quote_id or previous.line_item_id <> p_line_item_id
      or previous.variant <> p_variant or previous.unit_price <> amount or previous.actor_id <> p_actor_id then
      raise exception 'This request ID was already used for a different price change.';
    end if;
    return previous.result;
  end if;
  if q.status is distinct from 'draft' or q.quote_v2_status='sent' then raise exception 'Line prices may only change on unlocked draft quotes.'; end if;
  if q.quote_v2_backend and p_expected_revision is distinct from q.quote_v2_revision then
    raise exception 'This quote changed. Reload it and try again.';
  end if;
  select * into l from public.sales_quote_line_items where id=p_line_item_id and quote_id=p_quote_id for update;
  if not found then raise exception 'Line item not found on this quote.'; end if;
  select * into d from public.sales_quote_designs where line_item_id=l.id and variant=p_variant for update;
  if not found then
    insert into public.sales_quote_designs(line_item_id,variant,product_type,unit_price)
    values(l.id,p_variant,l.product_type,amount) returning * into d;
  end if;
  select * into source_snapshot from public.sales_quote_v2_price_snapshots where id=d.current_v2_snapshot_id;
  -- Old all-in overrides keep their original meaning during automatic reapply.
  apply_charge_policy := not p_reapply or exists(select 1 from public.sales_quote_line_price_overrides where design_id=d.id and customer_charge_policy='blind-shade-install-ship-v1');
  if apply_charge_policy then
    charges := public.quote_manual_customer_charges(to_jsonb(d),to_jsonb(l),coalesce(source_snapshot.retail_snapshot->'retail','{}'::jsonb));
  end if;
  inclusive_amount := amount + coalesce((charges->>'perWindowTotal')::numeric,0);
  revision := coalesce(q.quote_v2_revision,0) + case when q.quote_v2_backend then 1 else 0 end;
  if q.quote_v2_backend then
    select * into source_snapshot from public.sales_quote_v2_price_snapshots where id=d.current_v2_snapshot_id;
    price_catalog := coalesce(source_snapshot.catalog_version,'custom-override-v1');
    fingerprint := case when price_catalog='custom-override-v1' then '' else 'sha256:' end
      || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    retail := jsonb_build_object('priceStatus','authoritative','selectionFingerprint',fingerprint,
      'catalogVersion',price_catalog,'retail',(coalesce(source_snapshot.retail_snapshot->'retail','{}'::jsonb) - 'customerCharges') || jsonb_build_object(
        'unitPrice',inclusive_amount,'base',amount,'surchargeLines','[]'::jsonb,
        'discountPercent',0,'discountAmount',0,'onceTotal',0,
        'quantity',l.quantity,'total',round(inclusive_amount*l.quantity,2))
        || case when charges is null then '{}'::jsonb else jsonb_build_object('customerCharges',charges) end);
    provenance := jsonb_build_object('mode','custom_override','internalOnly',true,
      'manualLinePrice',true,'originalSnapshotId',coalesce(source_snapshot.provenance_snapshot->>'originalSnapshotId',source_snapshot.id::text),
      'originalCatalogVersion',source_snapshot.catalog_version,
      'costResolution',case when source_snapshot.id is null then 'unresolved' else 'preserved_snapshot' end);
    insert into public.sales_quote_v2_price_snapshots(
      quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,
      retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot,
      validation_snapshot,provenance_snapshot,created_by)
    values(q.id,l.id,d.id,revision,fingerprint,price_catalog,round(inclusive_amount*l.quantity,2),
      coalesce(source_snapshot.internal_landed_cost_total,0),retail,
      coalesce(source_snapshot.internal_cost_snapshot,jsonb_build_object('status','unresolved','landedCostTotal',null)),
      jsonb_build_object('status','valid','mode','staff_retail_override'),provenance,p_actor_id)
    returning id into snapshot_id;
  end if;
  update public.sales_quote_designs set unit_price=inclusive_amount,
    options_json=((coalesce(options_json,'{}'::jsonb) - array[
      'discount_percent','discount_source_price','discount_amount','pricing_block_reason',
      'authoritative_price_error','sent_price_snapshot','customer_charges','customerCharges','customer_charge_policy_version'])
      #- '{authoritative_price_breakdown,customerCharges}'
      #- '{authoritative_v2_snapshot,retail,customerCharges}') || jsonb_build_object('manual_price_override',true)
      || case when apply_charge_policy then
        jsonb_build_object('manual_merchandise_unit_price',amount,'manual_customer_charge_policy','blind-shade-install-ship-v1')
        || case when charges is null then '{}'::jsonb else jsonb_build_object('customer_charges',charges) end
        else '{}'::jsonb end
      || case when q.quote_v2_backend then jsonb_build_object('authoritative_price_status','authoritative','authoritative_once_total',0) else '{}'::jsonb end,
    quote_v2_price_status=case when q.quote_v2_backend then 'authoritative' else quote_v2_price_status end,
    quote_v2_selection_fingerprint=coalesce(fingerprint,quote_v2_selection_fingerprint),
    quote_v2_priced_catalog_version=case when q.quote_v2_backend then price_catalog else quote_v2_priced_catalog_version end,
    quote_v2_priced_at=case when q.quote_v2_backend then now() else quote_v2_priced_at end,
    current_v2_snapshot_id=coalesce(snapshot_id,current_v2_snapshot_id)
  where id=d.id;
  update public.sales_quote_line_items set selected_design_id=d.id where id=l.id;
  -- Older quotes without persisted selections retain their existing A/first fallback.
  select coalesce(sum(chosen.unit_price*li.quantity +
    case when q.quote_v2_backend then coalesce((chosen.options_json->>'authoritative_once_total')::numeric,0) else 0 end),0),
    coalesce(bool_and(chosen.id is not null and chosen.quote_v2_price_status is not distinct from 'authoritative'),false),
    coalesce(sum(case when chosen.options_json->'manual_price_override'='true'::jsonb and chosen.options_json->>'manual_customer_charge_policy' is distinct from 'blind-shade-install-ship-v1' then 0 else
      coalesce((public.quote_customer_charges(coalesce(chosen.options_json #> '{authoritative_price_breakdown,customerCharges}',chosen.options_json->'customer_charges'),li.quantity)->>'total')::numeric,0) end),0)
  into total,complete,fixed_charges
  from public.sales_quote_line_items li
  left join lateral (
    select sd.* from public.sales_quote_designs sd where sd.line_item_id=li.id
    order by (sd.id=li.selected_design_id) desc nulls last,(sd.variant='A') desc,sd.id limit 1
  ) chosen on true where li.quote_id=q.id;
  total := public.quote_customer_adjusted_total(total,fixed_charges,q.installer_notes);
  update public.sales_quotes set total_amount=total,
    quote_v2_catalog_version=case when q.quote_v2_backend then (
      select string_agg(distinct sd.quote_v2_priced_catalog_version, ',' order by sd.quote_v2_priced_catalog_version)
      from public.sales_quote_line_items li join public.sales_quote_designs sd on sd.id=li.selected_design_id where li.quote_id=q.id
    ) else quote_v2_catalog_version end,
    quote_v2_revision=case when q.quote_v2_backend then revision else quote_v2_revision end,
    quote_v2_status=case when q.quote_v2_backend then case when complete then 'priced' else 'blocked' end else quote_v2_status end
  where id=q.id;
  if not p_reapply then
    insert into public.sales_quote_line_price_overrides(design_id,quote_id,unit_price,updated_by,customer_charge_policy)
    values(d.id,q.id,amount,p_actor_id,'blind-shade-install-ship-v1') on conflict(design_id) do update
    set unit_price=excluded.unit_price,updated_by=excluded.updated_by,updated_at=now(),customer_charge_policy=excluded.customer_charge_policy;
  end if;
  result := jsonb_build_object('designId',d.id,'unitPrice',inclusive_amount,'merchandiseUnitPrice',amount,'total',total,'revision',revision,
    'quoteStatus',case when not q.quote_v2_backend then q.quote_v2_status when complete then 'priced' else 'blocked' end);
  insert into public.sales_quote_line_price_events(request_id,quote_id,line_item_id,variant,unit_price,previous_price,actor_id,result)
  values(p_request_id,q.id,l.id,p_variant,amount,d.unit_price,p_actor_id,result);
  return result;
end $$;


-- Extend protected fields and existing batch accounting without rewriting selection/history guards.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.quote_v2_structure_is_protected_key(text)'::regprocedure) into definition;
  updated := replace(definition, '''customercharges''', '''manualmerchandiseunitprice'',''manualcustomerchargepolicy'',''customercharges''');
  if updated=definition then raise exception 'Customer charge protected-key patch target changed.'; end if;
  execute updated;
  select pg_get_functiondef('public.save_quote_v2_catalog_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure) into definition;
  updated := replace(definition,
    'designs.options_json->''manual_price_override''=''true''::jsonb then 0',
    'designs.options_json->''manual_price_override''=''true''::jsonb and designs.options_json->>''manual_customer_charge_policy'' is distinct from ''blind-shade-install-ship-v1'' then 0');
  -- A stub catalog function in the isolated database tests has no adjustment calculation.
  if updated<>definition then execute updated;
  elsif position('v_fixed_charges' in definition)>0 then raise exception 'Manual catalog adjustment patch target changed.'; end if;
  select pg_get_functiondef('public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb)'::regprocedure) into definition;
  updated := replace(definition,'d.unit_price=manual.unit_price',
    'd.unit_price=manual.unit_price + case when d.options_json->>''manual_customer_charge_policy''=''blind-shade-install-ship-v1'' then coalesce((public.quote_customer_charges(d.options_json->''customer_charges'')->>''perWindowTotal'')::numeric,0) else 0 end');
  if updated=definition then raise exception 'Manual reapply patch target changed.'; end if;
  execute updated;
end $migration$;
