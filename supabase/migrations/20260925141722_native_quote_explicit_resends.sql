-- Keep the frozen contract and all previous receipts. Each intentional resend is
-- a separate, immutable request; retrying its key never creates another batch.
create table public.sales_quote_v2_resend_requests (
 delivery_id uuid not null references public.sales_quote_v2_deliveries(id),
 request_key text not null check(request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
 request jsonb not null check(jsonb_typeof(request)='object'),
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(delivery_id,request_key)
);
alter table public.sales_quote_v2_resend_requests enable row level security;
revoke all on public.sales_quote_v2_resend_requests from public,anon,authenticated;
grant select,insert on public.sales_quote_v2_resend_requests to service_role;
create trigger native_resend_append_only before update or delete on public.sales_quote_v2_resend_requests
 for each row execute function public.reject_v2_audit_mutation();
alter table public.sales_quote_v2_delivery_attempts add column send_key text not null default 'initial';
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.sales_quote_v2_delivery_attempts'::regclass and contype='u' loop
  execute format('alter table public.sales_quote_v2_delivery_attempts drop constraint %I',c.conname);
 end loop;
end $$;
create unique index native_delivery_recipient_per_request on public.sales_quote_v2_delivery_attempts(delivery_id,send_key,channel,recipient);

-- These are permanent business conflicts, never serialization failures. Using
-- 40001 makes PostgREST retry transactions that can never succeed.
do $$ declare f record; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in (
 'prepare_native_quote_customer_snapshot','reserve_native_quote_delivery','reserve_native_quote_group_delivery',
 'claim_native_quote_delivery_attempt','finish_native_quote_delivery_attempt','reconcile_native_quote_delivery_attempt','accept_native_quote_delivery') loop
  execute replace(pg_get_functiondef(f.oid),'''40001''','''PT409''');
 end loop;
end $$;

create function public.reserve_native_quote_resend(
 p_quote_id uuid,p_actor_id uuid,p_expected_revision bigint,p_request_key text,p_previous_request_key text,p_request jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; d public.sales_quote_v2_deliveries%rowtype;
 r public.sales_quote_v2_resend_requests%rowtype; latest public.sales_quote_v2_resend_requests%rowtype;
 channel_name text; recipient_value text; recipient_count integer:=0;
begin
 perform public.require_native_quote_actor(p_actor_id);
 select * into q from public.sales_quotes where id=p_quote_id;
 if not found then raise exception 'Quote not found.' using errcode='P0002'; end if;
 if q.quote_group_id is not null then perform pg_advisory_xact_lock(hashtextextended(q.quote_group_id::text,8391)); end if;
 perform 1 from public.sales_quotes where id=q.id or (q.quote_group_id is not null and quote_group_id=q.quote_group_id) order by id for update;
 select * into q from public.sales_quotes where id=p_quote_id;
 if not q.quote_v2_backend or not exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=q.id) then
  raise exception 'Native quote provenance is required.' using errcode='42501'; end if;
 if p_expected_revision is distinct from q.quote_v2_revision or q.archived_at is not null or q.status not in ('draft','sent') or q.signed_at is not null then
  raise exception 'This quote changed or can no longer be sent. Reload it.' using errcode='PT409'; end if;
 select dl.* into d from public.sales_quote_v2_deliveries dl join public.sales_quotes sq on sq.id=dl.quote_id
 where (sq.id=q.id or (q.quote_group_id is not null and sq.quote_group_id=q.quote_group_id))
 and exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=dl.id) order by dl.created_at,dl.id limit 1;
 if not found then raise exception 'Send this quote before using Send again.' using errcode='PT409'; end if;
 perform 1 from public.sales_quote_v2_deliveries where id=d.id for update;
 if exists(select 1 from public.crm_quotes cq where (cq.id=d.crm_quote_id and (cq.signed_at is not null or cq.status not in ('draft','sent'))) or
  (cq.quote_group_id=q.quote_group_id and cq.signed_at is not null)) then
  raise exception 'This contract has already been accepted or superseded.' using errcode='PT409'; end if;
 if p_request_key is null or p_request_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$' or p_request_key=d.request_key or p_request_key='initial' or jsonb_typeof(p_request) is distinct from 'object' then
  raise exception 'A new delivery request key and recipients are required.' using errcode='22023'; end if;
 if p_request->'measureDecision' is distinct from d.request->'measureDecision' then
  raise exception 'A resend cannot change the contract measure decision.' using errcode='PT409'; end if;
 if coalesce(length(p_request->>'note'),0)>4000 then raise exception 'The customer note is too long.' using errcode='22023'; end if;
 foreach channel_name in array array['email','sms'] loop
  if jsonb_typeof(p_request->channel_name) is distinct from 'array' then raise exception 'Delivery recipient list is invalid.' using errcode='22023'; end if;
  if jsonb_array_length(p_request->channel_name)>(case when channel_name='email' then 10 else 1 end) then raise exception 'Too many recipients.' using errcode='22023'; end if;
  for recipient_value in select jsonb_array_elements_text(p_request->channel_name) loop
   if recipient_value is null or length(recipient_value)>320 or
    (channel_name='email' and recipient_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or
    (channel_name='sms' and recipient_value !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'Delivery recipient is invalid.' using errcode='22023'; end if;
   recipient_count:=recipient_count+1;
  end loop;
 end loop;
 if recipient_count<1 then raise exception 'Select at least one recipient.' using errcode='22023'; end if;
 select * into r from public.sales_quote_v2_resend_requests where delivery_id=d.id and request_key=p_request_key;
 if found then
  if r.request is distinct from p_request then raise exception 'This send request already has different recipients. Reload before sending again.' using errcode='PT409'; end if;
 else
  select * into latest from public.sales_quote_v2_resend_requests where delivery_id=d.id order by created_at desc,request_key desc limit 1;
  if p_previous_request_key is distinct from coalesce(latest.request_key,d.request_key) then
   raise exception 'Another send was started. Reload to review its result.' using errcode='PT409'; end if;
  if exists(select 1 from public.sales_quote_v2_delivery_attempts where delivery_id=d.id and state in ('pending','sending','uncertain')) then
   raise exception 'An earlier send is pending or uncertain. Resume or reconcile it before sending again.' using errcode='PT409'; end if;
  insert into public.sales_quote_v2_resend_requests(delivery_id,request_key,request,actor_id) values(d.id,p_request_key,p_request,p_actor_id) returning * into r;
  foreach channel_name in array array['email','sms'] loop
   for recipient_value in select distinct jsonb_array_elements_text(p_request->channel_name) loop
    insert into public.sales_quote_v2_delivery_attempts(delivery_id,send_key,channel,recipient) values(d.id,p_request_key,channel_name,recipient_value);
   end loop;
  end loop;
 end if;
 return to_jsonb(d)||jsonb_build_object('request',r.request,'send_key',r.request_key);
end $$;
revoke all on function public.reserve_native_quote_resend(uuid,uuid,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_native_quote_resend(uuid,uuid,bigint,text,text,jsonb) to service_role;

-- Serialize a claim with new batches; an old failed attempt cannot be resumed
-- after a replacement batch has been created.
do $$ declare definition text; begin
 select pg_get_functiondef('public.claim_native_quote_delivery_attempt(uuid,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'  select * into a from public.sales_quote_v2_delivery_attempts where id=p_attempt_id for update;',
 '  perform 1 from public.sales_quote_v2_deliveries where id=(select delivery_id from public.sales_quote_v2_delivery_attempts where id=p_attempt_id) for update;
  select * into a from public.sales_quote_v2_delivery_attempts where id=p_attempt_id for update;');
 definition:=replace(definition,'  update public.sales_quote_v2_delivery_attempts set state=',
 '  if a.send_key is distinct from coalesce((select request_key from public.sales_quote_v2_resend_requests where delivery_id=a.delivery_id order by created_at desc,request_key desc limit 1),''initial'') then
   raise exception ''This send was replaced by a newer request. Reload its delivery status.'' using errcode=''PT409'';
  end if;
  update public.sales_quote_v2_delivery_attempts set state=');
 execute definition;
end $$;

create or replace function public.native_quote_delivery_capability(p_quote_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; d public.sales_quote_v2_deliveries%rowtype; r public.sales_quote_v2_resend_requests%rowtype;
 v_native boolean; v_allowed boolean; v_state text; v_key text; v_request jsonb; v_recipients jsonb;
begin
 perform public.require_native_quote_actor(p_actor_id);
 if to_regprocedure('public.accept_native_quote_delivery(uuid,text,text[],numeric,timestamptz,text,text)') is null or to_regprocedure('public.reconcile_native_quote_delivery_attempt(uuid,uuid,text,boolean,text)') is null then
  return jsonb_build_object('schemaVersion',0,'native',false,'reserved',false,'canSend',false); end if;
 select * into q from public.sales_quotes where id=p_quote_id;
 v_native:=coalesce(q.quote_v2_backend,false) and exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=p_quote_id);
 select dl.* into d from public.sales_quote_v2_deliveries dl join public.sales_quotes sq on sq.id=dl.quote_id
 where (sq.id=q.id or (q.quote_group_id is not null and sq.quote_group_id=q.quote_group_id))
 and exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=dl.id) order by dl.created_at,dl.id limit 1;
 select * into r from public.sales_quote_v2_resend_requests where delivery_id=d.id order by created_at desc,request_key desc limit 1;
 v_key:=coalesce(r.request_key,'initial'); v_request:=coalesce(r.request,d.request);
 select case when bool_or(state in ('sending','uncertain')) then 'uncertain' when bool_and(state='sent') then 'sent' when bool_or(state='pending') then 'pending' else 'failed' end,
 jsonb_agg(jsonb_build_object('channel',channel,'recipient',recipient,'state',state,'completedAt',completed_at) order by channel,recipient)
 into v_state,v_recipients from public.sales_quote_v2_delivery_attempts where delivery_id=d.id and send_key=v_key;
 v_allowed:=v_native and q.archived_at is null and q.signed_at is null and q.status in ('draft','sent') and not exists(select 1 from public.crm_quotes cq where
 (cq.id=d.crm_quote_id and (cq.signed_at is not null or cq.status not in ('draft','sent'))) or (cq.quote_group_id=q.quote_group_id and cq.signed_at is not null));
 return jsonb_build_object('schemaVersion',1,'native',v_native,'reserved',q.quote_v2_delivery_id is not null,'supportsResend',true,
 'canSend',v_allowed and ((q.quote_v2_delivery_id is null and q.quote_v2_status='priced' and not exists(select 1 from public.sales_quotes sibling where sibling.quote_group_id=q.quote_group_id and sibling.archived_at is null and sibling.status<>'archived' and
 (not sibling.quote_v2_backend or sibling.status<>'draft' or sibling.quote_v2_status<>'priced' or not exists(select 1 from public.sales_quote_v2_draft_requests nr where nr.quote_id=sibling.id)))) or v_state in ('pending','sent','failed')),
 'reservation',case when d.id is null then null else jsonb_build_object('requestKey',coalesce(r.request_key,d.request_key),'revision',q.quote_v2_revision,'request',v_request,'state',v_state,'resend',r.request_key is not null,'recipients',v_recipients) end);
end $$;
