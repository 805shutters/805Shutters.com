-- Staff-set retail prices are independent of catalog availability and survive repricing.
-- Only the authenticated CRM server may call these functions; no customer grants.
create table public.sales_quote_line_price_overrides (
  design_id uuid primary key references public.sales_quote_designs(id) on delete cascade,
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create table public.sales_quote_line_price_events (
  request_id uuid primary key,
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  line_item_id uuid not null,
  variant text not null,
  unit_price numeric(12,2) not null,
  previous_price numeric(12,2),
  actor_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sales_quote_line_price_overrides enable row level security;
alter table public.sales_quote_line_price_events enable row level security;
revoke all on public.sales_quote_line_price_overrides, public.sales_quote_line_price_events from public, anon, authenticated;
grant all on public.sales_quote_line_price_overrides, public.sales_quote_line_price_events to service_role;

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
  revision := coalesce(q.quote_v2_revision,0) + case when q.quote_v2_backend then 1 else 0 end;
  if q.quote_v2_backend then
    select * into source_snapshot from public.sales_quote_v2_price_snapshots where id=d.current_v2_snapshot_id;
    price_catalog := coalesce(source_snapshot.catalog_version,'custom-override-v1');
    fingerprint := case when price_catalog='custom-override-v1' then '' else 'sha256:' end
      || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    retail := jsonb_build_object('priceStatus','authoritative','selectionFingerprint',fingerprint,
      'catalogVersion',price_catalog,'retail',coalesce(source_snapshot.retail_snapshot->'retail','{}'::jsonb) || jsonb_build_object(
        'unitPrice',amount,'base',amount,'surchargeLines','[]'::jsonb,
        'discountPercent',0,'discountAmount',0,'onceTotal',0,
        'quantity',l.quantity,'total',round(amount*l.quantity,2)));
    provenance := jsonb_build_object('mode','custom_override','internalOnly',true,
      'manualLinePrice',true,'originalSnapshotId',coalesce(source_snapshot.provenance_snapshot->>'originalSnapshotId',source_snapshot.id::text),
      'originalCatalogVersion',source_snapshot.catalog_version,
      'costResolution',case when source_snapshot.id is null then 'unresolved' else 'preserved_snapshot' end);
    insert into public.sales_quote_v2_price_snapshots(
      quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,
      retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot,
      validation_snapshot,provenance_snapshot,created_by)
    values(q.id,l.id,d.id,revision,fingerprint,price_catalog,round(amount*l.quantity,2),
      coalesce(source_snapshot.internal_landed_cost_total,0),retail,
      coalesce(source_snapshot.internal_cost_snapshot,jsonb_build_object('status','unresolved','landedCostTotal',null)),
      jsonb_build_object('status','valid','mode','staff_retail_override'),provenance,p_actor_id)
    returning id into snapshot_id;
  end if;
  update public.sales_quote_designs set unit_price=amount,
    options_json=(coalesce(options_json,'{}'::jsonb) - array[
      'discount_percent','discount_source_price','discount_amount','pricing_block_reason',
      'authoritative_price_error','sent_price_snapshot']) || jsonb_build_object('manual_price_override',true)
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
    coalesce(bool_and(chosen.id is not null and chosen.quote_v2_price_status is not distinct from 'authoritative'),false)
  into total,complete
  from public.sales_quote_line_items li
  left join lateral (
    select sd.* from public.sales_quote_designs sd where sd.line_item_id=li.id
    order by (sd.id=li.selected_design_id) desc nulls last,(sd.variant='A') desc,sd.id limit 1
  ) chosen on true where li.quote_id=q.id;
  update public.sales_quotes set total_amount=total,
    quote_v2_catalog_version=case when q.quote_v2_backend then (
      select string_agg(distinct sd.quote_v2_priced_catalog_version, ',' order by sd.quote_v2_priced_catalog_version)
      from public.sales_quote_line_items li join public.sales_quote_designs sd on sd.id=li.selected_design_id where li.quote_id=q.id
    ) else quote_v2_catalog_version end,
    quote_v2_revision=case when q.quote_v2_backend then revision else quote_v2_revision end,
    quote_v2_status=case when q.quote_v2_backend then case when complete then 'priced' else 'blocked' end else quote_v2_status end
  where id=q.id;
  if not p_reapply then
    insert into public.sales_quote_line_price_overrides(design_id,quote_id,unit_price,updated_by)
    values(d.id,q.id,amount,p_actor_id) on conflict(design_id) do update
    set unit_price=excluded.unit_price,updated_by=excluded.updated_by,updated_at=now();
  end if;
  result := jsonb_build_object('designId',d.id,'unitPrice',amount,'total',total,'revision',revision,
    'quoteStatus',case when complete then 'priced' else 'blocked' end);
  insert into public.sales_quote_line_price_events(request_id,quote_id,line_item_id,variant,unit_price,previous_price,actor_id,result)
  values(p_request_id,q.id,l.id,p_variant,amount,d.unit_price,p_actor_id,result);
  return result;
end $$;
revoke all on function public.set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean) to service_role;

-- Keep the existing catalog checks; restore explicit staff prices within the same transaction.
alter function public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb)
  rename to save_quote_v2_catalog_pricing_batch;
