-- Live vendor prices saved by price_line_from_receipt had a sell price and a
-- quote total, and no V2 catalog identity or per-line snapshot. Send
-- preparation then stopped with "authoritative V2 quote catalog identity is
-- missing."
--
-- This is the production body of price_line_from_receipt from
-- 20261122044500_live_price_authenticated_apply.sql, which matches the live
-- function on project evuxqsaucmvgyuvjpqlo. Price math, the quote_not_draft
-- return, and the no_site_price, spec_changed, switch_off, and
-- no_vendor_account failures are unchanged. Onyx and Sundance live prices use
-- this same function. No TypeScript wrapper writes a live price around it.
--
-- A successful V2 price now writes the snapshot shape set_sales_quote_line_price
-- writes: custom-override-v1, a 64-hex fingerprint, authoritative retail,
-- custom_override provenance, and staff_retail_override validation. The send
-- check has no separate live-lookup catalog version. custom-override-v1 is the
-- version that function already stores when the price did not come from the
-- catalog engine, and the version a hand-fixed live quote used to pass send.
-- Calling set_sales_quote_line_price from here would fold installation and
-- shipping into the sell unit, bump the revision a second time, and recompute
-- the quote total. The snapshot therefore records v_unit and v_line_total,
-- which are the sell price and line contribution this function already stores.
--
-- Forward only. Create or replace this function. No backfill and no update of
-- an existing quote.

