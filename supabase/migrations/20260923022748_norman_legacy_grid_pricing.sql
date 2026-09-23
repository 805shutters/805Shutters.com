-- Price Norman lines with the authoritative calculator without converting the
-- containing legacy quote or touching its other manufacturers/manual prices.
create or replace function public.read_norman_quote_pricing_state(p_quote_id uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('quote',to_jsonb(q),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.id)
      from public.sales_quote_line_items l where l.quote_id=q.id),'[]'::jsonb),
    'designs',coalesce((select jsonb_agg(to_jsonb(d) order by d.id)
      from public.sales_quote_designs d join public.sales_quote_line_items l on l.id=d.line_item_id
      where l.quote_id=q.id),'[]'::jsonb))
  from public.sales_quotes q where q.id=p_quote_id;
$$;
revoke all on function public.read_norman_quote_pricing_state(uuid) from public,anon,authenticated;
grant execute on function public.read_norman_quote_pricing_state(uuid) to service_role;

create or replace function public.save_norman_quote_pricing(
  p_quote_id uuid,p_expected_state jsonb,p_results jsonb,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  q public.sales_quotes%rowtype; l public.sales_quote_line_items%rowtype;
  d public.sales_quote_designs%rowtype; r jsonb; selection jsonb; snapshot jsonb;
  cost jsonb; provenance jsonb; options jsonb; fingerprint text; catalog text;
  status text; snapshot_id uuid; selected_id uuid; revision bigint;
  unit numeric; once_charge numeric; line_total numeric; landed numeric;
  total numeric; fixed_charges numeric; priced integer:=0; blocked integer:=0;
  seen uuid[]:='{}'; unresolved boolean;
begin
  if p_actor_id is null or jsonb_typeof(p_expected_state) is distinct from 'object'
    or jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)>40 then
    raise exception 'A staff identity, expected quote state and bounded pricing results are required.' using errcode='22023';
  end if;
  select * into q from public.sales_quotes where id=p_quote_id for update;
  if not found then raise exception 'Quote not found.' using errcode='P0002'; end if;
  perform 1 from public.sales_quote_line_items where quote_id=p_quote_id order by id for update;
  perform 1 from public.sales_quote_designs where line_item_id in
    (select id from public.sales_quote_line_items where quote_id=p_quote_id) order by id for update;
  if public.read_norman_quote_pricing_state(p_quote_id) is distinct from p_expected_state then
    raise exception 'Quote changed while Norman pricing was calculated. Reload and retry.' using errcode='40001';
  end if;
  if q.status is distinct from 'draft' or q.quote_v2_backend is true
    or q.quote_v2_status='sent' or to_jsonb(q)->>'sent_at' is not null
    or to_jsonb(q)->>'signed_at' is not null or nullif(to_jsonb(q)->>'customer_signature','') is not null then
    raise exception 'Norman legacy pricing requires an unsent, unsigned legacy draft.' using errcode='22023';
  end if;
  revision:=coalesce(q.quote_v2_revision,0)+1;
  for r in select value from jsonb_array_elements(p_results) loop
    if (r->>'lineItemId')::uuid=any(seen) then raise exception 'Duplicate Norman pricing line.' using errcode='22023'; end if;
    seen:=array_append(seen,(r->>'lineItemId')::uuid);
    select * into l from public.sales_quote_line_items where id=(r->>'lineItemId')::uuid and quote_id=q.id;
    if not found or l.archived_at is not null then raise exception 'Norman pricing line is not active on this quote.' using errcode='22023'; end if;
    select id into selected_id from public.sales_quote_designs where line_item_id=l.id
      order by (id=l.selected_design_id) desc nulls last,(variant='A') desc,id limit 1;
    select * into d from public.sales_quote_designs where id=(r->>'designId')::uuid and line_item_id=l.id;
    if not found or d.id is distinct from selected_id or (l.selected_design_id is not null and l.selected_design_id<>d.id) or r->'selectDesign' is distinct from 'true'::jsonb
      or lower(btrim(coalesce(d.supplier,'')))<>'norman'
      or coalesce(d.options_json->'manual_price_override','false'::jsonb)='true'::jsonb
      or coalesce(d.options_json->'sent_price_snapshot','null'::jsonb)<>'null'::jsonb
      or d.options_json->'custom_mode'='true'::jsonb or d.options_json->'custom_pricing_mode'='true'::jsonb
      or exists(select 1 from public.sales_quote_line_price_overrides o where o.design_id=d.id) then
      raise exception 'Only the selected automatic, unfrozen Norman design may be priced.' using errcode='22023';
    end if;
    selection:=r->'selection'; fingerprint:=r->>'selectionFingerprint'; catalog:=r->>'catalogVersion';
    status:=r->>'priceStatus'; snapshot:=r->'authoritativeSnapshot'; cost:=r->'internalCostSnapshot';
    provenance:=r->'provenanceSnapshot'; snapshot_id:=null;
    if jsonb_typeof(selection) is distinct from 'object' or selection->>'manufacturerId' is distinct from 'norman'
      or selection->>'catalogVersion' is distinct from catalog or nullif(selection->>'productId','') is null
      or fingerprint is null or fingerprint !~ '^sha256:[0-9a-f]{64}$' or nullif(catalog,'') is null
      or status is null or status not in ('authoritative','blocked','unpriceable')
      or jsonb_typeof(provenance) is distinct from 'object' or provenance='{}'::jsonb then
      raise exception 'Norman pricing identity or provenance is invalid.' using errcode='22023';
    end if;
    options:=coalesce(d.options_json,'{}'::jsonb)-array[
      'authoritative_price_breakdown','authoritative_cost_breakdown','authoritative_v2_snapshot',
      'authoritative_once_total','authoritative_price_error','customer_charges','priced_selection_fingerprint',
      'priced_catalog_version','quote_v2_catalog_version','quote_v2_catalog_as_of'];
    options:=options||jsonb_build_object('norman_grid_pricing',true,'authoritative_price_status',status,
      'priced_selection_fingerprint',fingerprint,'priced_catalog_version',catalog,
      'quote_v2_catalog_version',catalog);
    if status='authoritative' then
      if jsonb_typeof(snapshot) is distinct from 'object' or snapshot->>'priceStatus' is distinct from status
        or snapshot->>'selectionFingerprint' is distinct from fingerprint or snapshot->>'catalogVersion' is distinct from catalog
        or snapshot#>>'{retail,ok}' is distinct from 'true' or snapshot#>>'{retail,validationStatus}' is distinct from 'valid'
        or snapshot#>>'{retail,catalogVersion}' is distinct from catalog
        or jsonb_typeof(snapshot#>'{retail,unitPrice}') is distinct from 'number'
        or jsonb_typeof(snapshot#>'{retail,onceTotal}') is distinct from 'number'
        or jsonb_typeof(snapshot#>'{retail,total}') is distinct from 'number'
        or jsonb_typeof(snapshot#>'{retail,quantity}') is distinct from 'number'
        or (snapshot#>>'{retail,quantity}')::numeric is distinct from l.quantity::numeric then
        raise exception 'Norman retail snapshot is incomplete or has a different quantity.' using errcode='22023';
      end if;
      unit:=(snapshot#>>'{retail,unitPrice}')::numeric; once_charge:=(snapshot#>>'{retail,onceTotal}')::numeric;
      line_total:=(snapshot#>>'{retail,total}')::numeric;
      if unit<0 or once_charge<0 or line_total<0 or round(line_total,2) is distinct from round(unit*l.quantity+once_charge,2) then
        raise exception 'Norman retail total does not match its unit price and quantity.' using errcode='22023';
      end if;
      unresolved:=public.quote_v2_has_unresolved_quote_cost(snapshot,cost);
      if not unresolved then
        if jsonb_typeof(cost) is distinct from 'object' or jsonb_typeof(cost->'landedCostTotal') is distinct from 'number'
          or jsonb_typeof(cost->'productCostTotal') is distinct from 'number'
          or jsonb_typeof(cost->'freightAllocated') is distinct from 'number'
          or jsonb_typeof(cost->'oversizeAllocated') is distinct from 'number'
          or jsonb_typeof(cost->'processingFeeAllocated') is distinct from 'number' then
          raise exception 'Norman cost must be documented or explicitly unresolved.' using errcode='22023';
        end if;
        landed:=(cost->>'landedCostTotal')::numeric;
        if landed<0 or (cost->>'productCostTotal')::numeric<0 or (cost->>'freightAllocated')::numeric<0
          or (cost->>'oversizeAllocated')::numeric<0 or (cost->>'processingFeeAllocated')::numeric<0
          or round(landed,2) is distinct from round((cost->>'productCostTotal')::numeric+(cost->>'freightAllocated')::numeric+
            (cost->>'oversizeAllocated')::numeric+(cost->>'processingFeeAllocated')::numeric,2) then
          raise exception 'Norman landed cost does not match its components.' using errcode='22023';
        end if;
      else landed:=null; end if;
      insert into public.sales_quote_v2_price_snapshots(quote_id,line_item_id,design_id,quote_revision,
        selection_fingerprint,catalog_version,retail_total,internal_landed_cost_total,retail_snapshot,
        internal_cost_snapshot,validation_snapshot,provenance_snapshot,created_by)
      values(q.id,l.id,d.id,revision,fingerprint,catalog,round(line_total,2),landed,snapshot,cost,
        coalesce(r->'validationSnapshot','[]'::jsonb),provenance,p_actor_id) returning id into snapshot_id;
      options:=options||jsonb_build_object('authoritative_price_breakdown',snapshot->'retail',
        'authoritative_v2_snapshot',snapshot,'authoritative_once_total',round(once_charge,2),
        'quote_v2_catalog_as_of',snapshot->>'catalogAsOf');
      priced:=priced+1;
    else
      if (snapshot is not null and snapshot<>'null'::jsonb) or (cost is not null and cost<>'null'::jsonb) then
        raise exception 'Blocked Norman pricing cannot contain a price snapshot.' using errcode='22023';
      end if;
      unit:=0;
      options:=options||jsonb_build_object('authoritative_price_error',
        coalesce(nullif(left(btrim(r->>'staffPricingError'),2000),''),'The selected Norman grid or option price is unavailable.'));
      blocked:=blocked+1;
    end if;
    update public.sales_quote_designs set unit_price=round(unit,2),options_json=options,
      quote_v2_selection=selection,quote_v2_price_status=status,quote_v2_selection_fingerprint=fingerprint,
      quote_v2_priced_catalog_version=catalog,quote_v2_priced_at=now(),current_v2_snapshot_id=snapshot_id where id=d.id;
    update public.sales_quote_line_items set selected_design_id=d.id where id=l.id;
  end loop;
  select coalesce(sum(chosen.unit_price*li.quantity+case when chosen.options_json->'norman_grid_pricing'='true'::jsonb
      then coalesce((chosen.options_json->>'authoritative_once_total')::numeric,0) else 0 end),0),
    coalesce(sum(case when chosen.options_json->'manual_price_override'='true'::jsonb and
      chosen.options_json->>'manual_customer_charge_policy' is distinct from 'blind-shade-install-ship-v1' then 0 else
      coalesce((public.quote_customer_charges(coalesce(chosen.options_json#>'{authoritative_price_breakdown,customerCharges}',
        chosen.options_json->'customer_charges'),li.quantity)->>'total')::numeric,0) end),0)
  into total,fixed_charges from public.sales_quote_active_line_items li
  left join lateral(select sd.* from public.sales_quote_designs sd where sd.line_item_id=li.id
    order by (sd.id=li.selected_design_id) desc nulls last,(sd.variant='A') desc,sd.id limit 1) chosen on true where li.quote_id=q.id;
  total:=public.quote_customer_adjusted_total(total,fixed_charges,q.installer_notes);
  update public.sales_quotes set total_amount=total,quote_v2_revision=revision where id=q.id;
  return jsonb_build_object('quoteId',q.id,'pricedDesignCount',priced,'blockedDesignCount',blocked,'total',total);
end $$;
revoke all on function public.save_norman_quote_pricing(uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_norman_quote_pricing(uuid,jsonb,jsonb,uuid) to service_role;

-- Editing another line's manual price must retain Norman's once-per-line cents.
do $migration$
declare fn record; original text; definition text; before_reset text; matched integer:=0;
begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='set_sales_quote_line_price' loop
    matched:=matched+1;
    original:=pg_get_functiondef(fn.oid);
    definition:=replace(original,'case when q.quote_v2_backend then coalesce((chosen.options_json->>''authoritative_once_total'')::numeric,0) else 0 end',
      'case when q.quote_v2_backend or chosen.options_json->''norman_grid_pricing''=''true''::jsonb then coalesce((chosen.options_json->>''authoritative_once_total'')::numeric,0) else 0 end');
    if definition=original and original not like '%case when q.quote_v2_backend or chosen.options_json->''norman_grid_pricing''=%' then
      raise exception 'Norman pricing migration could not locate the manual-price total calculation.';
    end if;
    before_reset:=definition;
    definition:=replace(definition,
      $old$|| case when q.quote_v2_backend then jsonb_build_object('authoritative_price_status','authoritative','authoritative_once_total',0) else '{}'::jsonb end,$old$,
      $new$|| case when q.quote_v2_backend then jsonb_build_object('authoritative_price_status','authoritative','authoritative_once_total',0)
        when d.options_json->'norman_grid_pricing'='true'::jsonb then jsonb_build_object('norman_grid_pricing',false,'authoritative_once_total',0)
        else '{}'::jsonb end,$new$);
    if definition=before_reset and original not like '%norman_grid_pricing'',false%' then
      raise exception 'Norman pricing migration could not locate the manual-price once-charge reset.';
    end if;
    if definition<>original then execute definition; end if;
  end loop;
  if matched=0 then raise exception 'The existing manual-price function is required before Norman grid pricing.'; end if;
end $migration$;