create function public.save_quote_v2_pricing_batch(
  p_quote_id uuid,p_expected_revision bigint,p_idempotency_key text,p_actor_id uuid,p_results jsonb
) returns table(quote_id uuid,new_revision bigint,quote_status text,quote_total numeric,priced_design_count integer,blocked_design_count integer,manual_prices jsonb)
language plpgsql security definer set search_path=public,pg_temp as $$
declare saved record; manual record; result jsonb; current_revision bigint;
begin
  select * into saved from public.save_quote_v2_catalog_pricing_batch(p_quote_id,p_expected_revision,p_idempotency_key,p_actor_id,p_results);
  select quote_v2_revision into current_revision from public.sales_quotes where id=p_quote_id;
  for manual in
    select o.*,d.line_item_id,d.variant from public.sales_quote_line_price_overrides o
    join public.sales_quote_designs d on d.id=o.design_id
    join public.sales_quote_line_items l on l.selected_design_id=d.id
    where o.quote_id=p_quote_id order by d.id
  loop
    -- A batch replay leaves already-restored snapshots alone.
    if exists(select 1 from public.sales_quote_designs d
      join public.sales_quote_v2_price_snapshots s on s.id=d.current_v2_snapshot_id
      join public.sales_quote_line_items l on l.id=d.line_item_id
      where d.id=manual.design_id and d.unit_price=manual.unit_price
      and d.quote_v2_price_status='authoritative' and s.provenance_snapshot->>'manualLinePrice'='true'
      and (s.retail_snapshot#>>'{retail,quantity}')::numeric=l.quantity) then continue; end if;
    result := public.set_sales_quote_line_price(p_quote_id,manual.line_item_id,manual.variant,
      manual.unit_price,p_actor_id,current_revision,gen_random_uuid(),true);
    current_revision := (result->>'revision')::bigint;
  end loop;
  return query select q.id,q.quote_v2_revision,q.quote_v2_status::text,q.total_amount,
    count(*) filter(where d.quote_v2_price_status='authoritative')::integer,
    count(*) filter(where d.quote_v2_price_status is distinct from 'authoritative')::integer,
    coalesce(jsonb_object_agg(d.id::text, snap.retail_snapshot->'retail') filter(where snap.provenance_snapshot->>'manualLinePrice'='true'),'{}'::jsonb)
  from public.sales_quotes q join public.sales_quote_line_items l on l.quote_id=q.id
  left join public.sales_quote_designs d on d.id=l.selected_design_id
  left join public.sales_quote_v2_price_snapshots snap on snap.id=d.current_v2_snapshot_id
  where q.id=p_quote_id group by q.id;
end $$;
revoke all on function public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb) to service_role;
