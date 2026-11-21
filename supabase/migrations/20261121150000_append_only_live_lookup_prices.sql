-- Live lookup prices are append-only on crm_supplier_workflow_line_prices.
-- Production rejects UPDATE and DELETE with PT409, and UNIQUE (quote_id, line_id)
-- allows one workflow row per line. This migration does not change that trigger
-- or those unique constraints, and it does not drop tables, columns, or rows.
--
-- record_vendor_price_receipt appends crm_vendor_price_receipts and does not
-- touch the workflow table.
-- price_line_from_receipt inserts the one supplier_cost workflow row the first
-- time a line is priced. A later price for that same line appends
-- crm_live_lookup_line_price_revisions and refreshes the quote design, override,
-- and totals. The original workflow row stays as the first priced evidence.
-- set_manual_line_price inserts the one preserved_manual workflow row when the
-- line has none, and otherwise appends a revision.

create table if not exists public.crm_vendor_price_receipts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  line_id uuid not null,
  quote_revision bigint not null,
  spec_hash text not null,
  vendor text not null,
  vendor_account text not null,
  observed_at timestamptz not null,
  net_unit_price numeric(12,2) not null check (net_unit_price > 0),
  net_line_total numeric(12,2) not null check (net_line_total > 0),
  list_unit_price numeric(12,2),
  portal_draft_id text,
  portal_url text,
  source_bot_id uuid,
  screenshot_path text,
  receipt jsonb not null,
  actor text not null check (actor in ('mike', 'jessica')),
  created_at timestamptz not null default now()
);

create index if not exists crm_vendor_price_receipts_quote_line_idx
  on public.crm_vendor_price_receipts (quote_id, line_id, created_at desc);

create table if not exists public.crm_live_lookup_line_price_revisions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  line_id uuid not null,
  request_id uuid not null unique,
  source_record_id uuid,
  merchandise numeric(12,2),
  installation numeric(12,2),
  shipping numeric(12,2),
  line_total numeric(12,2) not null check (line_total >= 0),
  product_cost numeric(12,2) not null check (product_cost >= 0),
  net_unit_price numeric(12,2),
  net_line_total numeric(12,2),
  margin numeric(6,3),
  price_source text not null check (price_source in ('live_site', 'manual_no_source')),
  manual_typed_by text check (manual_typed_by is null or manual_typed_by in ('mike', 'jessica')),
  components jsonb not null,
  spec_hash text,
  created_at timestamptz not null default now(),
  check ((((jsonb_typeof(components) = 'object'::text) AND ((components ->> 'policy'::text) = '805-draft-opening-line-v1'::text) AND ((((components ->> 'mode'::text) = 'supplier_cost'::text) AND (merchandise >= (0)::numeric) AND (installation >= (0)::numeric) AND (shipping >= (0)::numeric) AND (line_total = ((merchandise + installation) + shipping))) OR (((components ->> 'mode'::text) = 'preserved_manual_unallocated'::text) AND (merchandise IS NULL) AND (installation IS NULL) AND (shipping IS NULL)))) IS TRUE))
);

create index if not exists crm_live_lookup_line_price_revisions_line_idx
  on public.crm_live_lookup_line_price_revisions (quote_id, line_id, created_at desc);

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
    insert into public.crm_vendor_price_receipts (
      quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at,
      net_unit_price, net_line_total, list_unit_price, portal_draft_id, portal_url,
      source_bot_id, screenshot_path, receipt, actor
    ) values (
      q.id, line_ref, coalesce(q.quote_v2_revision, 0), p_receipt->>'spec_hash',
      p_receipt->>'vendor', p_receipt->>'vendor_account', observed,
      net_unit, net_line,
      case when nullif(line->>'list_unit_price', '') is null then null else (line->>'list_unit_price')::numeric end,
      p_receipt->>'portal_draft_id', p_receipt->>'portal_url',
      case when nullif(p_receipt->>'source_bot_id', '') is null then null else (p_receipt->>'source_bot_id')::uuid end,
      p_receipt->>'screenshot_path', p_receipt, p_actor
    ) returning id into record_id;
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
  if q.live_margin is null then raise exception 'no_margin'; end if;
  if vendor_receipt.spec_hash is distinct from public.live_lookup_spec_hash(q.id, q.quote_v2_revision)
     and not exists (
       select 1 from public.crm_supplier_workflow_line_prices priced
       where priced.quote_id = q.id and priced.line_id = vendor_receipt.line_id
         and priced.receipt = vendor_receipt.receipt
     ) then
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
      vendor_receipt.screenshot_path, public.live_lookup_spec_hash(q.id, v_revision),
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
      public.live_lookup_spec_hash(q.id, v_revision)
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
  workflow_id uuid;
  manual_components jsonb := jsonb_build_object(
    'policy', '805-draft-opening-line-v1',
    'mode', 'preserved_manual_unallocated'
  );
