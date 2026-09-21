-- New Custom Mode snapshots retain separately validated fixed customer charges. No historical writes.
create or replace function public.apply_quote_v2_custom_override(
  p_quote_id uuid, p_line_item_id uuid, p_design_id uuid,
  p_expected_revision bigint, p_idempotency_key text, p_actor_id uuid,
  p_line_patch jsonb, p_design_patch jsonb, p_retail_snapshot jsonb,
  p_internal_snapshot jsonb, p_provenance_snapshot jsonb,
  p_override_input jsonb, p_override_financials jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_design public.sales_quote_designs%rowtype;
  v_original public.sales_quote_v2_price_snapshots%rowtype;
  v_override_id uuid;
  v_snapshot_id uuid;
  v_revision bigint;
  v_unit numeric(12,2);
  v_total numeric(12,2);
  v_fingerprint text;
  v_existing_event public.sales_quote_v2_events%rowtype;
  v_line public.sales_quote_line_items%rowtype;
  v_charges jsonb;
  v_merchandise numeric;
  v_subtotal numeric;
  v_fixed numeric;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200 then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.';
  end if;
  select * into v_quote from public.sales_quotes where id=p_quote_id for update;
  if not found or not v_quote.quote_v2_backend then raise exception 'Custom Mode requires a Quote V2 draft.'; end if;
  if v_quote.quote_v2_status='sent' or v_quote.status <> 'draft' then raise exception 'Custom Mode is available only on draft quotes.'; end if;
  select * into v_existing_event from public.sales_quote_v2_events
  where quote_id=p_quote_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing_event.event_type <> 'custom_override_applied'
      or v_existing_event.event_payload->>'lineItemId' is distinct from p_line_item_id::text
      or v_existing_event.event_payload->>'designId' is distinct from p_design_id::text
    then raise exception 'The Quote V2 idempotency key was already used for a different request.'; end if;
    return v_existing_event.event_payload;
  end if;
  if v_quote.quote_v2_revision <> p_expected_revision then raise exception 'Quote revision changed.'; end if;
  select * into v_design from public.sales_quote_designs where id=p_design_id and line_item_id=p_line_item_id;
  if not found or v_design.current_v2_snapshot_id is null then raise exception 'Price the standard V2 design before enabling Custom Mode.'; end if;
  select * into v_original from public.sales_quote_v2_price_snapshots where id=v_design.current_v2_snapshot_id;
  if v_original.catalog_version = 'custom-override-v1' then
    select * into v_original from public.sales_quote_v2_price_snapshots
    where id=(v_original.provenance_snapshot->>'originalSnapshotId')::uuid;
  end if;
  if not found or v_original.catalog_version = 'custom-override-v1' then
    raise exception 'The immutable standard V2 snapshot is unavailable.';
  end if;
  select * into v_line from public.sales_quote_line_items where id=p_line_item_id and quote_id=p_quote_id for update;
  if not found then raise exception 'Line item not found on this quote.'; end if;
  v_charges := public.quote_manual_customer_charges(to_jsonb(v_design),to_jsonb(v_line),v_original.retail_snapshot->'retail');
  v_merchandise := (p_override_financials->>'sellPrice')::numeric;
  if v_merchandise is null or v_merchandise::text in ('NaN','Infinity','-Infinity') or v_merchandise<0
    or p_retail_snapshot#>'{retail,customerCharges}' is distinct from v_charges
    or (p_retail_snapshot#>>'{retail,quantity}')::numeric is distinct from v_line.quantity
    or (p_retail_snapshot#>>'{retail,unitPrice}')::numeric is distinct from round(v_merchandise+coalesce((v_charges->>'perWindowTotal')::numeric,0),2)
    or (p_retail_snapshot#>>'{retail,total}')::numeric is distinct from round((v_merchandise+coalesce((v_charges->>'perWindowTotal')::numeric,0))*v_line.quantity,2) then
    raise exception 'Custom merchandise and fixed customer charges do not match the saved physical units and quantity.';
  end if;
  v_revision := p_expected_revision + 1;
  v_unit := (p_retail_snapshot#>>'{retail,unitPrice}')::numeric;
  v_total := (p_retail_snapshot#>>'{retail,total}')::numeric;
  v_fingerprint := p_provenance_snapshot->>'customFingerprint';

  insert into public.sales_quote_v2_custom_overrides(
    quote_id,line_item_id,design_id,original_snapshot_id,original_snapshot,
    override_input,override_financials,provenance_snapshot,created_by
  ) values (
    p_quote_id,p_line_item_id,p_design_id,v_original.id,
    jsonb_build_object('retail',v_original.retail_snapshot,'internalCost',v_original.internal_cost_snapshot,'validation',v_original.validation_snapshot,'provenance',v_original.provenance_snapshot),
    p_override_input,p_override_financials,p_provenance_snapshot,p_actor_id
  ) returning id into v_override_id;

  insert into public.sales_quote_v2_price_snapshots(
    quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,
    retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot,
    validation_snapshot,provenance_snapshot,created_by
  ) values (
    p_quote_id,p_line_item_id,p_design_id,v_revision,v_fingerprint,
    'custom-override-v1',v_total,
    (p_override_financials->>'landedCost')::numeric,p_retail_snapshot,p_internal_snapshot,
    jsonb_build_object('status','valid','mode','custom_override'),
    p_provenance_snapshot || jsonb_build_object('mode','custom_override','internalOnly',true,'overrideId',v_override_id),
    p_actor_id
  ) returning id into v_snapshot_id;

  update public.sales_quote_v2_custom_overrides set override_snapshot_id=v_snapshot_id where id=v_override_id;
  update public.sales_quote_line_items set
    room_name=coalesce(nullif(p_line_patch->>'roomName',''),room_name),
    width_whole=coalesce((p_line_patch->>'widthWhole')::int,width_whole),
    width_fraction=coalesce(nullif(p_line_patch->>'widthFraction',''),width_fraction),
    height_whole=coalesce((p_line_patch->>'heightWhole')::int,height_whole),
    height_fraction=coalesce(nullif(p_line_patch->>'heightFraction',''),height_fraction)
  where id=p_line_item_id and quote_id=p_quote_id;
  update public.sales_quote_designs set
    variant=coalesce(nullif(p_design_patch->>'name',''),variant),
    options_json=(coalesce(options_json,'{}'::jsonb)-array['customer_charges','manual_merchandise_unit_price','manual_customer_charge_policy']
      #-'{authoritative_price_breakdown,customerCharges}' #-'{authoritative_v2_snapshot,retail,customerCharges}')
      || jsonb_build_object('authoritative_price_breakdown',p_retail_snapshot->'retail','authoritative_v2_snapshot',p_retail_snapshot,
        'authoritative_once_total',0,'manual_merchandise_unit_price',v_merchandise,'manual_customer_charge_policy','blind-shade-install-ship-v1')
      || case when v_charges is null then '{}'::jsonb else jsonb_build_object('customer_charges',v_charges) end,
    unit_price=v_unit, quote_v2_price_status='authoritative',
    quote_v2_selection_fingerprint=v_fingerprint,
    quote_v2_priced_catalog_version='custom-override-v1',
    quote_v2_priced_at=now(), current_v2_snapshot_id=v_snapshot_id
  where id=p_design_id;
  update public.sales_quotes set quote_v2_revision=v_revision, quote_v2_last_priced_at=now(),
    quote_v2_catalog_version=(
      select string_agg(distinct d.quote_v2_priced_catalog_version, ',' order by d.quote_v2_priced_catalog_version)
      from public.sales_quote_line_items l join public.sales_quote_designs d on d.id=l.selected_design_id
      where l.quote_id=p_quote_id
    ),
    total_amount=total_amount
  where id=p_quote_id;
  select coalesce(sum(d.unit_price*l.quantity+coalesce((d.options_json->>'authoritative_once_total')::numeric,0)),0),
    coalesce(sum(case when d.options_json->'manual_price_override'='true'::jsonb and d.options_json->>'manual_customer_charge_policy' is distinct from 'blind-shade-install-ship-v1' then 0 else coalesce((public.quote_customer_charges(coalesce(d.options_json#>'{authoritative_price_breakdown,customerCharges}',d.options_json->'customer_charges'),l.quantity)->>'total')::numeric,0) end),0)
    into v_subtotal,v_fixed
    from public.sales_quote_line_items l join public.sales_quote_designs d on d.id=l.selected_design_id
    where l.quote_id=p_quote_id;
  update public.sales_quotes set total_amount=public.quote_customer_adjusted_total(v_subtotal,v_fixed,v_quote.installer_notes) where id=p_quote_id;
  insert into public.sales_quote_v2_events(quote_id,event_type,previous_revision,new_revision,actor_id,idempotency_key,event_payload)
  values(p_quote_id,'custom_override_applied',p_expected_revision,v_revision,p_actor_id,btrim(p_idempotency_key),
    jsonb_build_object('overrideId',v_override_id,'snapshotId',v_snapshot_id,'revision',v_revision,
      'unitPrice',v_unit,'total',v_total,'lineItemId',p_line_item_id,'designId',p_design_id,'internalOnly',true));
  return jsonb_build_object('overrideId',v_override_id,'snapshotId',v_snapshot_id,'revision',v_revision,
    'unitPrice',v_unit,'total',v_total,'lineItemId',p_line_item_id,'designId',p_design_id,'internalOnly',true);
end $$;
revoke all on function public.apply_quote_v2_custom_override(uuid,uuid,uuid,bigint,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_quote_v2_custom_override(uuid,uuid,uuid,bigint,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
