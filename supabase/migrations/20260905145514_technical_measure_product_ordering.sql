-- Staff-attested product orders. No vendor submission or measurement completion is implied.
-- The API resolves routing from our manufacturer registry; the transaction verifies its
-- complete, unchanged opening snapshot and serializes updates on the exact contract.
create or replace function public.crm_mark_measure_product_ordered(
  p_form_id uuid, p_group_key text, p_groups jsonb, p_snapshot jsonb,
  p_actor_email text, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  f public.crm_technical_measure_forms%rowtype;
  q public.crm_quotes%rowtype;
  s public.sales_quotes%rowtype;
  g jsonb; item jsonb; saved jsonb; orders jsonb; progress jsonb; line_row record;
  group_ids jsonb; source_id uuid; source_quote_id uuid; existing_event jsonb;
  moment timestamptz := now(); group_time text; matched boolean;
  total_count int := 0; ordered_count int := 0; new_order boolean := false;
  legacy_ordered boolean; all_ordered boolean; linked_ids uuid[] := '{}';
begin
  if nullif(trim(p_actor_email),'') is null or p_actor_id is null then raise exception 'ORDER_ACTOR_REQUIRED'; end if;
  -- Lock order is consistent across all product requests for this contract.
  select * into f from public.crm_technical_measure_forms where id = p_form_id;
  if not found then raise exception 'MEASURE_NOT_FOUND'; end if;
  select * into q from public.crm_quotes where id = f.quote_id for update;
  if not found or q.job_id is distinct from f.job_id
    or q.meta->>'deleted_at' is not null then raise exception 'ORDER_CONTRACT_MISMATCH'; end if;
  select * into f from public.crm_technical_measure_forms where id = p_form_id for update;
  if f.quote_id <> q.id or f.job_id <> q.job_id then raise exception 'ORDER_CONTRACT_MISMATCH'; end if;
  if f.contract_id is not null and not exists(select 1 from public.crm_customer_contracts c where c.id=f.contract_id and c.quote_id=f.quote_id and c.job_id=f.job_id and (f.customer_id is null or c.customer_id=f.customer_id)) then raise exception 'ORDER_CONTRACT_MISMATCH'; end if;
  perform 1 from public.crm_technical_measure_lines where form_id=f.id order by id for update;
  if jsonb_array_length(p_snapshot)=0 or jsonb_array_length(p_groups)=0 then raise exception 'ORDER_PRODUCTS_REQUIRED'; end if;
  if (select count(*) from public.crm_technical_measure_lines where form_id=f.id) <> jsonb_array_length(p_snapshot)
    or exists(select 1 from jsonb_array_elements(p_snapshot) x left join public.crm_technical_measure_lines l on l.id=(x->>'id')::uuid and l.form_id=f.id
      where l.id is null or l.current_values is distinct from x->'current_values' or l.baseline is distinct from x->'baseline')
    then raise exception 'MEASURE_CHANGED'; end if;
  select jsonb_agg(id order by id) into group_ids from jsonb_array_elements(p_groups) x cross join lateral jsonb_array_elements_text(x->'lineIds') ids(id);
  if group_ids is distinct from (select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(p_snapshot) x)
    or (select count(distinct x->>'key') from jsonb_array_elements(p_groups) x) <> jsonb_array_length(p_groups)
    or not exists(select 1 from jsonb_array_elements(p_groups) x where x->>'key'=p_group_key)
    then raise exception 'ORDER_PRODUCT_MISMATCH'; end if;
  orders := coalesce(q.meta->'measure_product_orders','{}'::jsonb);
  legacy_ordered := orders='{}'::jsonb and (q.ordered_at is not null or q.status in ('ordered','received','installed','paid_in_full','completed'));
  source_quote_id := nullif(q.meta->>'mts_quote_id','')::uuid;
  if source_quote_id is not null then
    select * into s from public.sales_quotes where id=source_quote_id and account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid for update;
    if not found then raise exception 'ORDER_SOURCE_QUOTE_MISSING'; end if;
  end if;
  for g in select value from jsonb_array_elements(p_groups) loop
    total_count := total_count + 1;
    saved := coalesce(orders->(g->>'key'),'{}'::jsonb);
    group_time := saved->>'orderedAt';
    matched := group_time is not null and coalesce(saved->'lineIds','[]'::jsonb) @> (g->'lineIds');
    if legacy_ordered then matched := true; group_time := coalesce(q.ordered_at::text, q.updated_at::text); end if;
    -- Honor explicit existing sales-line order evidence without inventing confirmation.
    if not matched and source_quote_id is not null and coalesce(q.meta->'measure_product_orders','{}'::jsonb)='{}'::jsonb then
      matched := true;
      for line_row in select * from public.crm_technical_measure_lines where form_id=f.id and id in (select value::uuid from jsonb_array_elements_text(g->'lineIds')) loop
        select coalesce((select x->>'source_quote_line_item_id' from jsonb_array_elements(coalesce(f.meta->'technical_measure_line_provenance','[]')) x where x->>'measure_quote_line_item_id'=line_row.quote_line_item_id::text limit 1),line_row.quote_line_item_id::text)::uuid into source_id;
        if not exists(select 1 from public.sales_quote_line_items where id=source_id and quote_id=source_quote_id) then raise exception 'ORDER_SOURCE_LINE_MISMATCH'; end if;
        select after_data into existing_event from public.crm_activity_events where entity_id=source_id and entity_type='quote' and action in ('sales_quote_line.ordered','sales_quote_line.confirmed') order by created_at desc limit 1;
        if existing_event is null and s.status not in ('ordered','received','installed') then matched := false; end if;
        group_time := coalesce(group_time,existing_event->>'orderedAt',s.ordered_at::text);
      end loop;
    end if;
    if g->>'key'=p_group_key and not matched then
      if f.meta->>'archived_at' is not null then raise exception 'MEASURE_ARCHIVED'; end if;
      matched := true; group_time := moment::text; new_order := true;
    end if;
    if matched then
      ordered_count := ordered_count+1;
      saved := jsonb_build_object('lineIds',g->'lineIds','label',g->>'label','manufacturer',g->>'manufacturer','orderedAt',coalesce(group_time,moment::text),'orderedBy',coalesce(saved->>'orderedBy',p_actor_email));
      orders := jsonb_set(orders,array[g->>'key'],saved,true);
      if source_quote_id is not null then
        for line_row in select * from public.crm_technical_measure_lines where form_id=f.id and id in (select value::uuid from jsonb_array_elements_text(g->'lineIds')) loop
          select coalesce((select x->>'source_quote_line_item_id' from jsonb_array_elements(coalesce(f.meta->'technical_measure_line_provenance','[]')) x where x->>'measure_quote_line_item_id'=line_row.quote_line_item_id::text limit 1),line_row.quote_line_item_id::text)::uuid into source_id;
          if not exists(select 1 from public.sales_quote_line_items where id=source_id and quote_id=source_quote_id) then raise exception 'ORDER_SOURCE_LINE_MISMATCH'; end if;
          linked_ids := array_append(linked_ids,source_id);
        end loop;
      end if;
    end if;
  end loop;
  all_ordered := ordered_count=total_count;
  progress := jsonb_build_object('orderedCount',ordered_count,'totalCount',total_count,'label',case when all_ordered then 'Ordered' else 'Partially ordered' end || ' · ' || ordered_count || ' of ' || total_count,'updatedAt',moment,'formId',f.id);
  -- A retried tap performs no write after the complete result has committed.
  if not new_order and q.meta->'measure_order_progress'->>'orderedCount'=ordered_count::text
    and (not all_ordered or f.meta->>'archived_at' is not null) then return progress; end if;
  update public.crm_quotes set
    meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('measure_product_orders',orders,'measure_order_progress',progress),
    status=case when all_ordered and status in ('sold','approved') then 'ordered' else status end,
    ordered_at=case when all_ordered then coalesce(ordered_at,moment) else ordered_at end
    where id=q.id;
  -- Mirror the progress onto the exact signed contract entry, retaining its legal status.
  update public.crm_customer_contracts set meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('measure_order_progress',progress)
    where id=f.contract_id and quote_id=q.id and (customer_id=f.customer_id or f.customer_id is null);
  if source_quote_id is not null then
    foreach source_id in array linked_ids loop
      -- An expanded source line is ordered only when every one of its openings is ordered.
      if exists(select 1 from public.crm_technical_measure_lines l where l.form_id=f.id
        and coalesce((select x->>'source_quote_line_item_id' from jsonb_array_elements(coalesce(f.meta->'technical_measure_line_provenance','[]')) x where x->>'measure_quote_line_item_id'=l.quote_line_item_id::text limit 1),l.quote_line_item_id::text)=source_id::text
        and not exists(select 1 from jsonb_each(orders) o where o.value->'lineIds' @> jsonb_build_array(l.id::text))) then continue; end if;
      if not exists(select 1 from public.crm_activity_events where entity_id=source_id and entity_type='quote' and action in ('sales_quote_line.ordered','sales_quote_line.confirmed')) then
        insert into public.crm_activity_events(actor_auth_user_id,actor_email,entity_type,entity_id,action,after_data,metadata)
        values(p_actor_id,p_actor_email,'quote',source_id,'sales_quote_line.ordered',jsonb_build_object('orderStatus','ordered','orderedAt',moment),jsonb_build_object('quoteId',source_quote_id,'crmQuoteId',q.id,'formId',f.id,'source','technical_measure_manual_order'));
      end if;
    end loop;
    if all_ordered then update public.sales_quotes set status=case when status='sold' then 'ordered' else status end,ordered_at=coalesce(ordered_at,moment) where id=source_quote_id; end if;
  end if;
  if all_ordered and f.meta->>'archived_at' is null then
    update public.crm_technical_measure_forms set meta=meta||jsonb_build_object('archived_at',moment,'archived_by',p_actor_email,'archive_reason','all_products_ordered') where id=f.id;
    insert into public.crm_activity_events(actor_auth_user_id,actor_email,entity_type,entity_id,action,metadata)
      values(p_actor_id,p_actor_email,'job',f.job_id,'technical_measure.archive',jsonb_build_object('formId',f.id,'quoteId',q.id,'reason','all_products_ordered'));
  end if;
  insert into public.crm_activity_events(actor_auth_user_id,actor_email,entity_type,entity_id,action,after_data,metadata)
    values(p_actor_id,p_actor_email,'quote',q.id,'technical_measure.product_ordered',progress,jsonb_build_object('formId',f.id,'jobId',f.job_id,'groupKey',p_group_key,'source','manual_existing_order'));
  return progress;
end $$;
revoke all on function public.crm_mark_measure_product_ordered(uuid,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_mark_measure_product_ordered(uuid,text,jsonb,jsonb,text,uuid) to service_role;
