-- Only the reviewed selection may be frozen or dispatched. No financial backfill.
create or replace function public.reserve_native_quote_selection_delivery(
 p_quote_id uuid,p_actor_id uuid,p_expected_revision bigint,p_request_key text,p_request jsonb,p_payloads jsonb,
 p_delivery_mode text default null,p_previous_request_key text default null
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; member public.sales_quotes%rowtype; d public.sales_quote_v2_deliveries%rowtype;
 ids jsonb; payload jsonb; result jsonb; active_result jsonb; v_count integer;
begin
 perform public.require_native_quote_actor(p_actor_id);
 select * into q from public.sales_quotes where id=p_quote_id;
 if not found then raise exception 'Quote not found.' using errcode='P0002'; end if;
 if q.quote_group_id is not null then perform pg_advisory_xact_lock(hashtextextended(q.quote_group_id::text,8391)); end if;
 ids:=coalesce(p_request->'selectedQuoteIds',jsonb_build_array(p_quote_id::text));
 if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) not between 1 and 100 or not ids @> jsonb_build_array(p_quote_id::text) or
   jsonb_array_length(ids)<>(select count(distinct value) from jsonb_array_elements_text(ids)) then
   raise exception 'Select the current quote and any additional quotes.' using errcode='22023'; end if;
 if jsonb_array_length(ids)>1 and p_request->>'multipleQuotesApproved' is distinct from 'true' then raise exception 'Approve sending multiple quotes.' using errcode='22023'; end if;
 if p_delivery_mode is not null and p_delivery_mode<>'resend' then raise exception 'Invalid delivery action.' using errcode='22023'; end if;
 if jsonb_typeof(p_payloads) is distinct from 'array' then raise exception 'Selected quote revisions are required.' using errcode='22023'; end if;
 select count(*) into v_count from public.sales_quotes where ids ? id::text and account_id is not distinct from q.account_id and
   (id=q.id or (q.quote_group_id is not null and quote_group_id=q.quote_group_id));
 if v_count<>jsonb_array_length(ids) or v_count<>jsonb_array_length(p_payloads) or v_count<>(select count(distinct x->>'quoteId') from jsonb_array_elements(p_payloads) x) then
   raise exception 'The selected quotes changed or belong to another project.' using errcode='PT409'; end if;
 perform set_config('quote_v2.native_group',coalesce(q.quote_group_id::text,''),true);
 perform set_config('quote_v2.native_dispatch_quote',p_quote_id::text,true);
 for member in select * from public.sales_quotes where ids ? id::text order by id for update loop
   select x into payload from jsonb_array_elements(p_payloads) x where x->>'quoteId'=member.id::text;
   if payload is null or (payload->>'revision')::bigint is distinct from member.quote_v2_revision or
     (member.id=q.id and p_expected_revision is distinct from member.quote_v2_revision) or member.archived_at is not null or member.status not in ('draft','sent') or member.signed_at is not null then
     raise exception 'A selected quote changed. Reload before sending.' using errcode='PT409'; end if;
   if not member.quote_v2_backend or not exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=member.id) then raise exception 'Every selected quote must use native delivery.' using errcode='PT409'; end if;
   select * into d from public.sales_quote_v2_deliveries where quote_id=member.id;
   if found then
     if d.quote_revision is distinct from member.quote_v2_revision then raise exception 'Frozen quote revision changed.' using errcode='PT409'; end if;
     if member.id=q.id then
       if p_delivery_mode='resend' then
         active_result:=public.reserve_native_quote_resend(q.id,p_actor_id,p_expected_revision,p_request_key,p_previous_request_key,p_request);
       else
         if (d.request - 'selectedQuoteIds' - 'multipleQuotesApproved') is distinct from (p_request - 'selectedQuoteIds' - 'multipleQuotesApproved') or
           coalesce(d.request->'selectedQuoteIds',jsonb_build_array(q.id::text)) is distinct from ids then raise exception 'Resume the saved delivery or use Send again.' using errcode='PT409'; end if;
         active_result:=to_jsonb(d);
       end if;
     end if;
   else
     result:=public.reserve_native_quote_delivery(member.id,p_actor_id,member.quote_v2_revision,p_request_key,p_request,payload->'payload');
     if member.id=q.id then active_result:=result; end if;
   end if;
 end loop;
 perform set_config('quote_v2.native_group','',true);
 perform set_config('quote_v2.native_dispatch_quote','',true);
 if active_result is null then raise exception 'Selected delivery was not reserved.' using errcode='PT409'; end if;
 return active_result;
