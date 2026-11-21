-- Shared manufacturer price record (805-price-record/v1).
-- Additive. Does not drop tables, columns, or rows, and does not truncate.
-- Does not change the append-only trigger or the unique constraints on
-- crm_supplier_workflow_line_prices. Does not enable any live-lookup switch.
-- Lotus, Onyx, and Sundance stay off. Norman keeps using its existing switch,
-- which this file does not turn on.
--
-- Depends on 20261121150000_append_only_live_lookup_prices.sql (PR #102).
-- crm_vendor_accounts stores a public account reference only: vendor, label,
-- account number, site, and active. No credentials.
--
-- spec_hash is the lowercase hex SHA-256 of the canonical JSON
-- {"height_eighths","manufacturer","options","product","width_eighths"}.
-- Keys are sorted by Unicode code point. Strings lose leading and trailing
-- spaces, tabs, and line breaks. Manufacturer and product are lowercase.
-- Width and height are the nearest 1/8 inch, counted in eighths. Price,
-- margin, and audit keys are omitted from options. price_line_from_receipt
-- applies a receipt only when that hash still matches the quote line.
-- A mismatch raises spec_changed and writes no price.

create extension if not exists pgcrypto;

create table if not exists public.crm_vendor_accounts (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (vendor in ('norman', 'onyx', 'sundance', 'lotus')),
  account_label text not null,
  account_number text not null,
  site text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (vendor, account_number)
);

comment on table public.crm_vendor_accounts is
  'Public vendor account references for price capture. No credentials, tokens, or secrets.';

insert into public.crm_vendor_accounts (vendor, account_label, account_number, site, active)
values (
  'norman',
  'Norman dealer RA00743',
  'RA00743',
  'https://www.normanwindowcoverings.com/Login/default.asp',
  true
)
on conflict (vendor, account_number) do nothing;

alter table public.crm_vendor_price_receipts
  add column if not exists vendor_account_id uuid,
  add column if not exists captured_by text,
  add column if not exists currency text,
  add column if not exists evidence text;

do $live$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_vendor_price_receipts_account_fk') then
    alter table public.crm_vendor_price_receipts
      add constraint crm_vendor_price_receipts_account_fk
      foreign key (vendor_account_id) references public.crm_vendor_accounts (id);
  end if;
end $live$;

create index if not exists crm_vendor_price_receipts_account_idx
  on public.crm_vendor_price_receipts (vendor_account_id);

create or replace function public.price_record_sha256(p_text text)
returns text
language plpgsql
immutable
as $live$
declare
  result text;
begin
  perform set_config(
    'search_path',
    case
      when exists (select 1 from pg_namespace where nspname = 'extensions')
        then 'public, extensions, pg_temp'
      else 'public, pg_temp'
    end,
    true
  );
  select encode(digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex') into result;
  return result;
end $live$;

create or replace function public.price_record_canonical_json(p jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $live$
declare
  kind text := jsonb_typeof(p);
  key text;
  item jsonb;
  parts text[] := array[]::text[];
  keys text[];
  amount numeric;
begin
  if p is null or kind is null or kind = 'null' then return 'null'; end if;
  if kind = 'boolean' then return p::text; end if;
  if kind = 'string' then
    return to_json(btrim(p #>> '{}', E' \t\n\r'))::text;
  end if;
  if kind = 'number' then
    amount := (p #>> '{}')::numeric;
    if amount = trunc(amount) then return trunc(amount)::text; end if;
    return rtrim(rtrim(amount::text, '0'), '.');
  end if;
  if kind = 'array' then
    for item in select value from jsonb_array_elements(p) loop
      parts := parts || public.price_record_canonical_json(item);
    end loop;
    return '[' || array_to_string(parts, ',') || ']';
  end if;
  select coalesce(array_agg(obj.key order by obj.key collate "C"), array[]::text[])
    into keys
  from jsonb_object_keys(p) as obj(key);
  foreach key in array keys loop
    parts := parts || (to_json(key)::text || ':' || public.price_record_canonical_json(p -> key));
  end loop;
  return '{' || array_to_string(parts, ',') || '}';
end $live$;

create or replace function public.price_record_eighths(p_whole integer, p_fraction text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $live$
declare
  frac text := btrim(coalesce(p_fraction, ''), E' \t\n\r');
  inches numeric;
begin
  if p_whole is null and frac = '' then return null; end if;
  if frac = '' or frac = '0' then return coalesce(p_whole, 0) * 8; end if;
  if frac ~ '^[0-9]+/[1-9][0-9]*$' then
    inches := coalesce(p_whole, 0)
      + split_part(frac, '/', 1)::numeric / split_part(frac, '/', 2)::numeric;
  elsif frac ~ '^[0-9]+(\.[0-9]+)?$' then
    inches := coalesce(p_whole, 0) + frac::numeric;
  else
    raise exception 'size fraction is not a number';
  end if;
  return round(inches * 8)::integer;
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
  product := lower(btrim(coalesce(
    nullif(btrim(options->>'product', E' \t\n\r'), ''),
    nullif(btrim(options->>'catalog_product_id', E' \t\n\r'), ''),
    nullif(btrim(options->>'productId', E' \t\n\r'), ''),
    nullif(btrim(options->>'quote_lab_product_id', E' \t\n\r'), ''),
    nullif(btrim(line.product_type, E' \t\n\r'), ''),
    ''
  ), E' \t\n\r'));
  options := options - array[
    'manufacturer', 'catalog_manufacturer', 'manufacturerId',
    'product', 'catalog_product_id', 'productId', 'quote_lab_product_id',
    'price_source', 'live_margin', 'live_net_unit_price', 'manual_customer_charge_policy',
    'customer_charges', 'manual_typed_by', 'unit_price', 'priced_at', 'created_at', 'updated_at',
    'quote_v2_price_status', 'authoritative_price_status', 'manual_price_override',
    'priced_selection_fingerprint', 'priced_catalog_version'
  ]::text[];
  payload := jsonb_build_object(
    'height_eighths', public.price_record_eighths(line.height_whole, line.height_fraction),
    'manufacturer', manufacturer,
    'options', coalesce(options, '{}'::jsonb),
    'product', product,
    'width_eighths', public.price_record_eighths(line.width_whole, line.width_fraction)
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
begin
  if p_actor is null or p_actor not in ('mike', 'jessica') then
    raise exception 'receipt actor must be mike or jessica';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
     or p_receipt->>'schema' is distinct from '805-price-record/v1' then
    raise exception 'schema must be 805-price-record/v1';
  end if;
  select * into account
  from public.crm_vendor_accounts
  where vendor = p_receipt->>'vendor'
    and account_number = p_receipt->>'account'
    and active;
  if not found then
    raise exception 'vendor account is not an 805 account';
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

create or replace function public.protect_vendor_price_receipt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $live$
begin
  raise exception 'Vendor price receipts are append-only.' using errcode = 'PT409';
end $live$;

drop trigger if exists immutable_vendor_price_receipt on public.crm_vendor_price_receipts;
create trigger immutable_vendor_price_receipt
  before update or delete on public.crm_vendor_price_receipts
  for each row execute function public.protect_vendor_price_receipt();

alter table public.crm_vendor_accounts enable row level security;
alter table public.crm_vendor_price_receipts enable row level security;

revoke all on public.crm_vendor_accounts from public, anon, authenticated;
revoke insert, update, delete, truncate on public.crm_vendor_price_receipts from public, anon, authenticated, service_role;
grant select on public.crm_vendor_accounts to authenticated, service_role;
grant select on public.crm_vendor_price_receipts to authenticated, service_role;

revoke all on function public.price_record_sha256(text) from public, anon, authenticated;
revoke all on function public.price_record_canonical_json(jsonb) from public, anon, authenticated;
revoke all on function public.price_record_eighths(integer, text) from public, anon, authenticated;
revoke all on function public.price_record_line_spec_hash(uuid) from public, anon, authenticated;
revoke all on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) from public, anon, authenticated;

grant execute on function public.price_record_sha256(text) to service_role;
grant execute on function public.price_record_canonical_json(jsonb) to service_role;
grant execute on function public.price_record_eighths(integer, text) to service_role;
grant execute on function public.price_record_line_spec_hash(uuid) to service_role;
grant execute on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) to service_role;

drop policy if exists staff_read_vendor_accounts on public.crm_vendor_accounts;
create policy staff_read_vendor_accounts on public.crm_vendor_accounts
  for select to authenticated using (public.is_805_crm_user());

-- crm_price_bot is optional here. CREATE ROLE cannot run inside a migration
-- transaction. When the role already exists, it may select accounts and
-- receipts and execute the record function. It cannot insert, update, or
-- delete the receipt table. The append-only trigger blocks update and delete
-- for every role, including service_role.
do $live$
begin
  if exists (select 1 from pg_roles where rolname = 'crm_price_bot') then
    execute 'revoke all on public.crm_vendor_accounts from crm_price_bot';
    execute 'revoke all on public.crm_vendor_price_receipts from crm_price_bot';
    execute 'grant select on public.crm_vendor_accounts to crm_price_bot';
    execute 'grant select on public.crm_vendor_price_receipts to crm_price_bot';
    execute 'grant execute on function public.price_record_line_spec_hash(uuid) to crm_price_bot';
    execute 'grant execute on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) to crm_price_bot';
    execute 'drop policy if exists bot_read_vendor_accounts on public.crm_vendor_accounts';
    execute 'create policy bot_read_vendor_accounts on public.crm_vendor_accounts for select to crm_price_bot using (true)';
    execute 'drop policy if exists bot_read_vendor_price_receipts on public.crm_vendor_price_receipts';
    execute 'create policy bot_read_vendor_price_receipts on public.crm_vendor_price_receipts for select to crm_price_bot using (true)';
  end if;
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

