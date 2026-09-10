-- Native-only acceptance derives every amount and quantity from frozen rows.
-- Historical acceptance functions and their existing records remain unchanged.
create function public.accept_native_quote_delivery(
 p_quote_id uuid,p_share_token text,p_selected_line_ids text[],p_acknowledged_total numeric,
 p_signed_at timestamptz,p_signature text,p_printed_name text
) returns table(already_signed boolean,future_quote_id uuid,future_job_id uuid)
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.crm_quotes%rowtype; d public.sales_quote_v2_deliveries%rowtype; l record; f record;
 v_frozen jsonb; v_cost jsonb; v_plan jsonb:='[]'; v_current jsonb:='{}'; v_future jsonb:='{}'; v_future_costs jsonb:='{}';
 v_current_costs jsonb:='{}'; v_entry jsonb; v_counts jsonb; v_cur_money jsonb; v_fut_money jsonb;
 v_remaining_quantity integer:=0; v_product_cents bigint; v_selected_product bigint; v_product_total bigint:=0; v_i integer; v_n integer; v_cents bigint; v_cost_cents bigint; v_selected_cents bigint; v_selected_cost bigint;
 v_total bigint:=0; v_remaining bigint:=0; v_internal bigint:=0; v_internal_remaining bigint:=0;
 v_known text[]:=array[]::text[]; v_physical text; v_fqid uuid; v_fjid uuid; v_fdid uuid; v_token text; v_channel text; v_recipient text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server acceptance required.' using errcode='42501'; end if;
 select * into q from public.crm_quotes where id=p_quote_id and share_token=p_share_token;
 if not found then raise exception 'Contract not found.' using errcode='P0002'; end if;
 if q.quote_group_id is not null then perform pg_advisory_xact_lock(hashtextextended(q.quote_group_id::text,8391)); end if;
 perform 1 from public.sales_quotes where id=(select quote_id from public.sales_quote_v2_deliveries where crm_quote_id=q.id) for update;
 select * into q from public.crm_quotes where id=p_quote_id and share_token=p_share_token for update;
 select * into d from public.sales_quote_v2_deliveries where id=nullif(q.meta->>'native_delivery_id','')::uuid and crm_quote_id=q.id and share_token=p_share_token;
 if not found then raise exception 'Frozen native contract receipt is missing.' using errcode='55000'; end if;
 if d.quote_id is not null and not exists(select 1 from public.sales_quotes sq where sq.id=d.quote_id and sq.quote_v2_delivery_id=d.id and sq.quote_v2_revision=d.quote_revision and sq.deleted_at is null and sq.status<>'archived') then raise exception 'Native source version is unavailable.' using errcode='40001'; end if;
 if q.signed_at is not null then
  return query select true,a.future_quote_id,a.future_job_id from public.sales_quote_v2_acceptances a where a.crm_quote_id=q.id;
  if not found then raise exception 'Signature receipt is missing.' using errcode='55000'; end if;
  return;
 end if;
 if q.status not in ('draft','sent') or exists(select 1 from public.crm_quotes where quote_group_id=q.quote_group_id and id<>q.id and signed_at is not null) then
  raise exception 'This project already has an accepted contract.' using errcode='40001'; end if;
 if p_signed_at is null or nullif(btrim(p_signature),'') is null or nullif(btrim(p_printed_name),'') is null or
  p_acknowledged_total is null or cardinality(p_selected_line_ids)<1 or cardinality(p_selected_line_ids) is null or
  cardinality(p_selected_line_ids)<>(select count(distinct x) from unnest(p_selected_line_ids) x) then
  raise exception 'Complete signature and selection are required.' using errcode='22023'; end if;
 for l in select * from public.crm_quote_line_items where quote_id=q.id order by sort_order,id for update loop
  v_frozen:=q.meta#>array['native_frozen_line_totals',l.id::text]; v_cost:=d.internal_line_costs->l.id::text;
  if (v_frozen->>'quantity')::integer is distinct from l.quantity or l.quantity<1 or
   (v_cost->>'quantity')::integer is distinct from l.quantity then raise exception 'Frozen quantities changed.' using errcode='55000'; end if;
  v_cents:=round((v_frozen->>'total')::numeric*100); v_product_cents:=round((v_cost->>'productTotal')::numeric*100); v_cost_cents:=round((v_cost->>'total')::numeric*100);
  if v_cents is null or v_cents<0 or v_cost_cents is null or v_cost_cents<0 or v_product_cents is null or v_product_cents<0 then raise exception 'Frozen amounts are invalid.' using errcode='55000'; end if;
  v_n:=0; v_selected_product:=0; v_selected_cents:=0; v_selected_cost:=0;
  for v_i in 1..l.quantity loop
   v_physical:=l.id::text||case when l.quantity=1 then '' else '#'||v_i::text end;
   v_known:=array_append(v_known,v_physical);
   if v_physical=any(p_selected_line_ids) then
    v_n:=v_n+1;
    v_selected_cents:=v_selected_cents+v_cents/l.quantity+case when v_i<=v_cents%l.quantity then 1 else 0 end;
    v_selected_product:=v_selected_product+v_product_cents/l.quantity+case when v_i<=v_product_cents%l.quantity then 1 else 0 end;
    v_selected_cost:=v_selected_cost+v_cost_cents/l.quantity+case when v_i<=v_cost_cents%l.quantity then 1 else 0 end;
   end if;
  end loop;
  v_plan:=v_plan||jsonb_build_array(jsonb_build_object('lineItemId',l.id,'selectedQuantity',v_n,'remainingQuantity',l.quantity-v_n,'sortOrder',l.sort_order,'acceptedTotal',v_selected_cents/100.0,'originalTotal',v_cents/100.0));
  if v_n>0 then
   v_current:=v_current||jsonb_build_object(l.id::text,jsonb_build_object('quantity',v_n,'total',v_selected_cents/100.0));
   v_current_costs:=v_current_costs||jsonb_build_object(l.id::text,jsonb_build_object('quantity',v_n,'productTotal',v_selected_product/100.0,'total',v_selected_cost/100.0));
  end if;
  if v_n<l.quantity then
   v_future:=v_future||jsonb_build_object(l.sort_order::text,jsonb_build_object('quantity',l.quantity-v_n,'total',(v_cents-v_selected_cents)/100.0));
   v_future_costs:=v_future_costs||jsonb_build_object(l.sort_order::text,jsonb_build_object('quantity',l.quantity-v_n,'productTotal',(v_product_cents-v_selected_product)/100.0,'total',(v_cost_cents-v_selected_cost)/100.0));
  end if;
  v_remaining_quantity:=v_remaining_quantity+l.quantity-v_n;
  v_total:=v_total+v_selected_cents; v_remaining:=v_remaining+v_cents-v_selected_cents;
  v_product_total:=v_product_total+v_selected_product; v_internal:=v_internal+v_selected_cost; v_internal_remaining:=v_internal_remaining+v_cost_cents-v_selected_cost;
 end loop;
 if not (p_selected_line_ids<@v_known) or v_total<=0 or round(p_acknowledged_total*100)<>v_total then
  raise exception 'Review the exact selected contract total before signing.' using errcode='40001'; end if;
 v_cur_money:=jsonb_build_object('subtotal',v_total/100.0,'total',v_total/100.0,'discount',0,'tax',0,'sourceTotalAdjustment',0,
  'depositDue',round(v_total/200.0,2),'balanceDue',v_total/100.0-round(v_total/200.0,2),'materialsCost',v_internal/100.0,'laborCost',0);
 v_fut_money:=jsonb_build_object('subtotal',v_remaining/100.0,'total',v_remaining/100.0,'discount',0,'tax',0,'sourceTotalAdjustment',0,
  'depositDue',round(v_remaining/200.0,2),'balanceDue',v_remaining/100.0-round(v_remaining/200.0,2),'materialsCost',v_internal_remaining/100.0,'laborCost',0);
 perform set_config('quote_v2.native_transition','on',true);
 if v_remaining_quantity>0 then
  select r.future_quote_id,r.future_job_id into v_fqid,v_fjid from public.partition_crm_partial_quote_acceptance(
   q.id,p_share_token,p_selected_line_ids,v_plan,p_signed_at,p_signature,p_printed_name,v_cur_money,v_fut_money) r;
  -- The partition copies snapshots exactly; remap frozen totals to new split IDs.
  v_counts:='{}'; v_entry:='{}';
  for f in select id,sort_order from public.crm_quote_line_items where quote_id=v_fqid loop
   if v_future->f.sort_order::text is null then raise exception 'Future partition identity mismatch.' using errcode='55000'; end if;
   v_counts:=v_counts||jsonb_build_object(f.id::text,v_future->f.sort_order::text);
   v_entry:=v_entry||jsonb_build_object(f.id::text,v_future_costs->f.sort_order::text);
  end loop;
  v_fdid:=gen_random_uuid(); v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.sales_quote_v2_deliveries(id,quote_id,preparation_id,crm_quote_id,actor_id,quote_revision,request_key,request,customer_payload,internal_line_costs,share_token)
   values(v_fdid,null,d.preparation_id,v_fqid,d.actor_id,1,'future:'||v_fqid,d.request,
    jsonb_build_object('total',v_remaining/100.0,'parentDeliveryId',d.id,'lineTotals',v_counts),v_entry,v_token);
  update public.crm_quotes set share_token=v_token,quote_label='Pending Quote',meta=(meta-'source_sales_quote_id'-'mts_quote_id'-'sales_quote_id')||
   jsonb_build_object('native_delivery_id',v_fdid,'native_frozen_line_totals',v_counts) where id=v_fqid;
  for v_channel in select unnest(array['email','sms']) loop
   for v_recipient in select jsonb_array_elements_text(d.request->v_channel) loop
    insert into public.sales_quote_v2_delivery_attempts(delivery_id,channel,recipient) values(v_fdid,v_channel,v_recipient);
   end loop;
  end loop;
 else
  update public.crm_quotes set status='sold',signed_at=p_signed_at,sold_at=p_signed_at,customer_signature=p_signature,customer_printed_name=p_printed_name,
   quote_total=v_total/100.0,materials_cost=v_internal/100.0,discount=0,tax=0,deposit_required=round(v_total/200.0,2),balance_due=v_total/100.0-round(v_total/200.0,2) where id=q.id;
 end if;
 -- The current rows now represent exactly the purchased quantities. Do not apply
 -- the original physical IDs a second time to the already-partitioned rows.
 update public.crm_quotes set meta=(meta-'signed_selection')||jsonb_build_object('native_frozen_line_totals',v_current) where id=q.id;
 insert into public.sales_quote_v2_acceptances(delivery_id,crm_quote_id,selected_line_ids,line_quantities,accepted_total,accepted_at,future_quote_id,future_job_id)
  values(d.id,q.id,p_selected_line_ids,v_plan,v_total/100.0,p_signed_at,v_fqid,v_fjid);
 update public.sales_quotes set status='sold',signed_at=p_signed_at,customer_signature=p_signature,customer_printed_name=p_printed_name,total_amount=v_total/100.0,manufacturer_cost=v_product_total/100.0,
  quote_v2_accepted_selection=jsonb_build_object('lineQuantities',v_plan,'selectedLineIds',to_jsonb(p_selected_line_ids),'acceptedTotal',v_total/100.0,
   'acceptedManufacturerCost',v_product_total/100.0,'originalManufacturerCost',(select manufacturer_cost from public.sales_quotes where id=d.quote_id),'originalTotal',d.customer_payload->'total','crmQuoteId',q.id,'futureQuoteId',v_fqid,'futureJobId',v_fjid)
  where id=d.quote_id and quote_v2_delivery_id=d.id;
 -- Preserve every existing link, even for superseded alternatives.
 update public.crm_quotes set quote_label=case when quote_label like 'Pending Quote%' then quote_label else 'Pending Quote '||coalesce(quote_label,'') end,meta=meta||jsonb_build_object('native_superseded_by_quote_id',q.id) where quote_group_id=q.quote_group_id and id<>q.id and signed_at is null;
 perform set_config('quote_v2.native_transition','',true);
 return query select false,v_fqid,v_fjid;
end; $$;
revoke all on function public.accept_native_quote_delivery(uuid,text,text[],numeric,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.accept_native_quote_delivery(uuid,text,text[],numeric,timestamptz,text,text) to service_role;
