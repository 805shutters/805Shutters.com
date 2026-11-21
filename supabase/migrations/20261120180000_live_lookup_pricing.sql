-- Live lookup pricing. Additive and idempotent.
-- Not applied to production by the pull request that adds this file.
-- Every vendor switch is inserted false and is never turned on here.
-- crm_supplier_workflow_line_prices already exists in production. This file
-- does not drop columns. job_id is made nullable so an 805 quote row can omit it.

alter table public.sales_quotes
  add column if not exists live_margin numeric(6,3),
  add column if not exists live_margin_set_by text,
  add column if not exists live_margin_set_at timestamptz,
  add column if not exists manufacturer_cost numeric(12,2),
  add column if not exists product_cost numeric(12,2);

do $live$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_quotes_live_margin_positive') then
    alter table public.sales_quotes
      add constraint sales_quotes_live_margin_positive check (live_margin > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_quotes_live_margin_set_by_known') then
    alter table public.sales_quotes
      add constraint sales_quotes_live_margin_set_by_known
      check (live_margin_set_by is null or live_margin_set_by in ('mike', 'jessica'));
  end if;
end $live$;

create table if not exists public.crm_quote_charge_settings (
  key text primary key,
  amount numeric(10,2) not null check (amount >= 0),
  applies_to text not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

insert into public.crm_quote_charge_settings (key, amount, applies_to, updated_by)
values
  ('install_per_unit', 25.00, 'blind_shade_units', 'mike (2026-11-20)'),
  ('ship_per_unit', 14.00, 'blind_shade_units', 'mike (2026-11-20)')
on conflict (key) do nothing;

create table if not exists public.crm_live_lookup_switch (
  vendor text primary key check (vendor in ('norman', 'onyx', 'sundance', 'lotus')),
  enabled boolean not null default false,
  changed_by text,
  changed_at timestamptz
);

insert into public.crm_live_lookup_switch (vendor, enabled)
values ('norman', false), ('onyx', false), ('sundance', false), ('lotus', false)
on conflict (vendor) do nothing;

create table if not exists public.crm_supplier_workflow_line_prices (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  job_id uuid,
  quote_id uuid not null,
  line_id uuid not null,
  design_id uuid not null,
  source_line_id uuid not null,
  product_cost numeric not null,
  merchandise numeric,
  installation numeric,
  shipping numeric,
  line_total numeric not null,
  components jsonb not null,
  receipt jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  vendor text,
  vendor_account text,
  portal_draft_id text,
  portal_url text,
  observed_at timestamptz,
  source_bot_id uuid,
  screenshot_path text,
  spec_hash text,
  net_unit_price numeric(12,2),
  net_line_total numeric(12,2),
  list_unit_price numeric(12,2),
  margin numeric(6,3),
  price_source text,
  manual_typed_by text
);

alter table public.crm_supplier_workflow_line_prices
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists vendor text,
  add column if not exists vendor_account text,
  add column if not exists portal_draft_id text,
  add column if not exists portal_url text,
  add column if not exists observed_at timestamptz,
  add column if not exists source_bot_id uuid,
  add column if not exists screenshot_path text,
  add column if not exists spec_hash text,
  add column if not exists net_unit_price numeric(12,2),
  add column if not exists net_line_total numeric(12,2),
  add column if not exists list_unit_price numeric(12,2),
  add column if not exists margin numeric(6,3),
  add column if not exists price_source text,
  add column if not exists manual_typed_by text;

alter table public.crm_supplier_workflow_line_prices
  alter column job_id drop not null;

update public.crm_supplier_workflow_line_prices
set id = gen_random_uuid()
where id is null;

alter table public.crm_supplier_workflow_line_prices
  alter column id set not null;

do $live$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_supplier_workflow_line_prices'::regclass
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) like '%(id)%'
  ) then
    alter table public.crm_supplier_workflow_line_prices
      add constraint crm_supplier_workflow_line_prices_id_key unique (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_supplier_workflow_line_prices_price_source_known') then
    alter table public.crm_supplier_workflow_line_prices
      add constraint crm_supplier_workflow_line_prices_price_source_known
      check (price_source is null or price_source in ('live_site', 'manual_no_source'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_supplier_workflow_line_prices_manual_typed_by_known') then
    alter table public.crm_supplier_workflow_line_prices
      add constraint crm_supplier_workflow_line_prices_manual_typed_by_known
      check (manual_typed_by is null or manual_typed_by in ('mike', 'jessica'));
  end if;
end $live$;

alter table public.sales_quote_line_price_overrides
  add column if not exists price_record_id uuid,
  add column if not exists price_source text;

do $live$
declare existing text;
begin
  select conname into existing
  from pg_constraint
  where conrelid = 'public.sales_quote_line_price_overrides'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%customer_charge_policy%'
    and pg_get_constraintdef(oid) not ilike '%blind-shade-install-ship-v2-setting%'
  limit 1;
  if existing is not null then
    execute format('alter table public.sales_quote_line_price_overrides drop constraint %I', existing);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_quote_line_price_overrides_charge_policy_known') then
    alter table public.sales_quote_line_price_overrides
      add constraint sales_quote_line_price_overrides_charge_policy_known
      check (customer_charge_policy is null or customer_charge_policy in (
        'blind-shade-install-ship-v1', 'blind-shade-install-ship-v2-setting'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_quote_line_price_overrides_price_source_known') then
    alter table public.sales_quote_line_price_overrides
      add constraint sales_quote_line_price_overrides_price_source_known
      check (price_source is null or price_source in ('live_site', 'manual_no_source'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_quote_line_price_overrides_price_record_fk') then
    alter table public.sales_quote_line_price_overrides
      add constraint sales_quote_line_price_overrides_price_record_fk
      foreign key (price_record_id) references public.crm_supplier_workflow_line_prices (id);
  end if;
end $live$;

create or replace function public.live_lookup_spec_hash(p_quote_id uuid, p_revision bigint)
returns text
language sql
immutable
set search_path = public, pg_temp
as $live$
  select md5(p_quote_id::text || ':' || coalesce(p_revision, 0)::text);
$live$;

create or replace function public.live_lookup_eligible_units(
  p_product text, p_program text, p_configuration jsonb, p_quantity numeric
) returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $live$
declare
  identity text := regexp_replace(lower(concat_ws(' ', coalesce(p_product, ''), coalesce(p_program, ''))), '[_-]+', ' ', 'g');
  selected text;
  units numeric := 1;
  key text;
  keys text[];
  product text := lower(coalesce(p_product, ''));
begin
  if identity ~ '(shutter|headrail|head rail|vane|remote|accessor|parts|pillow|awning|drapery|fabric by|valance only)'
     or identity !~ '(blind|shade|roller|roman|honeycomb|cellular|sheer|smartdrape|smart drape|synchrony|faux|wood|vertical|mini|vinyl|polar (elite|titan|mega|all seasons|allseasons|interior|exterior))' then
    return 0;
  end if;
  if p_quantity is null or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
     or p_quantity <> trunc(p_quantity) or p_quantity < 1 then
    raise exception 'Invalid physical blind/shade count or line quantity.';
  end if;
  selected := regexp_replace(lower(concat_ws(' ',
    p_configuration->>'lift_system', p_configuration->>'honeycomb_operating_system',
    p_configuration->>'shade_type', p_configuration->>'roller_application')), '[_&-]+', ' ', 'g');
  if product = 'honeycomb' then
    units := case when selected ~ 'smartfit.*dual' then 2 else 1 end;
  elsif product like 'lotus_%' then keys := array['lotus_blind_count'];
  elsif product in ('smartprivacy_faux', 'faux_wood') then keys := array['faux_blind_count'];
  elsif product = 'roller' then
    keys := array['roller_coupling_count', 'coupled_shade_count', 'lightguard_360_shade_count'];
    if selected ~ 'dual' then units := 2; end if;
  elsif product = 'roman' and selected ~ 'common valance' then units := 2;
  end if;
  if keys is not null then
    foreach key in array keys loop
      if nullif(p_configuration->>key, '') is not null then
        units := (p_configuration->>key)::numeric;
        exit;
      end if;
    end loop;
  end if;
  if units is null or units::text in ('NaN', 'Infinity', '-Infinity')
     or units <> trunc(units) or units < 1 or units > 4 then
    raise exception 'Invalid physical blind/shade count.';
  end if;
  return units * p_quantity;
end $live$;

-- v1 snapshots stay exact. v2 accepts the visible charge setting.
create or replace function public.quote_customer_charges(p_charges jsonb, p_quantity numeric default null)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $live$
declare
  v_key text;
  v_units numeric;
  v_quantity numeric;
  v_count numeric;
  v_install numeric;
  v_ship numeric;
  v_expected jsonb;
begin
  if p_charges is null or p_charges = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_charges) <> 'object'
    or p_charges->>'version' not in ('blind-shade-install-ship-v1', 'blind-shade-install-ship-v2-setting') then
    raise exception 'Invalid customer installation/shipping policy.' using errcode='22023';
  end if;
  foreach v_key in array array['eligibleUnitsPerWindow','quantity','eligibleUnitCount',
    'installationPerUnit','shippingPerUnit','installationTotal','shippingTotal','perWindowTotal','total'] loop
    if jsonb_typeof(p_charges->v_key) is distinct from 'number' then
      raise exception 'Customer charge % must be numeric.', v_key using errcode='22023';
    end if;
  end loop;
  v_units := (p_charges->>'eligibleUnitsPerWindow')::numeric;
  v_quantity := (p_charges->>'quantity')::numeric;
  if v_units < 1 or v_units <> trunc(v_units) or v_quantity < 1 or v_quantity <> trunc(v_quantity)
    or (p_quantity is not null and v_quantity <> p_quantity) then
    raise exception 'Customer charges do not match the positive whole line quantity.' using errcode='22023';
  end if;
  v_count := v_units * v_quantity;
  if p_charges->>'version' = 'blind-shade-install-ship-v1' then
    v_expected := jsonb_build_object('version','blind-shade-install-ship-v1',
      'eligibleUnitsPerWindow',v_units,'quantity',v_quantity,'eligibleUnitCount',v_count,
      'installationPerUnit',25,'shippingPerUnit',14,
      'installationTotal',25*v_count,'shippingTotal',14*v_count,
      'perWindowTotal',39*v_units,'total',39*v_count);
    if p_charges is distinct from v_expected then
      raise exception 'Customer installation/shipping amounts or fields do not match their policy.' using errcode='22023';
    end if;
    return v_expected;
  end if;
  v_install := (p_charges->>'installationPerUnit')::numeric;
  v_ship := (p_charges->>'shippingPerUnit')::numeric;
  if v_install < 0 or v_ship < 0
    or (p_charges->>'eligibleUnitCount')::numeric is distinct from v_count
    or (p_charges->>'installationTotal')::numeric is distinct from round(v_install * v_count, 2)
    or (p_charges->>'shippingTotal')::numeric is distinct from round(v_ship * v_count, 2)
    or (p_charges->>'perWindowTotal')::numeric is distinct from round((v_install + v_ship) * v_units, 2)
    or (p_charges->>'total')::numeric is distinct from round((v_install + v_ship) * v_count, 2) then
    raise exception 'Customer installation/shipping amounts or fields do not match their policy.' using errcode='22023';
  end if;
  return p_charges;
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
  line jsonb;
  line_ref uuid;
  seen uuid[] := array[]::uuid[];
  net_unit numeric;
  net_line numeric;
  observed timestamptz;
  record_id uuid;
  records jsonb := '[]'::jsonb;
  blocked jsonb := '[]'::jsonb;
  known uuid;
begin
  if p_actor is null or p_actor not in ('mike', 'jessica') then
    raise exception 'receipt actor must be mike or jessica';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
     or p_receipt->>'schema' is distinct from '805-live-price-record/v1' then
    raise exception 'schema must be 805-live-price-record/v1';
  end if;
  if p_receipt->>'vendor' is distinct from 'norman'
     or p_receipt->>'vendor_account' is distinct from 'RA00743' then
    raise exception 'vendor account is not an 805 account';
  end if;
  if nullif(p_receipt->>'observed_at', '') is null then
    raise exception 'observed_at is missing';
  end if;
  begin
    observed := (p_receipt->>'observed_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'observed_at is missing';
  end;
  if observed is null then raise exception 'observed_at is missing'; end if;
  if p_receipt->'lines' is null or jsonb_typeof(p_receipt->'lines') <> 'array'
     or jsonb_array_length(p_receipt->'lines') < 1 then
    raise exception 'line_ref is missing';
  end if;
  select * into q from public.sales_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if q.quote_v2_backend and p_expected_revision is distinct from q.quote_v2_revision then
    raise exception 'stale_revision';
  end if;
  if p_receipt->>'quote_ref' is distinct from coalesce(q.quote_v2_revision, 0)::text
     or p_receipt->>'spec_hash' is distinct from public.live_lookup_spec_hash(q.id, q.quote_v2_revision) then
    raise exception 'quote_ref or spec_hash does not match the quote revision';
  end if;
  for line in select value from jsonb_array_elements(p_receipt->'lines') loop
    if nullif(line->>'line_ref', '') is null then raise exception 'line_ref is missing'; end if;
    begin
      line_ref := (line->>'line_ref')::uuid;
    exception when invalid_text_representation then
      raise exception 'line_ref is unknown';
    end;
    if line_ref = any(seen) then raise exception 'line_ref is duplicated'; end if;
    seen := seen || line_ref;
    if not exists (select 1 from public.sales_quote_line_items where id = line_ref and quote_id = q.id) then
      raise exception 'line_ref is unknown';
    end if;
    begin
      net_unit := (line->>'net_unit_price')::numeric;
      net_line := (line->>'net_line_total')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'net price must be a positive number';
    end;
    if net_unit is null or net_line is null or net_unit <= 0 or net_line <= 0
       or net_unit::text in ('NaN', 'Infinity', '-Infinity')
       or net_line::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'net price must be a positive number';
    end if;
  end loop;
  for line in select value from jsonb_array_elements(p_receipt->'lines') loop
    line_ref := (line->>'line_ref')::uuid;
    net_unit := (line->>'net_unit_price')::numeric;
    net_line := (line->>'net_line_total')::numeric;
    insert into public.crm_supplier_workflow_line_prices (
      request_id, job_id, quote_id, line_id, design_id, source_line_id, product_cost,
      line_total, components, receipt, result, vendor, vendor_account, portal_draft_id,
      portal_url, observed_at, source_bot_id, screenshot_path, spec_hash, net_unit_price,
      net_line_total, list_unit_price, price_source
    )
    select gen_random_uuid(), null, q.id, line_ref,
      coalesce(l.selected_design_id, (select d.id from public.sales_quote_designs d where d.line_item_id = l.id order by (d.variant = 'A') desc, d.id limit 1), line_ref),
      line_ref, net_line, net_line, '{}'::jsonb, p_receipt, jsonb_build_object('status', 'recorded'),
      p_receipt->>'vendor', p_receipt->>'vendor_account', p_receipt->>'portal_draft_id',
      p_receipt->>'portal_url', observed,
      case when nullif(p_receipt->>'source_bot_id', '') is null then null else (p_receipt->>'source_bot_id')::uuid end,
      p_receipt->>'screenshot_path', p_receipt->>'spec_hash', net_unit, net_line,
      case when nullif(line->>'list_unit_price', '') is null then null else (line->>'list_unit_price')::numeric end,
      'live_site'
    from public.sales_quote_line_items l
    where l.id = line_ref
    returning id into record_id;
    records := records || jsonb_build_array(jsonb_build_object('line_ref', line_ref, 'record_id', record_id));
  end loop;
  for known in select id from public.sales_quote_line_items where quote_id = q.id and not (id = any(seen)) loop
    blocked := blocked || jsonb_build_array(jsonb_build_object('line_ref', known, 'reason', 'not_in_receipt'));
  end loop;
  return jsonb_build_object('records', records, 'blocked_lines', blocked);
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
  price public.crm_supplier_workflow_line_prices%rowtype;
  previous public.sales_quote_line_price_events%rowtype;
  install_rate numeric;
  ship_rate numeric;
  eligible numeric;
  v_install numeric(12,2);
  v_ship numeric(12,2);
  v_unit numeric(12,2);
  v_revision bigint;
  manufacturer numeric(12,2);
  product numeric(12,2);
  total numeric(12,2);
  outcome jsonb;
  charges jsonb;
  actor uuid;
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
  select * into price from public.crm_supplier_workflow_line_prices where id = p_record_id for update;
  if not found or price.quote_id is distinct from q.id or price.line_id is distinct from p_line_item_id
     or price.price_source is distinct from 'live_site' or price.net_unit_price is null or price.net_unit_price <= 0 then
    if q.live_margin is null then raise exception 'no_margin'; end if;
    raise exception 'no_site_price';
  end if;
  if not exists (
    select 1 from public.crm_live_lookup_switch
    where vendor = price.vendor and enabled
  ) then
    raise exception 'switch_off';
  end if;
  if q.live_margin is null then raise exception 'no_margin'; end if;
  if price.spec_hash is distinct from public.live_lookup_spec_hash(q.id, q.quote_v2_revision) then
    raise exception 'spec_mismatch';
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
  v_unit := round(price.net_unit_price * q.live_margin, 2);
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
  update public.crm_supplier_workflow_line_prices as recorded
  set result = coalesce(recorded.result, '{}'::jsonb) || jsonb_build_object('priced', false)
  where recorded.quote_id = q.id and recorded.line_id = l.id and recorded.id <> price.id;
  update public.crm_supplier_workflow_line_prices as recorded
  set margin = q.live_margin,
      merchandise = v_unit,
      installation = v_install,
      shipping = v_ship,
      line_total = round(v_unit * l.quantity, 2) + v_install + v_ship,
      spec_hash = public.live_lookup_spec_hash(q.id, v_revision),
      result = coalesce(recorded.result, '{}'::jsonb) || jsonb_build_object(
        'priced', true, 'margin', q.live_margin, 'recordId', price.id, 'priceSource', 'live_site')
  where recorded.id = price.id;
  update public.sales_quote_designs as design
  set unit_price = v_unit,
      options_json = coalesce(options_json, '{}'::jsonb) || jsonb_build_object(
        'price_source', 'live_site', 'live_margin', q.live_margin, 'live_net_unit_price', price.net_unit_price,
        'manual_customer_charge_policy', case when charges is null then null else 'blind-shade-install-ship-v2-setting' end
      ) || case when charges is null then '{}'::jsonb else jsonb_build_object('customer_charges', charges) end
  where design.id = d.id;
  update public.sales_quote_line_items set selected_design_id = d.id where id = l.id;
  insert into public.sales_quote_line_price_overrides (
    design_id, quote_id, unit_price, updated_by, customer_charge_policy, price_record_id, price_source
  ) values (
    d.id, q.id, v_unit, '00000000-0000-4000-8000-000000000050'::uuid,
    case when charges is null then null else 'blind-shade-install-ship-v2-setting' end,
    price.id, 'live_site'
  ) on conflict (design_id) do update
  set unit_price = excluded.unit_price, updated_at = now(), price_record_id = excluded.price_record_id,
      price_source = excluded.price_source, customer_charge_policy = excluded.customer_charge_policy;
  select coalesce(sum(priced.net_line_total), 0), coalesce(sum(priced.installation + priced.shipping), 0)
  into manufacturer, product
  from public.crm_supplier_workflow_line_prices priced
  where priced.quote_id = q.id and priced.result->>'priced' = 'true';
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
    'margin', q.live_margin, 'recordId', price.id, 'priceSource', 'live_site',
    'manufacturerCost', round(manufacturer, 2), 'productCost', product, 'total', round(total, 2),
    'revision', v_revision
  );
  insert into public.sales_quote_line_price_events (
    request_id, quote_id, line_item_id, variant, unit_price, previous_price, actor_id, result
  ) values (p_request_id, q.id, l.id, p_variant, v_unit, d.unit_price, actor, outcome);
  return outcome;
end $live$;

create or replace function public.set_manual_line_price(
  p_quote_id uuid, p_line_item_id uuid, p_variant text, p_unit_price numeric,
  p_actor_id uuid, p_expected_revision bigint, p_request_id uuid, p_typed_by text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $live$
declare
  result jsonb;
  v_design uuid;
  record_id uuid;
begin
  if p_typed_by is null or p_typed_by not in ('mike', 'jessica') then
    raise exception 'typed_by must be mike or jessica';
  end if;
  result := public.set_sales_quote_line_price(
    p_quote_id, p_line_item_id, p_variant, p_unit_price, p_actor_id, p_expected_revision, p_request_id, false
  );
  v_design := (result->>'designId')::uuid;
  insert into public.crm_supplier_workflow_line_prices (
    request_id, job_id, quote_id, line_id, design_id, source_line_id, product_cost, line_total,
    components, receipt, result, price_source, manual_typed_by, observed_at
  ) values (
    gen_random_uuid(), null, p_quote_id, p_line_item_id, v_design, p_line_item_id, p_unit_price, p_unit_price,
    '{}'::jsonb,
    jsonb_build_object('schema', '805-live-price-record/v1', 'price_source', 'manual_no_source', 'typed_by', p_typed_by),
    result || jsonb_build_object('priceSource', 'manual_no_source', 'typedBy', p_typed_by),
    'manual_no_source', p_typed_by, now()
  ) returning id into record_id;
  update public.sales_quote_line_price_overrides
  set price_source = 'manual_no_source', price_record_id = record_id
  where design_id = v_design;
  update public.sales_quote_designs as design
  set options_json = coalesce(design.options_json, '{}'::jsonb) || jsonb_build_object('price_source', 'manual_no_source', 'manual_typed_by', p_typed_by)
  where design.id = v_design;
  return result || jsonb_build_object('priceSource', 'manual_no_source', 'typedBy', p_typed_by, 'recordId', record_id);
end $live$;

create or replace function public.set_quote_live_margin(
  p_quote_id uuid, p_margin numeric, p_set_by text, p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $live$
declare q public.sales_quotes%rowtype;
begin
  select * into q from public.sales_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if q.quote_v2_backend and p_expected_revision is distinct from q.quote_v2_revision then
    raise exception 'stale_revision';
  end if;
  if p_margin is null then
    update public.sales_quotes
    set live_margin = null, live_margin_set_by = null, live_margin_set_at = null
    where id = q.id;
    return jsonb_build_object('quoteId', q.id, 'liveMargin', null, 'setBy', null);
  end if;
  if p_margin <= 0 or p_margin::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'margin must be a positive number';
  end if;
  if p_set_by is null or p_set_by not in ('mike', 'jessica') then
    raise exception 'live margin must be set by mike or jessica';
  end if;
  update public.sales_quotes
  set live_margin = p_margin, live_margin_set_by = p_set_by, live_margin_set_at = now()
  where id = q.id;
  return jsonb_build_object('quoteId', q.id, 'liveMargin', p_margin, 'setBy', p_set_by);
end $live$;

revoke all on function public.live_lookup_spec_hash(uuid, bigint) from public, anon, authenticated;
revoke all on function public.live_lookup_eligible_units(text, text, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid) from public, anon, authenticated;
revoke all on function public.set_manual_line_price(uuid, uuid, text, numeric, uuid, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.set_quote_live_margin(uuid, numeric, text, bigint) from public, anon, authenticated;
grant execute on function public.live_lookup_spec_hash(uuid, bigint) to service_role;
grant execute on function public.live_lookup_eligible_units(text, text, jsonb, numeric) to service_role;
grant execute on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) to service_role;
grant execute on function public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid) to service_role;
grant execute on function public.set_manual_line_price(uuid, uuid, text, numeric, uuid, bigint, uuid, text) to service_role;
grant execute on function public.set_quote_live_margin(uuid, numeric, text, bigint) to service_role;

-- Bots do not receive update rights. Staff writes go through is_805_crm_writer();
-- service_role is the CRM server. Direct non-staff updates are rejected.
create or replace function public.guard_live_lookup_staff_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $live$
begin
  if (select rolsuper from pg_roles where rolname = current_user)
     or current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.is_805_crm_writer() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'permission denied' using errcode = '42501';
end $live$;

drop trigger if exists guard_live_lookup_switch_write on public.crm_live_lookup_switch;
create trigger guard_live_lookup_switch_write
before insert or update or delete on public.crm_live_lookup_switch
for each row execute function public.guard_live_lookup_staff_write();

drop trigger if exists guard_quote_charge_settings_write on public.crm_quote_charge_settings;
create trigger guard_quote_charge_settings_write
before insert or update or delete on public.crm_quote_charge_settings
for each row execute function public.guard_live_lookup_staff_write();

create or replace function public.guard_sales_quote_live_margin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $live$
begin
  if new.live_margin is not distinct from old.live_margin
     and new.live_margin_set_by is not distinct from old.live_margin_set_by
     and new.live_margin_set_at is not distinct from old.live_margin_set_at then
    return new;
  end if;
  if (select rolsuper from pg_roles where rolname = current_user)
     or current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.is_805_crm_writer() then
    return new;
  end if;
  raise exception 'permission denied' using errcode = '42501';
end $live$;

drop trigger if exists guard_sales_quote_live_margin on public.sales_quotes;
create trigger guard_sales_quote_live_margin
before update on public.sales_quotes
for each row execute function public.guard_sales_quote_live_margin();

alter table public.crm_quote_charge_settings enable row level security;
alter table public.crm_live_lookup_switch enable row level security;
alter table public.crm_supplier_workflow_line_prices enable row level security;

revoke all on public.crm_quote_charge_settings, public.crm_live_lookup_switch, public.crm_supplier_workflow_line_prices
  from public, anon, authenticated;
grant select on public.crm_quote_charge_settings, public.crm_live_lookup_switch, public.crm_supplier_workflow_line_prices
  to authenticated;
grant update on public.crm_quote_charge_settings, public.crm_live_lookup_switch to authenticated;
grant all on public.crm_quote_charge_settings, public.crm_live_lookup_switch, public.crm_supplier_workflow_line_prices
  to service_role;

drop policy if exists staff_read_quote_charge_settings on public.crm_quote_charge_settings;
create policy staff_read_quote_charge_settings on public.crm_quote_charge_settings
  for select to authenticated using (public.is_805_crm_user());
drop policy if exists staff_update_quote_charge_settings on public.crm_quote_charge_settings;
create policy staff_update_quote_charge_settings on public.crm_quote_charge_settings
  for update to authenticated
  using (true) with check (public.is_805_crm_writer());

drop policy if exists staff_read_live_lookup_switch on public.crm_live_lookup_switch;
create policy staff_read_live_lookup_switch on public.crm_live_lookup_switch
  for select to authenticated using (public.is_805_crm_user());
drop policy if exists staff_update_live_lookup_switch on public.crm_live_lookup_switch;
create policy staff_update_live_lookup_switch on public.crm_live_lookup_switch
  for update to authenticated
  using (true) with check (public.is_805_crm_writer());

drop policy if exists staff_read_workflow_line_prices on public.crm_supplier_workflow_line_prices;
create policy staff_read_workflow_line_prices on public.crm_supplier_workflow_line_prices
  for select to authenticated using (public.is_805_crm_user());
