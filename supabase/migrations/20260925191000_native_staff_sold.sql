-- Staff sale and customer signature are separate facts. Reuse the native
-- allocation/price transaction, recording the staff actor without inventing ink.
do $migration$
declare definition text; before_definition text;
begin
 definition:=pg_get_functiondef('public.accept_native_quote_delivery(uuid,text,text[],numeric,timestamptz,text,text)'::regprocedure);
 before_definition:=definition;
 definition:=replace(definition,'declare q public.crm_quotes%rowtype;',
  $new$declare staff_actor uuid := nullif(current_setting('quote_v2.staff_sale_actor',true),'')::uuid;
  staff_receipt public.sales_quote_v2_acceptances%rowtype;
  q public.crm_quotes%rowtype;$new$);
 if definition=before_definition then raise exception 'Native acceptance declarations changed'; end if;
 definition:=replace(definition,
  $old$if q.signed_at is not null then$old$,
  $new$if staff_actor is not null then perform public.require_native_quote_actor(staff_actor); end if;
 if q.meta ? 'native_staff_sale' and q.signed_at is null and staff_actor is null then
   select * into staff_receipt from public.sales_quote_v2_acceptances where crm_quote_id=q.id;
   if not found or p_signed_at is null or nullif(btrim(p_signature),'') is null or nullif(btrim(p_printed_name),'') is null
     or p_acknowledged_total is distinct from staff_receipt.accepted_total
     or p_selected_line_ids is null or cardinality(p_selected_line_ids)<>cardinality(staff_receipt.selected_line_ids)
     or not (p_selected_line_ids @> staff_receipt.selected_line_ids and p_selected_line_ids <@ staff_receipt.selected_line_ids) then
     raise exception 'Review the complete sold contract before signing.' using errcode='PT409';
   end if;
   perform set_config('quote_v2.native_transition','on',true);
   update public.crm_quotes set signed_at=p_signed_at,customer_signature=p_signature,customer_printed_name=p_printed_name where id=q.id;
   update public.sales_quotes set signed_at=p_signed_at,customer_signature=p_signature,customer_printed_name=p_printed_name where id=d.quote_id;
   perform set_config('quote_v2.native_transition','',true);
   return query select false,null::uuid,null::uuid;
   return;
 end if;
 if q.signed_at is not null or (staff_actor is not null and q.meta ? 'native_staff_sale') then$new$);
 definition:=replace(definition,
  $old$if p_signed_at is null or nullif(btrim(p_signature),'') is null or nullif(btrim(p_printed_name),'') is null or$old$,
  $new$if p_signed_at is null or (staff_actor is null and (nullif(btrim(p_signature),'') is null or nullif(btrim(p_printed_name),'') is null)) or$new$);
 definition:=replace(definition,
  $old$and id<>q.id and signed_at is not null$old$,
  $new$and id<>q.id and (signed_at is not null or meta ? 'native_staff_sale')$new$);
 -- Staff sells the complete reviewed quote. Partial purchases use customer consent.
 definition:=replace(definition,
  $old$if v_remaining_quantity>0 then$old$,
  $new$if staff_actor is not null then
    if v_remaining_quantity>0 then raise exception 'Staff sale requires the complete quote.' using errcode='22023'; end if;
    update public.crm_quotes set meta=meta||jsonb_build_object('native_staff_sale',jsonb_build_object('actorId',staff_actor,'soldAt',p_signed_at)) where id=q.id;
  end if;
 if v_remaining_quantity>0 then$new$);
 definition:=replace(definition,'signed_at=p_signed_at,','signed_at=case when staff_actor is null then p_signed_at else null end,');
 -- The later customer-signature branch always runs without staff_actor.
 execute definition;

 definition:=pg_get_functiondef('public.protect_native_quote_delivery()'::regprocedure);
 definition:=replace(definition,
  $old$new.meta->'native_delivery_id' is distinct from old.meta->'native_delivery_id' or$old$,
  $new$new.meta->'native_staff_sale' is distinct from old.meta->'native_staff_sale' or
      new.meta->'native_delivery_id' is distinct from old.meta->'native_delivery_id' or$new$);
 execute definition;
end $migration$;

create function public.record_native_quote_staff_sale(
 p_quote_id uuid,p_actor_id uuid,p_expected_revision bigint,p_acknowledged_total numeric
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare d public.sales_quote_v2_deliveries%rowtype; q public.sales_quotes%rowtype; selected_ids text[];
begin
 perform public.require_native_quote_actor(p_actor_id);
 select * into q from public.sales_quotes where id=p_quote_id;
 if q.quote_v2_revision is distinct from p_expected_revision or q.archived_at is not null then
   raise exception 'This quote changed. Reload it before marking it sold.' using errcode='PT409'; end if;
 select * into d from public.sales_quote_v2_deliveries where quote_id=p_quote_id and id=q.quote_v2_delivery_id;
 if not found then raise exception 'Review the frozen contract before marking it sold.' using errcode='PT409'; end if;
 select array_agg(case when l.quantity=1 then l.id::text else l.id::text||'#'||n::text end order by l.id,n)
 into selected_ids from public.crm_quote_line_items l cross join lateral generate_series(1,l.quantity) n where l.quote_id=d.crm_quote_id;
 if p_acknowledged_total is null or p_acknowledged_total<=0 or p_acknowledged_total<>(d.customer_payload->>'total')::numeric then
   raise exception 'Review the exact contract total before marking it sold.' using errcode='PT409'; end if;
 perform set_config('quote_v2.staff_sale_actor',p_actor_id::text,true);
 perform * from public.accept_native_quote_delivery(d.crm_quote_id,d.share_token,selected_ids,p_acknowledged_total,now(),null,null);
 perform set_config('quote_v2.staff_sale_actor','',true);
 return d.crm_quote_id;
end $$;
revoke all on function public.record_native_quote_staff_sale(uuid,uuid,bigint,numeric) from public,anon,authenticated;
grant execute on function public.record_native_quote_staff_sale(uuid,uuid,bigint,numeric) to service_role;