begin
  if p_typed_by is null or p_typed_by not in ('mike', 'jessica') then
    raise exception 'typed_by must be mike or jessica';
  end if;
  result := public.set_sales_quote_line_price(
    p_quote_id, p_line_item_id, p_variant, p_unit_price, p_actor_id, p_expected_revision, p_request_id, false
  );
  v_design := (result->>'designId')::uuid;
  select id into record_id from public.crm_supplier_workflow_line_prices where request_id = p_request_id;
  if not found then
    select id into record_id from public.crm_live_lookup_line_price_revisions where request_id = p_request_id;
  end if;
  if record_id is not null then
    return result || jsonb_build_object('priceSource', 'manual_no_source', 'typedBy', p_typed_by, 'recordId', record_id);
  end if;
  select id into workflow_id from public.crm_supplier_workflow_line_prices
  where quote_id = p_quote_id and line_id = p_line_item_id;
  if not found then
    insert into public.crm_supplier_workflow_line_prices (
      request_id, job_id, quote_id, line_id, design_id, source_line_id, product_cost, line_total,
      components, receipt, result, price_source, manual_typed_by, observed_at
    ) values (
      p_request_id, null, p_quote_id, p_line_item_id, v_design, p_line_item_id, p_unit_price, p_unit_price,
      manual_components,
      jsonb_build_object('schema', '805-live-price-record/v1', 'price_source', 'manual_no_source', 'typed_by', p_typed_by),
      result || jsonb_build_object('priceSource', 'manual_no_source', 'typedBy', p_typed_by),
      'manual_no_source', p_typed_by, now()
    ) returning id into workflow_id;
    record_id := workflow_id;
  else
    insert into public.crm_live_lookup_line_price_revisions (
      quote_id, line_id, request_id, merchandise, installation, shipping, line_total, product_cost,
      price_source, manual_typed_by, components
    ) values (
      p_quote_id, p_line_item_id, p_request_id, null, null, null, p_unit_price, p_unit_price,
      'manual_no_source', p_typed_by, manual_components
    ) returning id into record_id;
  end if;
  update public.sales_quote_line_price_overrides
  set price_source = 'manual_no_source', price_record_id = workflow_id
  where design_id = v_design;
  update public.sales_quote_designs as design
  set options_json = coalesce(design.options_json, '{}'::jsonb) || jsonb_build_object('price_source', 'manual_no_source', 'manual_typed_by', p_typed_by)
  where design.id = v_design;
  return result || jsonb_build_object('priceSource', 'manual_no_source', 'typedBy', p_typed_by, 'recordId', record_id);
end $live$;

create or replace view public.crm_live_lookup_current_line_prices
with (security_invoker = true) as
select
  base.quote_id,
  base.line_id,
  case when revision.id is null then base.net_unit_price else revision.net_unit_price end as net_unit_price,
  case when revision.id is null then base.installation else revision.installation end as installation,
  case when revision.id is null then base.shipping else revision.shipping end as shipping,
  case when revision.id is null then base.price_source else revision.price_source end as price_source,
  case when revision.id is null then base.manual_typed_by else revision.manual_typed_by end as manual_typed_by
from public.crm_supplier_workflow_line_prices base
left join lateral (
  select latest.id, latest.net_unit_price, latest.installation, latest.shipping, latest.price_source, latest.manual_typed_by
  from public.crm_live_lookup_line_price_revisions latest
  where latest.quote_id = base.quote_id and latest.line_id = base.line_id
  order by latest.created_at desc, latest.id desc
  limit 1
) revision on true;

alter table public.crm_vendor_price_receipts enable row level security;
alter table public.crm_live_lookup_line_price_revisions enable row level security;
revoke all on public.crm_vendor_price_receipts, public.crm_live_lookup_line_price_revisions from public, anon, authenticated;
grant select on public.crm_vendor_price_receipts, public.crm_live_lookup_line_price_revisions, public.crm_live_lookup_current_line_prices to authenticated;
grant all on public.crm_vendor_price_receipts, public.crm_live_lookup_line_price_revisions to service_role;

drop policy if exists staff_read_vendor_price_receipts on public.crm_vendor_price_receipts;
create policy staff_read_vendor_price_receipts on public.crm_vendor_price_receipts
  for select to authenticated using (public.is_805_crm_user());
drop policy if exists staff_read_live_lookup_line_price_revisions on public.crm_live_lookup_line_price_revisions;
create policy staff_read_live_lookup_line_price_revisions on public.crm_live_lookup_line_price_revisions
  for select to authenticated using (public.is_805_crm_user());
