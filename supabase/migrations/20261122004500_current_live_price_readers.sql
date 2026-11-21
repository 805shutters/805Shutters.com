-- Built on 20261121234500_onyx_sundance_price_records.sql (#107).
-- record_vendor_price_receipt and price_line_from_receipt keep every
-- Onyx and Sundance check from that migration, including no_vendor_account,
-- the manufacturer portal URL checks, and price_record_line_spec_hash.
-- This file adds portal_draft_id from receipt->>'portal_draft_id' and the
-- draft quote status recompute. It does not replace price_record_line_spec_hash
-- and it does not change design notes. Those notes are left for a human.

-- Current live prices use price_record_line_spec_hash.
-- Additive. No DELETE, DROP, or TRUNCATE. Old live_lookup_spec_hash values
-- (md5 of quote id and revision, including revision 3) stay stored and are not
-- read. A price is current only when its spec_hash equals
-- price_record_line_spec_hash(line_id), or it is a manual price.
--
-- portal_draft_id is the JSON key record_vendor_price_receipt used to copy
-- (p_receipt->>'portal_draft_id'). 805-price-record/v1 kept that key inside
-- receipt and left the column null. Norman session and draft ids use that key.
--
-- quote_v2_status backfill predicate (stale purely because a live price did
-- not recompute status):
--   quote_v2_backend
--   and status = 'draft'
--   and quote_v2_status = 'stale'
--   and the quote has at least one line
--   and every line's latest non-obsolete price is live_site whose spec_hash
--       equals price_record_line_spec_hash(line_id)
-- A manual-only line, an old revision hash, or a missing price leaves the
-- quote stale. Sent and non-draft quotes are not changed.
--
-- The sales_quotes update (costs, totals, revision, and quote_v2_status) runs
-- only when status = 'draft' and quote_v2_status is draft, stale, priced, or
-- blocked. A sent or archived quote is left untouched and the result is
-- quote_not_draft. The receipt and the line price record are still kept.
-- Design notes are not modified.
--
-- Expected rows on production, from the live prices already saved for
-- 805-0592 A ($327.00) and 805-0593 A ($277.50). This file does not apply
-- itself to production.
--   portal_draft_id: those quotes' receipt and workflow rows whose column is
--     null and whose receipt JSON has portal_draft_id.
--   quote_v2_status: 805-0592 A and 805-0593 A, stale -> priced, only if they
--     are still drafts. Sent 805-0152 and archived 805-0273, 805-0274, and
--     805-0443 are not updated.
--   design notes: none. 805-0592 A's note is left for a human.

create or replace function public.price_record_portal_draft_id(p_receipt jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $live$
  select nullif(btrim(p_receipt->>'portal_draft_id'), '');
$live$;

comment on function public.price_record_portal_draft_id(jsonb) is
  'Reads Norman session/draft id from receipt JSON key portal_draft_id. That is the path the receipt writer copies onto portal_draft_id.';

create or replace function public.live_line_current_price_source(p_line_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $live$
  select chosen.price_source
  from (
    select
      candidate.price_source,
      candidate.created_at,
      candidate.id,
      case
        when candidate.price_source = 'manual_no_source'
          or candidate.spec_hash = public.price_record_line_spec_hash(p_line_id)
        then 0
        else 1
      end as rank
    from (
      select price_source, spec_hash, created_at, id
      from public.crm_supplier_workflow_line_prices
      where line_id = p_line_id
      union all
      select price_source, spec_hash, created_at, id
      from public.crm_live_lookup_line_price_revisions
      where line_id = p_line_id
    ) candidate
  ) chosen
  where chosen.rank = 0
  order by chosen.created_at desc, chosen.id desc
  limit 1;
$live$;

comment on function public.live_line_current_price_source(uuid) is
  'Latest price whose spec_hash equals price_record_line_spec_hash, or a manual price. Stored live_lookup_spec_hash values do not count and are not deleted.';

create or replace function public.protect_vendor_price_receipt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $live$
begin
  if tg_op = 'DELETE' then
    raise exception 'Vendor price receipts are append-only.' using errcode = 'PT409';
  end if;
  if tg_op = 'UPDATE'
     and old.portal_draft_id is null
     and new.portal_draft_id is not null
     and new.portal_draft_id = public.price_record_portal_draft_id(old.receipt)
     and (to_jsonb(new) - 'portal_draft_id') = (to_jsonb(old) - 'portal_draft_id')
  then
    return new;
  end if;
  raise exception 'Vendor price receipts are append-only.' using errcode = 'PT409';
end $live$;

create or replace function public.protect_supplier_workflow_price()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $wf$
begin
  if tg_op = 'DELETE' then
    raise exception 'Supplier workflow price evidence is append-only.' using errcode = 'PT409';
  end if;
  if tg_op = 'UPDATE'
     and old.portal_draft_id is null
     and new.portal_draft_id is not null
     and new.portal_draft_id = public.price_record_portal_draft_id(old.receipt)
     and (to_jsonb(new) - 'portal_draft_id') = (to_jsonb(old) - 'portal_draft_id')
  then
    return new;
  end if;
  raise exception 'Supplier workflow price evidence is append-only.' using errcode = 'PT409';
end
$wf$;

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
  portal_draft text;
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
  portal_draft := public.price_record_portal_draft_id(p_receipt);
  insert into public.crm_vendor_price_receipts (
    quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, vendor_account_id,
    observed_at, net_unit_price, net_line_total, currency, portal_draft_id, portal_url, evidence,
    source_bot_id, screenshot_path, captured_by, receipt, actor
  ) values (
    q.id, line_ref, coalesce(q.quote_v2_revision, 0), expected_hash,
    account.vendor, account.account_number, account.id,
    observed, net_unit, net_unit, 'USD', portal_draft, source_url, evidence,
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
      'vendor_account_id', account.id,
      'portal_draft_id', portal_draft
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
  line_count integer;
  open_count integer;
  next_status text;
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
        quote_v2_status = next_status
    where id = q.id
      and status = 'draft'
      and quote_v2_status in ('draft', 'stale', 'priced', 'blocked');
  else
    next_status := 'quote_not_draft';
    v_revision := coalesce(q.quote_v2_revision, 0);
  end if;
  actor := '00000000-0000-4000-8000-000000000050'::uuid;
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

create or replace view public.crm_live_lookup_current_line_prices
with (security_invoker = true) as
select
  prices.quote_id,
  prices.line_id,
  chosen.net_unit_price,
  chosen.installation,
  chosen.shipping,
  chosen.price_source,
  chosen.manual_typed_by,
  chosen.spec_hash,
  (chosen.spec_rank = 0) as spec_current
from (
  select distinct quote_id, line_id
  from public.crm_supplier_workflow_line_prices
) prices
join lateral (
  select
    candidate.net_unit_price,
    candidate.installation,
    candidate.shipping,
    candidate.price_source,
    candidate.manual_typed_by,
    candidate.spec_hash,
    candidate.created_at,
    candidate.id,
    case
      when candidate.price_source = 'manual_no_source'
        or candidate.spec_hash = public.price_record_line_spec_hash(prices.line_id)
      then 0
      else 1
    end as spec_rank
  from (
    select net_unit_price, installation, shipping, price_source, manual_typed_by, spec_hash, created_at, id
    from public.crm_supplier_workflow_line_prices
    where quote_id = prices.quote_id and line_id = prices.line_id
    union all
    select net_unit_price, installation, shipping, price_source, manual_typed_by, spec_hash, created_at, id
    from public.crm_live_lookup_line_price_revisions
    where quote_id = prices.quote_id and line_id = prices.line_id
  ) candidate
  order by
    case
      when candidate.price_source = 'manual_no_source'
        or candidate.spec_hash = public.price_record_line_spec_hash(prices.line_id)
      then 0
      else 1
    end,
    candidate.created_at desc,
    candidate.id desc
  limit 1
) chosen on true;

comment on view public.crm_live_lookup_current_line_prices is
  'Latest price for a line. spec_current is true when spec_hash equals price_record_line_spec_hash or the price is manual. An older live_lookup_spec_hash is shown only when nothing current exists, with spec_current false. Those rows are not deleted.';

create or replace function public.backfill_current_live_price_fields()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $live$
declare
  portal_count integer := 0;
  workflow_count integer := 0;
  status_count integer := 0;
begin
  -- portal_draft_id from receipt->>'portal_draft_id' only where the column is null.
  update public.crm_vendor_price_receipts
  set portal_draft_id = public.price_record_portal_draft_id(receipt)
  where portal_draft_id is null
    and public.price_record_portal_draft_id(receipt) is not null;
  get diagnostics portal_count = row_count;

  update public.crm_supplier_workflow_line_prices
  set portal_draft_id = public.price_record_portal_draft_id(receipt)
  where portal_draft_id is null
    and public.price_record_portal_draft_id(receipt) is not null;
  get diagnostics workflow_count = row_count;

  -- Stale drafts whose every line has a current live_site price.
  update public.sales_quotes q
  set quote_v2_status = 'priced'
  where q.quote_v2_backend is true
    and q.status = 'draft'
    and q.quote_v2_status = 'stale'
    and exists (select 1 from public.sales_quote_line_items li where li.quote_id = q.id)
    and not exists (
      select 1 from public.sales_quote_line_items li
      where li.quote_id = q.id
        and public.live_line_current_price_source(li.id) is distinct from 'live_site'
    );
  get diagnostics status_count = row_count;

  return jsonb_build_object(
    'portal_draft_ids', portal_count,
    'workflow_portal_draft_ids', workflow_count,
    'quote_statuses', status_count
  );
end $live$;

revoke all on function public.price_record_portal_draft_id(jsonb) from public, anon, authenticated;
revoke all on function public.live_line_current_price_source(uuid) from public, anon, authenticated;
revoke all on function public.backfill_current_live_price_fields() from public, anon, authenticated;

grant execute on function public.price_record_portal_draft_id(jsonb) to service_role;
grant execute on function public.live_line_current_price_source(uuid) to service_role;
grant execute on function public.backfill_current_live_price_fields() to service_role;
grant execute on function public.price_record_line_spec_hash(uuid) to authenticated;

do $live$
begin
  if exists (select 1 from pg_roles where rolname = 'crm_price_bot') then
    execute 'grant execute on function public.price_record_portal_draft_id(jsonb) to crm_price_bot';
    execute 'grant execute on function public.live_line_current_price_source(uuid) to crm_price_bot';
  end if;
end $live$;

select public.backfill_current_live_price_fields();
