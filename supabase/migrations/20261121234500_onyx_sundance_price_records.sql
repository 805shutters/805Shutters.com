-- Onyx and Sundance price records use 805-price-record/v1.
-- Additive. Replaces the price-record functions. Does not drop tables,
-- columns, or rows, and does not truncate. Does not insert vendor account
-- rows. Onyx and Sundance account numbers are not in the repo, so a receipt
-- for either vendor fails closed with no_vendor_account until a real account
-- row exists. Does not read or write crm_live_lookup_switch, so onyx and
-- sundance stay off.
--
-- spec_hash stays the SHA-256 of canonical
-- {"height_eighths","manufacturer","options","product","width_eighths"}.
-- Onyx and Sundance normalize product aliases and option keys before that
-- hash. Norman does not. A portal price that is not dealer net is not stored
-- by this migration; the receipt still requires dealer_net_base_price.
-- price_line_from_receipt still prices through the same live-lookup path.
-- A vendor with no active account row raises no_vendor_account and writes
-- no price. A spec mismatch still raises spec_changed.

create or replace function public.price_record_option_key(p_key text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $live$
  select regexp_replace(
    regexp_replace(lower(btrim(coalesce(p_key, ''), E' \t\n\r')), '[\t\n\r -]+', '_', 'g'),
    '_+', '_', 'g'
  );
$live$;

create or replace function public.price_record_product_key(p_manufacturer text, p_product text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $live$
declare
  mfr text := lower(btrim(coalesce(p_manufacturer, ''), E' \t\n\r'));
  trimmed text := lower(btrim(coalesce(p_product, ''), E' \t\n\r'));
  loose text := regexp_replace(trimmed, '[\t\n\r ]+', ' ', 'g');
begin
  if mfr = 'onyx' then
    return case loose
      when 'painted basswood' then 'painted_basswood'
      when 'stained basswood' then 'stained_basswood'
      when 'sycamore' then 'secamore'
      when 'secamore' then 'secamore'
      when 'vlo hybrid' then 'vlo_hybrid'
      when 'vlo' then 'vlo_hybrid'
      when 'onyx us made vinyl' then 'onyx_us_made_vinyl'
      when 'us made vinyl' then 'onyx_us_made_vinyl'
      when 'poly composite' then 'poly_composite'
      when 'onyx signature roller shades' then 'onyx_signature_roller'
      when 'onyx signature sunscreen shades' then 'onyx_signature_sunscreen'
      when 'onyx signature zebra shades' then 'onyx_signature_zebra'
      when 'onyx lux fabric blinds' then 'onyx_lux_fabric_blinds'
      when 'onyx lux honeycomb shades' then 'onyx_lux_honeycomb'
      when 'onyx lux sheerview shades' then 'onyx_lux_sheerview'
      when 'onyx woven wood shades' then 'onyx_woven'
      when 'onyx ash shutters' then 'onyx_ash_shutters'
      else trimmed
    end;
  end if;
  if mfr = 'sundance' then
    return case loose
      when 'sundance roller' then 'sundance_roller'
      when 'sundance flat roman' then 'sundance_flat_roman'
      when 'sundance europanels' then 'sundance_europanels'
      when 'louvolite roller' then 'sundance_louvolite_roller'
      when 'louvolite flat roman' then 'sundance_louvolite_flat_roman'
      when 'louvolite europanels' then 'sundance_louvolite_europanels'
      when 'sundance zebra' then 'sundance_zebra'
      when 'louvolite zebra' then 'sundance_louvolite_zebra'
      when 'sheerview' then 'sundance_sheerview'
      when 'sundance sheerview' then 'sundance_sheerview'
      when 'sheer view' then 'sundance_sheerview'
      when 'cellular horizontal' then 'sundance_cellular'
      when 'verticell' then 'sundance_verticell'
      when 'cellular specialty shapes' then 'sundance_cellular_shapes'
      when 'advantage ii 2-inch faux wood' then 'sundance_advantage_ii_2'
      when 'advantage ii 2.5-inch faux wood' then 'sundance_advantage_ii_2_5'
      when 'premium ii 2-inch wood' then 'sundance_premium_ii_2'
      when 'premium ii 2.5-inch wood' then 'sundance_premium_ii_2_5'
      when '2-inch aluminum 8-gauge' then 'sundance_aluminum_2'
      when '1-inch aluminum variants' then 'sundance_aluminum_1'
      when 'basicvue 2-inch faux wood' then 'sundance_basicvue'
      when 'chateau woods 2/2.5-inch' then 'sundance_chateau_woods'
      when 'vertical essence custom/stock' then 'sundance_vertical_essence'
      when 'custom wood shutters' then 'sundance_wood_shutters'
      when 'solid vinyl shutters' then 'sundance_vinyl_shutters'
      when 'exterior cable-guided' then 'sundance_exterior_cable'
      when 'exterior zipscreen' then 'sundance_exterior_zip'
      when 'walden premier woven' then 'sundance_walden_premier'
      when 'walden select woven' then 'sundance_walden_select'
      when 'portfolio roman' then 'sundance_portfolio_roman'
      else trimmed
    end;
  end if;
  return trimmed;
end $live$;

create or replace function public.price_record_spec_options(p_manufacturer text, p_options jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $live$
declare
  raw jsonb := coalesce(p_options, '{}'::jsonb);
  key text;
  next_key text;
  built jsonb := '{}'::jsonb;
  mfr text := lower(btrim(coalesce(p_manufacturer, ''), E' \t\n\r'));
  omit text[] := array[
    'manufacturer', 'catalog_manufacturer', 'manufacturerId',
    'product', 'catalog_product_id', 'productId', 'quote_lab_product_id',
    'price_source', 'live_margin', 'live_net_unit_price', 'manual_customer_charge_policy',
    'customer_charges', 'manual_typed_by', 'unit_price', 'priced_at', 'created_at', 'updated_at',
    'quote_v2_price_status', 'authoritative_price_status', 'manual_price_override',
    'priced_selection_fingerprint', 'priced_catalog_version',
    'grand_total', 'list_price', 'list_unit_price', 'msrp', 'suggested_retail',
    'dealer_factor', 'net_price', 'dealer_net', 'dealer_net_base_price', 'retail_price', 'extended_price'
  ];
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    raise exception 'options must be an object';
  end if;
  for key in select obj.key from jsonb_object_keys(raw) as obj(key) loop
    next_key := case
      when mfr in ('onyx', 'sundance') then public.price_record_option_key(key)
      else key
    end;
    if next_key is null or next_key = '' then
      raise exception 'option key is empty';
    end if;
    if mfr = 'onyx' and next_key in ('width_a', 'height_b') then
      continue;
    end if;
    if key = any(omit) or next_key = any(omit) then
      continue;
    end if;
    if jsonb_exists(built, next_key) then
      raise exception 'option keys collide';
    end if;
    built := built || jsonb_build_object(next_key, raw -> key);
  end loop;
  return built;
end $live$;

create or replace function public.price_record_line_spec_hash(p_line_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $live$
declare
  line public.sales_quote_line_items%rowtype;
  options jsonb := '{}'::jsonb;
  manufacturer text := '';
  product text := '';
  key text;
  next_key text;
  alt integer;
  width_eighths integer;
  height_eighths integer;
  whole_text text;
  payload jsonb;
begin
  select * into line from public.sales_quote_line_items where id = p_line_id;
  if not found then return null; end if;
  select coalesce(d.options_json, '{}'::jsonb)
    into options
  from public.sales_quote_designs d
  where d.line_item_id = line.id
  order by case
    when line.selected_design_id is not null and d.id = line.selected_design_id then 0
    when d.variant = 'A' then 1
    else 2
  end
  limit 1;
  if options is null then options := '{}'::jsonb; end if;
  manufacturer := lower(btrim(coalesce(
    nullif(btrim(options->>'manufacturer', E' \t\n\r'), ''),
    nullif(btrim(options->>'catalog_manufacturer', E' \t\n\r'), ''),
    nullif(btrim(options->>'manufacturerId', E' \t\n\r'), ''),
    ''
  ), E' \t\n\r'));
  product := public.price_record_product_key(manufacturer, coalesce(
    nullif(btrim(options->>'product', E' \t\n\r'), ''),
    nullif(btrim(options->>'catalog_product_id', E' \t\n\r'), ''),
    nullif(btrim(options->>'productId', E' \t\n\r'), ''),
    nullif(btrim(options->>'quote_lab_product_id', E' \t\n\r'), ''),
    nullif(btrim(line.product_type, E' \t\n\r'), ''),
    ''
  ));
  width_eighths := public.price_record_eighths(line.width_whole, line.width_fraction);
  height_eighths := public.price_record_eighths(line.height_whole, line.height_fraction);
  if manufacturer = 'onyx' then
    for key in select obj.key from jsonb_object_keys(options) as obj(key) loop
      next_key := public.price_record_option_key(key);
      if next_key not in ('width_a', 'height_b') then
        continue;
      end if;
      if jsonb_typeof(options -> key) is distinct from 'object' then
        raise exception 'size fraction is not a number';
      end if;
      if jsonb_exists(options -> key, 'whole')
         and jsonb_typeof((options -> key) -> 'whole') is distinct from 'number'
         and jsonb_typeof((options -> key) -> 'whole') is distinct from 'null' then
        raise exception 'size fraction is not a number';
      end if;
      if jsonb_exists(options -> key, 'fraction')
         and jsonb_typeof((options -> key) -> 'fraction') is distinct from 'string'
         and jsonb_typeof((options -> key) -> 'fraction') is distinct from 'null' then
        raise exception 'size fraction is not a number';
      end if;
      whole_text := options -> key ->> 'whole';
      if whole_text is not null and whole_text <> '' and whole_text !~ '^-?[0-9]+$' then
        raise exception 'size fraction is not a number';
      end if;
      alt := public.price_record_eighths(
        case when whole_text is null or whole_text = '' then null else whole_text::integer end,
        options -> key ->> 'fraction'
      );
      if next_key = 'width_a' then
        if width_eighths is not null and alt is not null and width_eighths is distinct from alt then
          raise exception 'spec size conflict';
        end if;
        width_eighths := coalesce(width_eighths, alt);
      else
        if height_eighths is not null and alt is not null and height_eighths is distinct from alt then
          raise exception 'spec size conflict';
        end if;
        height_eighths := coalesce(height_eighths, alt);
      end if;
    end loop;
  end if;
  options := public.price_record_spec_options(manufacturer, options);
  payload := jsonb_build_object(
    'height_eighths', height_eighths,
    'manufacturer', manufacturer,
    'options', coalesce(options, '{}'::jsonb),
    'product', product,
    'width_eighths', width_eighths
  );
  return public.price_record_sha256(public.price_record_canonical_json(payload));
end $live$;

create or replace function public.record_vendor_price_receipt(
  p_quote_id uuid, p_expected_revision bigint, p_receipt jsonb, p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $live$
declare
  q public.sales_quotes%rowtype;
  account public.crm_vendor_accounts%rowtype;
  line_ref uuid;
  net_unit numeric;
  observed timestamptz;
  record_id uuid;
  source_url text;
  evidence text;
  captured_by text;
  expected_hash text;
  vendor_name text;
begin
  if p_actor is null or p_actor not in ('mike', 'jessica') then
    raise exception 'receipt actor must be mike or jessica';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
     or p_receipt->>'schema' is distinct from '805-price-record/v1' then
    raise exception 'schema must be 805-price-record/v1';
  end if;
  vendor_name := p_receipt->>'vendor';
  if vendor_name is null or vendor_name not in ('norman', 'onyx', 'sundance', 'lotus') then
    raise exception 'vendor is not a live-lookup manufacturer';
  end if;
  if nullif(btrim(p_receipt->>'captured_at'), '') is null then
    raise exception 'captured_at is missing';
  end if;
  begin
    observed := (p_receipt->>'captured_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'captured_at is missing';
  end;
  if observed is null then raise exception 'captured_at is missing'; end if;
  source_url := nullif(btrim(p_receipt->>'source_url'), '');
  evidence := nullif(btrim(p_receipt->>'evidence'), '');
  if source_url is null and evidence is null then
    raise exception 'source_url or evidence is required';
  end if;
  if source_url is not null and source_url !~ '^https://' then
    raise exception 'source_url must be an https URL';
  end if;
  captured_by := btrim(p_receipt->>'captured_by');
  if captured_by is null or captured_by !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    raise exception 'captured_by bot is required';
  end if;
  if vendor_name in ('onyx', 'sundance') and captured_by is distinct from vendor_name then
    raise exception 'captured_by must be the manufacturer bot';
  end if;
  if vendor_name = 'onyx' and source_url is not null
     and source_url !~ '^https://admin[.]onyxshutters[.]com($|[/?])' then
    raise exception 'source_url is not the manufacturer portal';
  end if;
  if vendor_name = 'sundance' and source_url is not null
     and source_url !~ '^https://sundance[.]blindata[.]app($|[/?])' then
    raise exception 'source_url is not the manufacturer portal';
  end if;
  if p_receipt->>'currency' is distinct from 'USD' then
    raise exception 'currency must be USD';
  end if;
  if nullif(p_receipt->>'line_id', '') is null then
    raise exception 'line_id is missing';
  end if;
  begin
    line_ref := (p_receipt->>'line_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'line_id is unknown';
  end;
  begin
    net_unit := (p_receipt->>'dealer_net_base_price')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dealer net base price must be a positive number';
  end;
  if net_unit is null or net_unit <= 0 or net_unit <> round(net_unit, 2)
     or net_unit::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'dealer net base price must be a positive number';
  end if;
  select * into q from public.sales_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if q.quote_v2_backend and p_expected_revision is distinct from q.quote_v2_revision then
    raise exception 'stale_revision';
  end if;
  if not exists (
    select 1 from public.sales_quote_line_items where id = line_ref and quote_id = q.id
  ) then
    raise exception 'line_id is unknown';
  end if;
  select * into account
  from public.crm_vendor_accounts
  where vendor = vendor_name
    and account_number = p_receipt->>'account'
    and active;
  if not found then
    if not exists (
      select 1 from public.crm_vendor_accounts where vendor = vendor_name and active
    ) then
      raise exception 'no_vendor_account';
    end if;
    raise exception 'vendor account is not an 805 account';
  end if;
  expected_hash := public.price_record_line_spec_hash(line_ref);
  if p_receipt->>'spec_hash' is distinct from expected_hash then
    raise exception 'spec_hash does not match the line';
  end if;
  insert into public.crm_vendor_price_receipts (
    quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, vendor_account_id,
    observed_at, net_unit_price, net_line_total, currency, portal_url, evidence,
    source_bot_id, screenshot_path, captured_by, receipt, actor
  ) values (
    q.id, line_ref, coalesce(q.quote_v2_revision, 0), expected_hash,
    account.vendor, account.account_number, account.id,
    observed, net_unit, net_unit, 'USD', source_url, evidence,
    case
      when captured_by ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then captured_by::uuid
      else null
    end,
    evidence, captured_by, p_receipt, p_actor
  ) returning id into record_id;
  return jsonb_build_object(
    'records', jsonb_build_array(jsonb_build_object(
      'line_id', line_ref,
      'record_id', record_id,
      'vendor_account_id', account.id
    )),
    'blocked_lines', '[]'::jsonb
  );
end $live$;

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
begin
  if p_request_id is null or nullif(btrim(p_variant), '') is null then
    raise exception 'A request ID and design are required.';
  end if;
  select * into previous from public.sales_quote_line_price_events where request_id = p_request_id;
  if found then return previous.result; end if;
  select * into q from public.sales_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
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
  update public.sales_quote_designs as design
  set unit_price = v_unit,
      options_json = coalesce(options_json, '{}'::jsonb) || jsonb_build_object(
        'price_source', 'live_site', 'live_margin', q.live_margin, 'live_net_unit_price', vendor_receipt.net_unit_price,
        'manual_customer_charge_policy', case when charges is null then null else 'blind-shade-install-ship-v2-setting' end
      ) || case when charges is null then '{}'::jsonb else jsonb_build_object('customer_charges', charges) end
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
  update public.sales_quotes
  set manufacturer_cost = round(manufacturer, 2), product_cost = product, total_amount = round(total, 2),
      quote_v2_revision = case when q.quote_v2_backend then v_revision else quote_v2_revision end
  where id = q.id;
  actor := '00000000-0000-4000-8000-000000000050'::uuid;
  outcome := jsonb_build_object(
    'designId', d.id, 'unitPrice', v_unit, 'installation', v_install, 'shipping', v_ship,
    'margin', q.live_margin, 'recordId', workflow_id, 'priceSource', 'live_site',
    'manufacturerCost', round(manufacturer, 2), 'productCost', product, 'total', round(total, 2),
    'revision', v_revision
  );
  insert into public.sales_quote_line_price_events (
    request_id, quote_id, line_item_id, variant, unit_price, previous_price, actor_id, result
  ) values (p_request_id, q.id, l.id, p_variant, v_unit, d.unit_price, actor, outcome);
  return outcome;
end $live$;

revoke all on function public.price_record_option_key(text) from public, anon, authenticated;
revoke all on function public.price_record_product_key(text, text) from public, anon, authenticated;
revoke all on function public.price_record_spec_options(text, jsonb) from public, anon, authenticated;
revoke all on function public.price_record_line_spec_hash(uuid) from public, anon, authenticated;
revoke all on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid) from public, anon, authenticated;

grant execute on function public.price_record_option_key(text) to service_role;
grant execute on function public.price_record_product_key(text, text) to service_role;
grant execute on function public.price_record_spec_options(text, jsonb) to service_role;
grant execute on function public.price_record_line_spec_hash(uuid) to service_role;
grant execute on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) to service_role;
grant execute on function public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid) to service_role;

do $live$
begin
  if exists (select 1 from pg_roles where rolname = 'crm_price_bot') then
    execute 'grant execute on function public.price_record_line_spec_hash(uuid) to crm_price_bot';
    execute 'grant execute on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) to crm_price_bot';
  end if;
end $live$;
