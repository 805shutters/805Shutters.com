-- Finalized customer records stay immutable. A staff edit creates and edits one
-- new draft atomically, retaining the source's actual saved prices and evidence.
create table if not exists public.sales_quote_revision_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  source_quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  request_payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sales_quote_revision_requests enable row level security;
revoke all on public.sales_quote_revision_requests from public, anon, authenticated;
grant all on public.sales_quote_revision_requests to service_role;
drop trigger if exists sales_quote_revision_requests_append_only on public.sales_quote_revision_requests;
create trigger sales_quote_revision_requests_append_only before update or delete
on public.sales_quote_revision_requests for each row execute function public.reject_v2_audit_mutation();

-- Same identity remapping as quote-alternative-associations, extended through
-- saved derived assemblies and snapshots because these copies retain prices.
create or replace function public.quote_revision_remap_ids(p_value jsonb,p_ids jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb; entry record;
begin
  if jsonb_typeof(p_value)='object' then
    result:='{}'::jsonb;
    for entry in select key,value from jsonb_each(p_value) loop
      result:=result||jsonb_build_object(entry.key,public.quote_revision_remap_ids(entry.value,p_ids));
    end loop;
    return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public.quote_revision_remap_ids(value,p_ids) order by ordinality),'[]'::jsonb)
      into result from jsonb_array_elements(p_value) with ordinality;
    return result;
  elsif jsonb_typeof(p_value)='string' and p_ids ? (p_value #>> '{}') then
    return p_ids->(p_value #>> '{}');
  end if;
  return p_value;
end $$;
revoke all on function public.quote_revision_remap_ids(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.quote_revision_remap_ids(jsonb,jsonb) to service_role;

create or replace function public.create_sales_quote_revision(
  p_source_id uuid,p_actor_id uuid,p_request_id uuid,p_expected_revision bigint,
  p_action text,p_line_item_id uuid,p_variant text default null,p_unit_price numeric default null
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  source public.sales_quotes%rowtype; copied public.sales_quotes%rowtype;
  source_line public.sales_quote_line_items%rowtype; new_line public.sales_quote_line_items%rowtype;
  source_design public.sales_quote_designs%rowtype; new_design public.sales_quote_designs%rowtype;
  source_snapshot public.sales_quote_v2_price_snapshots%rowtype; new_snapshot public.sales_quote_v2_price_snapshots%rowtype;
  previous public.sales_quote_revision_requests%rowtype;
  request_payload jsonb; result jsonb; identities jsonb:='{}'::jsonb;
  new_quote_id uuid:=gen_random_uuid(); target_line_id uuid;
  group_id uuid; letter text; snapshot_id uuid; total numeric; fixed_charges numeric; complete boolean;
  review_reason text; landed_cost numeric; v_product_cost numeric;
begin
  if auth.role() is distinct from 'service_role' or not exists(
    select 1 from public.crm_profiles where id=p_actor_id and active=true
      and lower(email) in ('805shutters@gmail.com','jessica@805shutters.com')
  ) then raise exception 'An authorized 805 CRM staff account is required.' using errcode='42501'; end if;
  if p_request_id is null or p_source_id is null or p_line_item_id is null
    or p_action not in ('delete','manual-price') or p_action is null then
    raise exception 'A source quote, line, revision action and request ID are required.';
  end if;
  if p_action='manual-price' and (nullif(btrim(p_variant),'') is null or length(p_variant)>80
    or p_unit_price is null or p_unit_price<0 or p_unit_price::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Choose a line design and enter a price of $0 or more.';
  end if;
  if p_action='delete' and (p_variant is not null or p_unit_price is not null) then raise exception 'Deletion cannot include a price.'; end if;
  request_payload:=jsonb_build_object('sourceId',p_source_id,'expectedRevision',p_expected_revision,
    'action',p_action,'lineItemId',p_line_item_id,'variant',p_variant,'unitPrice',p_unit_price);
  perform pg_advisory_xact_lock(hashtextextended('quote-revision:'||p_request_id::text,0));
  select * into previous from public.sales_quote_revision_requests where request_id=p_request_id;
  if found then
    if previous.actor_id is distinct from p_actor_id or previous.request_payload is distinct from request_payload then
      raise exception 'This revision request was already used for a different action.';
    end if;
    return previous.result;
  end if;
  select * into source from public.sales_quotes where id=p_source_id
    and account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb' for update;
  if not found or nullif(to_jsonb(source)->>'deleted_at','') is not null then raise exception 'Source quote was not found.'; end if;
  if source.status='draft' and source.quote_v2_status is distinct from 'sent' and source.signed_at is null and source.sent_at is null and nullif(source.customer_signature,'') is null then
    raise exception 'This quote is already editable. Apply the change to its draft.';
  end if;
  if source.quote_v2_backend and p_expected_revision is distinct from source.quote_v2_revision then
    raise exception 'This quote changed. Refresh it before creating a revision.';
  end if;
  if not exists(select 1 from public.sales_quote_line_items where id=p_line_item_id and quote_id=source.id and archived_at is null) then
    raise exception 'The requested line is not active on this quote.';
  end if;
  -- Revisions are separate contracts; grouping with a signed source would inherit
  -- accepted-selection locks or combine original and revised totals.
  group_id:=new_quote_id;letter:='A';
  insert into public.sales_quotes(id,quote_number,account_id,status,customer_name,customer_email,customer_phone,
    customer_address,appointment_date,installer_notes,product_cost,total_amount,profit_amount,
    created_by,sales_owner,sales_owner_auth_user_id,sales_owner_set_at,quote_group_id,quote_letter,
    quote_v2_backend,quote_v2_status,quote_v2_catalog_version,quote_v2_revision,quote_v2_last_priced_at)
  values(new_quote_id,public.next_quote_number('805'),source.account_id,'draft',source.customer_name,source.customer_email,
    source.customer_phone,source.customer_address,source.appointment_date,source.installer_notes,
    source.product_cost,source.total_amount,source.profit_amount,p_actor_id,source.sales_owner,
    source.sales_owner_auth_user_id,source.sales_owner_set_at,group_id,letter,source.quote_v2_backend,
    case when not source.quote_v2_backend then 'legacy' when source.quote_v2_status='sent' then 'priced' else source.quote_v2_status end,
    source.quote_v2_catalog_version,case when source.quote_v2_backend then 1 else 0 end,source.quote_v2_last_priced_at)
  returning * into copied;
  -- Build the complete map before copying any shared accessories/assemblies.
  for source_line in select * from public.sales_quote_line_items where quote_id=source.id and archived_at is null order by sort_order,id loop
    identities:=identities||jsonb_build_object(source_line.id::text,gen_random_uuid());
    for source_design in select * from public.sales_quote_designs where line_item_id=source_line.id loop
      identities:=identities||jsonb_build_object(source_design.id::text,gen_random_uuid());
    end loop;
  end loop;
  target_line_id:=(identities->>p_line_item_id::text)::uuid;
  for source_line in select * from public.sales_quote_line_items where quote_id=source.id and archived_at is null order by sort_order,id loop
    -- New line lifecycle defaults: never copy vendor ordering/receiving state.
    insert into public.sales_quote_line_items(id,quote_id,room_name,product_type,width_whole,width_fraction,height_whole,
      height_fraction,quantity,sort_order,selected_design_id)
    values((identities->>source_line.id::text)::uuid,new_quote_id,source_line.room_name,source_line.product_type,
      source_line.width_whole,source_line.width_fraction,source_line.height_whole,source_line.height_fraction,
      source_line.quantity,source_line.sort_order,null) returning * into new_line;
    for source_design in select * from public.sales_quote_designs where line_item_id=source_line.id loop
      new_design:=jsonb_populate_record(null::public.sales_quote_designs,to_jsonb(source_design)||jsonb_build_object(
        'id',identities->>source_design.id::text,'line_item_id',new_line.id,'current_v2_snapshot_id',null,'created_at',now(),
        'options_json',public.quote_revision_remap_ids(coalesce(source_design.options_json,'{}'::jsonb)-'sent_price_snapshot',identities),
        'quote_v2_selection',public.quote_revision_remap_ids(source_design.quote_v2_selection,identities)));
      -- ID-bearing shared configurations no longer have the original canonical
      -- pricing fingerprint. Preserve evidence and amounts, but require the shared
      -- price to be refreshed; an explicit staff amount remains usable.
      review_reason:=null;
      if new_design.options_json->'manual_price_override' is distinct from 'true'::jsonb
        and source_design.quote_v2_priced_catalog_version is distinct from 'custom-override-v1' then
        if p_action='delete' and (public.quote_revision_remap_ids(new_design.options_json,jsonb_build_object(target_line_id::text,'removed')) is distinct from new_design.options_json
          or public.quote_revision_remap_ids(new_design.quote_v2_selection,jsonb_build_object(target_line_id::text,'removed')) is distinct from new_design.quote_v2_selection) then
          review_reason:=case when new_design.options_json->>'accompanying_line_id'=target_line_id::text
            or new_design.quote_v2_selection#>>'{configuration,accompanying_line_id}'=target_line_id::text then
            'The companion product was removed. Select the shelf with-product or without-product price.'
            else 'A connected line was removed. Shared accessory or common-valance pricing needs recalculation.' end;
        elsif new_design.quote_v2_selection is distinct from source_design.quote_v2_selection then
          review_reason:='Shared accessory or assembly pricing needs recalculation for this revised quote.';
        end if;
      end if;
      if review_reason is not null then
        new_design.quote_v2_price_status:='blocked';
        new_design.options_json:=new_design.options_json||jsonb_build_object('authoritative_price_status','blocked',
          'authoritative_price_error',review_reason,'pricing_block_reason',review_reason);
      end if;
      insert into public.sales_quote_designs select (new_design).*;
      if source_design.current_v2_snapshot_id is not null then
        select * into source_snapshot from public.sales_quote_v2_price_snapshots where id=source_design.current_v2_snapshot_id and design_id=source_design.id;
        if not found then raise exception 'The saved source price snapshot is unavailable.';end if;
        snapshot_id:=gen_random_uuid();
        new_snapshot:=jsonb_populate_record(null::public.sales_quote_v2_price_snapshots,to_jsonb(source_snapshot)||jsonb_build_object(
          'id',snapshot_id,'quote_id',new_quote_id,'line_item_id',new_line.id,'design_id',new_design.id,'quote_revision',case when copied.quote_v2_backend then 2 else 0 end,
          'created_by',p_actor_id,'created_at',now(),
          'retail_snapshot',public.quote_revision_remap_ids(source_snapshot.retail_snapshot,identities),
          'internal_cost_snapshot',public.quote_revision_remap_ids(source_snapshot.internal_cost_snapshot,identities),
          'validation_snapshot',public.quote_revision_remap_ids(source_snapshot.validation_snapshot,identities),
          'provenance_snapshot',source_snapshot.provenance_snapshot||jsonb_build_object('revisionSourceQuoteId',source.id,'revisionSourceSnapshotId',source_snapshot.id)));
        insert into public.sales_quote_v2_price_snapshots select (new_snapshot).*;
        update public.sales_quote_designs set current_v2_snapshot_id=snapshot_id where id=new_design.id;
      end if;
      insert into public.sales_quote_line_price_overrides(design_id,quote_id,unit_price,updated_by,customer_charge_policy)
        select new_design.id,new_quote_id,unit_price,p_actor_id,customer_charge_policy
        from public.sales_quote_line_price_overrides where design_id=source_design.id;
    end loop;
    update public.sales_quote_line_items set selected_design_id=(identities->>source_line.selected_design_id::text)::uuid where id=new_line.id;
  end loop;
  if p_action='manual-price' then
    perform public.set_sales_quote_line_price(new_quote_id,target_line_id,p_variant,p_unit_price,p_actor_id,
      case when copied.quote_v2_backend then copied.quote_v2_revision else null end,p_request_id);
  else
    update public.sales_quote_line_items set archived_at=now() where id=target_line_id;
    -- Recalculate only arithmetic from surviving saved prices; no catalog reprice.
    select coalesce(sum(chosen.unit_price*li.quantity+case when copied.quote_v2_backend then
        coalesce((chosen.options_json->>'authoritative_once_total')::numeric,0) else 0 end),0),
      coalesce(bool_and(chosen.id is not null and chosen.quote_v2_price_status='authoritative'),false),
      coalesce(sum(case when chosen.options_json->'manual_price_override'='true'::jsonb and
        chosen.options_json->>'manual_customer_charge_policy' is distinct from 'blind-shade-install-ship-v1' then 0 else
        coalesce((public.quote_customer_charges(coalesce(chosen.options_json#>'{authoritative_price_breakdown,customerCharges}',
          chosen.options_json->'customer_charges'),li.quantity)->>'total')::numeric,0) end),0)
      into total,complete,fixed_charges
      from public.sales_quote_line_items li left join lateral(
        select sd.* from public.sales_quote_designs sd where sd.line_item_id=li.id
          order by (sd.id=li.selected_design_id) desc nulls last,(sd.variant='A') desc,sd.id limit 1
      ) chosen on true where li.quote_id=new_quote_id and li.archived_at is null;
    total:=public.quote_customer_adjusted_total(total,fixed_charges,copied.installer_notes);
    update public.sales_quotes set total_amount=total,quote_v2_revision=case when copied.quote_v2_backend then 2 else 0 end,
      quote_v2_status=case when not copied.quote_v2_backend then 'legacy' when complete then 'priced' else 'blocked' end where id=new_quote_id;
  end if;
  -- Refresh the selected catalog identity after removal; never leave a deleted
  -- product's catalog in the new quote's customer-send identity.
  update public.sales_quotes set quote_v2_catalog_version=case when copied.quote_v2_backend then (
    select string_agg(distinct sd.quote_v2_priced_catalog_version,',' order by sd.quote_v2_priced_catalog_version)
    from public.sales_quote_line_items li join public.sales_quote_designs sd on sd.id=li.selected_design_id
    where li.quote_id=new_quote_id and li.archived_at is null) else quote_v2_catalog_version end where id=new_quote_id;
  -- Dealer cost is never fabricated from a retail amount. Missing historical
  -- cost evidence remains explicitly unknown, including legacy revisions.
  select case when bool_and(s.id is not null and s.internal_landed_cost_total is not null
      and coalesce(s.internal_cost_snapshot->>'status','')<>'unresolved'
      and coalesce(s.internal_cost_snapshot->>'costStatus','')<>'incomplete') then sum(s.internal_landed_cost_total) end,
    case when bool_and(s.id is not null and jsonb_typeof(s.internal_cost_snapshot->'productCostTotal')='number')
      then sum((s.internal_cost_snapshot->>'productCostTotal')::numeric) end
    into landed_cost,v_product_cost
    from public.sales_quote_line_items li left join public.sales_quote_designs sd on sd.id=li.selected_design_id
    left join public.sales_quote_v2_price_snapshots s on s.id=sd.current_v2_snapshot_id
    where li.quote_id=new_quote_id and li.archived_at is null;
  update public.sales_quotes set product_cost=landed_cost,manufacturer_cost=v_product_cost,
    profit_amount=case when landed_cost is not null then total_amount-landed_cost else null end where id=new_quote_id;
  select * into copied from public.sales_quotes where id=new_quote_id;
  result:=jsonb_build_object('quoteId',new_quote_id,'lineItemId',target_line_id,'quote',to_jsonb(copied),
    'revision',copied.quote_v2_revision,'total',copied.total_amount);
  -- Preserve the source's native-vs-historical send path. Do not let a native
  -- revision fall through to the legacy all-design customer mirror.
  if copied.quote_v2_backend and exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=source.id) then
    insert into public.sales_quote_v2_draft_requests(idempotency_key,request_hash,actor_id,quote_id,result)
      values('revision:'||p_request_id::text,encode(sha256(convert_to(request_payload::text,'UTF8')),'hex'),
        p_actor_id,new_quote_id,jsonb_build_object('quoteId',new_quote_id,'revision',copied.quote_v2_revision));
  end if;
  insert into public.sales_quote_revision_requests(request_id,actor_id,source_quote_id,request_payload,result)
    values(p_request_id,p_actor_id,source.id,request_payload,result);
  if copied.quote_v2_backend then
    insert into public.sales_quote_v2_events(quote_id,event_type,previous_revision,new_revision,actor_id,idempotency_key,event_payload)
      values(new_quote_id,'quote.revision',null,copied.quote_v2_revision,p_actor_id,'revision:'||p_request_id::text,
        jsonb_build_object('sourceQuoteId',source.id,'sourceRevision',source.quote_v2_revision,'action',p_action,'sourceLineId',p_line_item_id,'result',result));
  end if;
  return result;
end $$;
revoke all on function public.create_sales_quote_revision(uuid,uuid,uuid,bigint,text,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.create_sales_quote_revision(uuid,uuid,uuid,bigint,text,uuid,text,numeric) to service_role;