end $$;
revoke all on function public.reserve_native_quote_selection_delivery(uuid,uuid,bigint,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.reserve_native_quote_selection_delivery(uuid,uuid,bigint,text,jsonb,jsonb,text,text) to service_role;

-- Extra sibling payloads from an older client do not constitute approval.
create or replace function public.reserve_native_quote_group_delivery(p_quote_id uuid,p_actor_id uuid,p_expected_revision bigint,p_request_key text,p_request jsonb,p_payloads jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare payloads jsonb; ids jsonb;
begin
 ids:=coalesce(p_request->'selectedQuoteIds',jsonb_build_array(p_quote_id::text));
 select coalesce(jsonb_agg(x),'[]'::jsonb) into payloads from jsonb_array_elements(p_payloads) x where ids ? (x->>'quoteId');
 if jsonb_array_length(payloads)=0 then payloads:=jsonb_build_array(jsonb_build_object('quoteId',p_quote_id,'revision',p_expected_revision,'payload',null)); end if;
 return public.reserve_native_quote_selection_delivery(p_quote_id,p_actor_id,p_expected_revision,p_request_key,p_request,payloads);
end $$;

do $migration$
declare definition text; original text; target regprocedure;
begin
 target:='public.reserve_native_quote_resend(uuid,uuid,bigint,text,text,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(target);original:=definition;
 definition:=replace(definition,
 $old$where (sq.id=q.id or (q.quote_group_id is not null and sq.quote_group_id=q.quote_group_id))
 and (exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=dl.id) or dl.request->>'purpose'='in_person') order by dl.created_at,dl.id limit 1;$old$,
 $new$where sq.id=q.id order by dl.created_at,dl.id limit 1;$new$);
 if definition=original then raise exception 'Resend selection definition changed'; end if;
 execute definition;
 target:='public.claim_native_quote_delivery_attempt(uuid,uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);original:=definition;
 definition:=replace(definition,
 $old$  if a.state not in ('pending','failed')$old$,
 $new$  if exists (
   select 1 from public.sales_quote_v2_deliveries dispatch
   cross join lateral jsonb_array_elements_text(coalesce((select request->'selectedQuoteIds' from public.sales_quote_v2_resend_requests where delivery_id=dispatch.id and request_key=a.send_key),dispatch.request->'selectedQuoteIds',jsonb_build_array(dispatch.quote_id::text))) selected(id)
   left join public.sales_quotes member on member.id::text=selected.id
   left join public.sales_quote_v2_deliveries frozen on frozen.quote_id=member.id
   where dispatch.id=a.delivery_id and (member.id is null or member.archived_at is not null or member.status not in ('draft','sent') or member.signed_at is not null or frozen.id is null or frozen.quote_revision is distinct from member.quote_v2_revision)
  ) then raise exception 'A selected quote is no longer available. Reload before sending.' using errcode='PT409'; end if;
  if a.state not in ('pending','failed')$new$);
 if definition=original then raise exception 'Delivery claim definition changed'; end if;
 execute definition;
 target:='public.finish_native_quote_delivery_attempt(uuid,uuid,uuid,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(target);original:=definition;
 definition:=replace(definition,
 $old$where id=d.quote_id or (quote_v2_delivery_id is not null and quote_group_id=(select quote_group_id from public.sales_quotes where id=d.quote_id))$old$,
 $new$where id=d.quote_id or (quote_v2_delivery_id is not null and coalesce((select request->'selectedQuoteIds' from public.sales_quote_v2_resend_requests where delivery_id=d.id and request_key=a.send_key),d.request->'selectedQuoteIds','[]'::jsonb) ? id::text)$new$);
 definition:=replace(definition,
 $old$where id=d.crm_quote_id or (meta ? 'native_delivery_id' and quote_group_id=(select quote_group_id from public.crm_quotes where id=d.crm_quote_id))$old$,
 $new$where id=d.crm_quote_id or id in (select dl.crm_quote_id from public.sales_quote_v2_deliveries dl where coalesce((select request->'selectedQuoteIds' from public.sales_quote_v2_resend_requests where delivery_id=d.id and request_key=a.send_key),d.request->'selectedQuoteIds','[]'::jsonb) ? dl.quote_id::text)$new$);
 if definition=original then raise exception 'Delivery status definition changed'; end if;
 execute definition;
end $migration$;

create or replace function public.native_quote_delivery_capability(p_quote_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; d public.sales_quote_v2_deliveries%rowtype; r public.sales_quote_v2_resend_requests%rowtype;
 v_native boolean; v_allowed boolean; v_state text; v_key text; v_request jsonb; v_recipients jsonb;
begin
 perform public.require_native_quote_actor(p_actor_id);
 select * into q from public.sales_quotes where id=p_quote_id;
 v_native:=coalesce(q.quote_v2_backend,false) and exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=p_quote_id);
 select * into d from public.sales_quote_v2_deliveries where quote_id=q.id;
 select * into r from public.sales_quote_v2_resend_requests where delivery_id=d.id order by created_at desc,request_key desc limit 1;
 v_key:=coalesce(r.request_key,'initial');v_request:=coalesce(r.request,d.request);
 select case when bool_or(state in ('sending','uncertain')) then 'uncertain' when bool_and(state='sent') then 'sent' when bool_or(state='pending') then 'pending' else 'failed' end,
 jsonb_agg(jsonb_build_object('channel',channel,'recipient',recipient,'state',state,'completedAt',completed_at) order by channel,recipient)
 into v_state,v_recipients from public.sales_quote_v2_delivery_attempts where delivery_id=d.id and send_key=v_key;
 v_allowed:=v_native and q.archived_at is null and q.signed_at is null and q.status in ('draft','sent') and not exists(select 1 from public.crm_quotes cq where
 (cq.id=d.crm_quote_id and (cq.signed_at is not null or cq.status not in ('draft','sent'))) or (cq.quote_group_id=q.quote_group_id and cq.signed_at is not null));
 return jsonb_build_object('schemaVersion',1,'native',v_native,'reserved',d.id is not null,'supportsResend',true,'supportsInPerson',true,'supportsQuoteSelection',true,
 'canSend',v_allowed and ((d.id is null and q.quote_v2_status='priced') or (d.id is not null and coalesce(v_state,'sent') in ('pending','sent','failed'))),
 'reservation',case when d.id is null then null else jsonb_build_object('requestKey',coalesce(r.request_key,d.request_key),'revision',q.quote_v2_revision,'request',v_request,'state',coalesce(v_state,'sent'),'resend',r.request_key is not null,'recipients',v_recipients) end);
end $$;