create or replace function public.price_line_from_receipt(
  p_quote_id uuid, p_line_item_id uuid, p_variant text, p_record_id uuid,
  p_expected_revision bigint, p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $live$
declare
  q public.sales_quotes%rowtype;
  l public.sales_quote_line_items%rowtype;
  d public.sales_quote_designs%rowtype;
  vendor_receipt public.crm_vendor_price_receipts%rowtype;
  existing public.crm_supplier_workflow_line_prices%rowtype;
  previous public.sales_quote_line_price_events%rowtype;
  install_rate numeric;
  ship_rate numeric;
  eligible numeric;
  v_install numeric(12,2);
  v_ship numeric(12,2);
  v_unit numeric(12,2);
  v_merchandise numeric(12,2);
  v_line_total numeric(12,2);
  v_revision bigint;
  manufacturer numeric(12,2);
  product numeric(12,2);
  total numeric(12,2);
  outcome jsonb;
  charges jsonb;
  actor uuid;
  workflow_id uuid;
  components jsonb;
  line_count integer;
  open_count integer;
  next_status text;
  source_snapshot public.sales_quote_v2_price_snapshots%rowtype;
  snapshot_id uuid;
  v_fingerprint text;
  v_price_catalog text;
  v_retail jsonb;
  v_provenance jsonb;
begin
  if p_request_id is null or nullif(btrim(p_variant), '') is null then
    raise exception 'A request ID and design are required.';
  end if;
  select * into previous from public.sales_quote_line_price_events where request_id = p_request_id;
  if found then return previous.result; end if;
  select * into q from public.sales_quotes where id = p_quote_id;
  if not found then raise exception 'Quote not found.'; end if;
  -- Closed quotes are not priced. crm_vendor_price_receipts, written by
  -- record_vendor_price_receipt, is the audit receipt. This function
  -- inserts and updates nothing: no design price, no override, no workflow
  -- row, no revision, no quote row, and no note change.
  if q.status is distinct from 'draft'
     or q.quote_v2_status is null
     or q.quote_v2_status not in ('draft', 'stale', 'priced', 'blocked') then
    return jsonb_build_object(
      'quoteStatus', 'quote_not_draft',
      'revision', coalesce(q.quote_v2_revision, 0)
    );
  end if;
  select * into q from public.sales_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if q.status is distinct from 'draft'
     or q.quote_v2_status is null
     or q.quote_v2_status not in ('draft', 'stale', 'priced', 'blocked') then
    return jsonb_build_object(
      'quoteStatus', 'quote_not_draft',
      'revision', coalesce(q.quote_v2_revision, 0)
    );
  end if;
  if q.quote_v2_backend and p_expected_revision is distinct from q.quote_v2_revision then
    raise exception 'stale_revision';
  end if;
  if not exists (select 1 from public.crm_live_lookup_switch where enabled) then
    raise exception 'switch_off';
  end if;
  select * into vendor_receipt from public.crm_vendor_price_receipts where id = p_record_id;
  if not found or vendor_receipt.quote_id is distinct from q.id or vendor_receipt.line_id is distinct from p_line_item_id
     or vendor_receipt.net_unit_price is null or vendor_receipt.net_unit_price <= 0 then
    if q.live_margin is null then raise exception 'no_margin'; end if;
    raise exception 'no_site_price';
  end if;
  if not exists (
    select 1 from public.crm_live_lookup_switch
    where vendor = vendor_receipt.vendor and enabled
  ) then
    raise exception 'switch_off';
  end if;
  if not exists (
    select 1 from public.crm_vendor_accounts
    where vendor = vendor_receipt.vendor and active
  ) then
    raise exception 'no_vendor_account';
  end if;
  if q.live_margin is null then raise exception 'no_margin'; end if;
  if vendor_receipt.spec_hash is distinct from public.price_record_line_spec_hash(p_line_item_id) then
    raise exception 'spec_changed';
  end if;
  select amount into install_rate from public.crm_quote_charge_settings where key = 'install_per_unit';
  select amount into ship_rate from public.crm_quote_charge_settings where key = 'ship_per_unit';
  if install_rate is null or ship_rate is null then
    raise exception 'Install/shipping setting not available.';
  end if;
  select * into l from public.sales_quote_line_items where id = p_line_item_id and quote_id = q.id for update;
  if not found then raise exception 'Line item not found on this quote.'; end if;
  select * into d from public.sales_quote_designs where line_item_id = l.id and variant = p_variant for update;
  if not found then
    insert into public.sales_quote_designs (line_item_id, variant, product_type, unit_price)
    values (l.id, p_variant, l.product_type, 0) returning * into d;
  end if;
  eligible := public.live_lookup_eligible_units(
    concat_ws(' ', l.product_type, d.product_type, d.options_json->>'catalog_product_id', d.options_json->>'quote_lab_product_id'),
    concat_ws(' ', d.options_json->>'catalog_program_id', d.options_json->>'quote_lab_program_id'),
    coalesce(d.options_json, '{}'::jsonb),
    l.quantity
  );
  v_install := case when eligible = 0 then 0 else round(install_rate * eligible, 2) end;
  v_ship := case when eligible = 0 then 0 else round(ship_rate * eligible, 2) end;
  v_unit := round(vendor_receipt.net_unit_price * q.live_margin, 2);
  v_merchandise := round(v_unit * l.quantity, 2);
  v_line_total := v_merchandise + v_install + v_ship;
  components := jsonb_build_object(
    'policy', '805-draft-opening-line-v1',
    'mode', 'supplier_cost'
  );
  if eligible > 0 then
    charges := jsonb_build_object(
      'version', 'blind-shade-install-ship-v2-setting',
      'eligibleUnitsPerWindow', eligible / l.quantity,
      'quantity', l.quantity,
      'eligibleUnitCount', eligible,
      'installationPerUnit', install_rate,
      'shippingPerUnit', ship_rate,
      'installationTotal', v_install,
      'shippingTotal', v_ship,
      'perWindowTotal', round((install_rate + ship_rate) * (eligible / l.quantity), 2),
      'total', round(v_install + v_ship, 2)
    );
  end if;
  v_revision := coalesce(q.quote_v2_revision, 0) + case when q.quote_v2_backend then 1 else 0 end;
  select * into existing from public.crm_supplier_workflow_line_prices
  where quote_id = q.id and line_id = l.id;
  if not found then
    insert into public.crm_supplier_workflow_line_prices (
      request_id, job_id, quote_id, line_id, design_id, source_line_id, product_cost,
      merchandise, installation, shipping, line_total, components, receipt, result,
      vendor, vendor_account, portal_draft_id, portal_url, observed_at, source_bot_id,
      screenshot_path, spec_hash, net_unit_price, net_line_total, list_unit_price,
      margin, price_source
    ) values (
      gen_random_uuid(), null, q.id, l.id, d.id, l.id, vendor_receipt.net_line_total,
      v_merchandise, v_install, v_ship, v_line_total, components, vendor_receipt.receipt,
      jsonb_build_object('priced', true, 'margin', q.live_margin, 'priceSource', 'live_site'),
      vendor_receipt.vendor, vendor_receipt.vendor_account, vendor_receipt.portal_draft_id,
      vendor_receipt.portal_url, vendor_receipt.observed_at, vendor_receipt.source_bot_id,
      vendor_receipt.screenshot_path, public.price_record_line_spec_hash(l.id),
      vendor_receipt.net_unit_price, vendor_receipt.net_line_total, vendor_receipt.list_unit_price,
      q.live_margin, 'live_site'
    ) returning id into workflow_id;
  else
    workflow_id := existing.id;
    insert into public.crm_live_lookup_line_price_revisions (
      quote_id, line_id, request_id, source_record_id, merchandise, installation, shipping,
      line_total, product_cost, net_unit_price, net_line_total, margin, price_source,
      components, spec_hash
    ) values (
      q.id, l.id, p_request_id, vendor_receipt.id, v_merchandise, v_install, v_ship,
      v_line_total, vendor_receipt.net_line_total, vendor_receipt.net_unit_price,
      vendor_receipt.net_line_total, q.live_margin, 'live_site', components,
      public.price_record_line_spec_hash(l.id)
    );
  end if;
  -- V2 send reads quote_v2_catalog_version and one current snapshot per
  -- selected design. custom-override-v1 is the identity set_sales_quote_line_price
  -- uses when a price did not come from the catalog engine, and the identity
  -- the send check already accepts without repricing. The retail unit price is
  -- v_unit and the retail total is v_line_total: the same sell price and line
  -- contribution this function already stores. A closed quote returned above,
  -- and no_site_price raised above, so neither path writes a snapshot.
  actor := '00000000-0000-4000-8000-000000000050'::uuid;
  if q.quote_v2_backend then
    select * into source_snapshot
    from public.sales_quote_v2_price_snapshots
    where id = d.current_v2_snapshot_id;
    v_price_catalog := 'custom-override-v1';
    v_fingerprint := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    v_provenance := jsonb_build_object(
      'mode', 'custom_override',
      'internalOnly', true,
      'manualLinePrice', true,
      'originalSnapshotId', coalesce(source_snapshot.provenance_snapshot->>'originalSnapshotId', source_snapshot.id::text),
      'originalCatalogVersion', source_snapshot.catalog_version,
      'costResolution', case when source_snapshot.id is null then 'unresolved' else 'preserved_snapshot' end
    );
    v_retail := jsonb_build_object(
      'priceStatus', 'authoritative',
      'selectionFingerprint', v_fingerprint,
      'catalogVersion', v_price_catalog,
      'retail', jsonb_build_object(
        'base', v_unit,
        'surchargeLines', '[]'::jsonb,
        'unitPrice', v_unit,
        'discountPercent', 0,
        'discountAmount', 0,
        'onceTotal', 0,
        'quantity', l.quantity,
        'total', v_line_total
      ) || case when charges is null then '{}'::jsonb else jsonb_build_object('customerCharges', charges) end
    );
    insert into public.sales_quote_v2_price_snapshots (
      quote_id, line_item_id, design_id, quote_revision, selection_fingerprint, catalog_version,
      retail_total, internal_landed_cost_total, retail_snapshot, internal_cost_snapshot,
      validation_snapshot, provenance_snapshot, created_by
    ) values (
      q.id, l.id, d.id, v_revision, v_fingerprint, v_price_catalog, v_line_total,
      coalesce(source_snapshot.internal_landed_cost_total, 0), v_retail,
      coalesce(source_snapshot.internal_cost_snapshot, jsonb_build_object('status', 'unresolved', 'landedCostTotal', null)),
      jsonb_build_object('status', 'valid', 'mode', 'staff_retail_override'), v_provenance, actor
    ) returning id into snapshot_id;
  end if;
  update public.sales_quote_designs as design
  set unit_price = v_unit,
      options_json = coalesce(options_json, '{}'::jsonb) || jsonb_build_object(
        'price_source', 'live_site', 'live_margin', q.live_margin, 'live_net_unit_price', vendor_receipt.net_unit_price,
        'manual_customer_charge_policy', case when charges is null then null else 'blind-shade-install-ship-v2-setting' end
      ) || case when charges is null then '{}'::jsonb else jsonb_build_object('customer_charges', charges) end,
      quote_v2_price_status = case when q.quote_v2_backend then 'authoritative' else design.quote_v2_price_status end,
      quote_v2_selection_fingerprint = case when q.quote_v2_backend then v_fingerprint else design.quote_v2_selection_fingerprint end,
      quote_v2_priced_catalog_version = case when q.quote_v2_backend then v_price_catalog else design.quote_v2_priced_catalog_version end,
      quote_v2_priced_at = case when q.quote_v2_backend then now() else design.quote_v2_priced_at end,
      current_v2_snapshot_id = case when q.quote_v2_backend then snapshot_id else design.current_v2_snapshot_id end
  where design.id = d.id;
  update public.sales_quote_line_items set selected_design_id = d.id where id = l.id;
  insert into public.sales_quote_line_price_overrides (
    design_id, quote_id, unit_price, updated_by, customer_charge_policy, price_record_id, price_source
  ) values (
    d.id, q.id, v_unit, '00000000-0000-4000-8000-000000000050'::uuid,
    case when charges is null then null else 'blind-shade-install-ship-v2-setting' end,
    workflow_id, 'live_site'
  ) on conflict (design_id) do update
  set unit_price = excluded.unit_price, updated_at = now(), price_record_id = excluded.price_record_id,
      price_source = excluded.price_source, customer_charge_policy = excluded.customer_charge_policy;
  select coalesce(sum(chosen.net_line_total), 0), coalesce(sum(coalesce(chosen.installation, 0) + coalesce(chosen.shipping, 0)), 0)
  into manufacturer, product
  from public.crm_supplier_workflow_line_prices base
  left join lateral (
    select revision.net_line_total, revision.installation, revision.shipping
    from public.crm_live_lookup_line_price_revisions revision
    where revision.quote_id = base.quote_id and revision.line_id = base.line_id
      and revision.price_source = 'live_site'
    order by revision.created_at desc, revision.id desc
    limit 1
  ) rev on true
  cross join lateral (
    select
      case when rev.net_line_total is not null then rev.net_line_total else base.net_line_total end as net_line_total,
      case when rev.net_line_total is not null then rev.installation else base.installation end as installation,
      case when rev.net_line_total is not null then rev.shipping else base.shipping end as shipping
  ) chosen
  where base.quote_id = q.id
    and (rev.net_line_total is not null or base.components->>'mode' = 'supplier_cost');
  product := round(manufacturer + product, 2);
  select coalesce(sum(chosen.unit_price * li.quantity
    + coalesce((chosen.options_json#>>'{customer_charges,total}')::numeric, 0)), 0)
  into total
  from public.sales_quote_line_items li
  join public.sales_quote_designs chosen on chosen.id = li.selected_design_id
  where li.quote_id = q.id;
  select count(*) into line_count from public.sales_quote_line_items where quote_id = q.id;
  select count(*) into open_count
  from public.sales_quote_line_items li
  where li.quote_id = q.id
    and public.live_line_current_price_source(li.id) is null;
  if q.status = 'draft' and q.quote_v2_status in ('draft', 'stale', 'priced', 'blocked') then
    next_status := case
      when not q.quote_v2_backend then q.quote_v2_status
      when line_count > 0 and open_count = 0 then 'priced'
      else 'blocked'
    end;
    update public.sales_quotes
    set manufacturer_cost = round(manufacturer, 2), product_cost = product, total_amount = round(total, 2),
        quote_v2_revision = case when quote_v2_backend then v_revision else quote_v2_revision end,
        quote_v2_status = next_status,
        quote_v2_catalog_version = case when quote_v2_backend then (
          select string_agg(distinct sd.quote_v2_priced_catalog_version, ',' order by sd.quote_v2_priced_catalog_version)
          from public.sales_quote_line_items li
          join public.sales_quote_designs sd on sd.id = li.selected_design_id
          where li.quote_id = q.id
            and li.archived_at is null
            and sd.quote_v2_priced_catalog_version is not null
        ) else quote_v2_catalog_version end
    where id = q.id
      and status = 'draft'
      and quote_v2_status in ('draft', 'stale', 'priced', 'blocked');
  else
    next_status := 'quote_not_draft';
    v_revision := coalesce(q.quote_v2_revision, 0);
  end if;
  outcome := jsonb_build_object(
    'designId', d.id, 'unitPrice', v_unit, 'installation', v_install, 'shipping', v_ship,
    'margin', q.live_margin, 'recordId', workflow_id, 'priceSource', 'live_site',
    'manufacturerCost', round(manufacturer, 2), 'productCost', product, 'total', round(total, 2),
    'revision', v_revision, 'quoteStatus', next_status
  );
  insert into public.sales_quote_line_price_events (
    request_id, quote_id, line_item_id, variant, unit_price, previous_price, actor_id, result
  ) values (p_request_id, q.id, l.id, p_variant, v_unit, d.unit_price, actor, outcome);
  return outcome;
end $live$;
