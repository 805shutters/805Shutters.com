-- Additive native-only delivery and acceptance ledger. No historical backfill.
create table public.sales_quote_v2_deliveries (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid unique references public.sales_quotes(id) on delete restrict,
  preparation_id uuid not null references public.sales_quote_v2_customer_send_preparations(id),
  crm_quote_id uuid not null unique references public.crm_quotes(id),
  actor_id uuid not null,
  quote_revision bigint not null,
  request_key text not null,
  request jsonb not null,
  customer_payload jsonb not null,
  internal_line_costs jsonb not null default '{}'::jsonb,
  share_token text not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(request) = 'object'),
  check (not public.quote_v2_customer_json_has_protected_key(customer_payload))
);
create table public.sales_quote_v2_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.sales_quote_v2_deliveries(id),
  channel text not null check(channel in ('email','sms')),
  recipient text not null,
  state text not null default 'pending' check(state in ('pending','sending','sent','failed','uncertain')),
  claim_token uuid,
  claimed_at timestamptz,
  result jsonb,
  completed_at timestamptz,
  unique(delivery_id,channel,recipient)
);
create table public.sales_quote_v2_acceptances (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.sales_quote_v2_deliveries(id),
  crm_quote_id uuid not null unique references public.crm_quotes(id),
  selected_line_ids text[] not null,
  line_quantities jsonb not null,
  accepted_total numeric(12,2) not null,
  accepted_at timestamptz not null,
  future_quote_id uuid references public.crm_quotes(id),
  future_job_id uuid references public.crm_jobs(id)
);
alter table public.sales_quotes add column quote_v2_delivery_id uuid references public.sales_quote_v2_deliveries(id);
alter table public.sales_quotes add column quote_v2_accepted_selection jsonb;

alter table public.sales_quote_v2_deliveries enable row level security;
alter table public.sales_quote_v2_delivery_attempts enable row level security;
alter table public.sales_quote_v2_acceptances enable row level security;
revoke all on public.sales_quote_v2_deliveries, public.sales_quote_v2_delivery_attempts, public.sales_quote_v2_acceptances from public, anon, authenticated;
grant all on public.sales_quote_v2_deliveries, public.sales_quote_v2_delivery_attempts, public.sales_quote_v2_acceptances to service_role;
create trigger native_delivery_append_only before update or delete on public.sales_quote_v2_deliveries for each row execute function public.reject_v2_audit_mutation();
create trigger native_acceptance_append_only before update or delete on public.sales_quote_v2_acceptances for each row execute function public.reject_v2_audit_mutation();

create function public.require_native_quote_actor(p_actor_id uuid) returns void
language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.crm_profiles where id=p_actor_id and active=true
      and lower(email) in ('805shutters@gmail.com','jessica@805shutters.com')
  ) then raise exception 'An authorized quote actor is required.' using errcode='42501'; end if;
end; $$;

-- Freeze only quote financial/structural state. Payment and operational lifecycle
-- updates may continue; original snapshots, tokens and delivered selection cannot.
create function public.protect_native_quote_delivery() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_quote_id uuid; v_frozen boolean;
begin
  if current_setting('quote_v2.native_transition',true) = 'on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='sales_quotes' then
    if tg_op='DELETE' then
      if old.quote_v2_delivery_id is not null then raise exception 'Delivered native quote is immutable.' using errcode='55000'; end if;
      return old;
    end if;
    if old.quote_v2_delivery_id is not null and (
      new.quote_v2_delivery_id is distinct from old.quote_v2_delivery_id or
      new.quote_v2_accepted_selection is distinct from old.quote_v2_accepted_selection or
      new.quote_v2_backend is distinct from old.quote_v2_backend or
      new.quote_group_id is distinct from old.quote_group_id or
      new.signed_at is distinct from old.signed_at or
      new.customer_signature is distinct from old.customer_signature or
      new.customer_printed_name is distinct from old.customer_printed_name or
      new.quote_v2_revision is distinct from old.quote_v2_revision or
      new.quote_v2_catalog_version is distinct from old.quote_v2_catalog_version or
      new.total_amount is distinct from old.total_amount or
      new.manufacturer_cost is distinct from old.manufacturer_cost or
      new.installer_notes is distinct from old.installer_notes or
      new.share_token is distinct from old.share_token
    ) then raise exception 'Native quote delivery has frozen this quote version.' using errcode='55000'; end if;
    return new;
  elsif tg_table_name='sales_quote_line_items' then
    v_quote_id := case when tg_op='INSERT' then new.quote_id else old.quote_id end;
    select quote_v2_delivery_id is not null into v_frozen from public.sales_quotes where id=v_quote_id;
    if tg_op='UPDATE' and new.quote_id is distinct from old.quote_id then
      v_frozen := v_frozen or exists(select 1 from public.sales_quotes where id=new.quote_id and quote_v2_delivery_id is not null);
    end if;
  elsif tg_table_name='sales_quote_designs' then
    select q.quote_v2_delivery_id is not null into v_frozen from public.sales_quote_line_items l join public.sales_quotes q on q.id=l.quote_id
      where l.id=case when tg_op='INSERT' then new.line_item_id else old.line_item_id end;
    if tg_op='UPDATE' and new.line_item_id is distinct from old.line_item_id then
      v_frozen := v_frozen or exists(select 1 from public.sales_quote_line_items l join public.sales_quotes q on q.id=l.quote_id where l.id=new.line_item_id and q.quote_v2_delivery_id is not null);
    end if;
  elsif tg_table_name='crm_quotes' then
    if tg_op='DELETE' then
      if old.meta ? 'native_delivery_id' then raise exception 'Native customer contract cannot be deleted.' using errcode='55000'; end if;
      return old;
    end if;
    if old.meta ? 'native_delivery_id' and (
      new.meta->'native_delivery_id' is distinct from old.meta->'native_delivery_id' or
      new.meta->'native_frozen_line_totals' is distinct from old.meta->'native_frozen_line_totals' or
      new.meta->'native_superseded_by_quote_id' is distinct from old.meta->'native_superseded_by_quote_id' or
      new.quote_label is distinct from old.quote_label or
      new.meta->'signed_selection' is distinct from old.meta->'signed_selection' or
      new.meta->'partial_acceptance' is distinct from old.meta->'partial_acceptance' or
      new.meta->'legacy_quote_system' is distinct from old.meta->'legacy_quote_system' or
      new.meta->'mts_quote_id' is distinct from old.meta->'mts_quote_id' or
      new.meta->'source_sales_quote_id' is distinct from old.meta->'source_sales_quote_id' or
      new.meta->'sales_quote_id' is distinct from old.meta->'sales_quote_id' or
      new.meta->'adjustments' is distinct from old.meta->'adjustments' or
      new.meta->'communication_offer_of' is distinct from old.meta->'communication_offer_of' or
      new.quote_group_id is distinct from old.quote_group_id or
      new.quote_total is distinct from old.quote_total or new.discount is distinct from old.discount or
      new.tax is distinct from old.tax or new.materials_cost is distinct from old.materials_cost or
      new.share_token is distinct from old.share_token or new.customer_signature is distinct from old.customer_signature or
      new.signed_at is distinct from old.signed_at or new.customer_printed_name is distinct from old.customer_printed_name
    ) then raise exception 'Native contract requires its versioned acceptance workflow.' using errcode='55000'; end if;
    return new;
  elsif tg_table_name='crm_quote_line_items' then
    v_quote_id := case when tg_op='INSERT' then new.quote_id else old.quote_id end;
    select meta ? 'native_delivery_id' into v_frozen from public.crm_quotes where id=v_quote_id;
    if tg_op='UPDATE' and new.quote_id is distinct from old.quote_id then
      v_frozen := v_frozen or exists(select 1 from public.crm_quotes where id=new.quote_id and meta ? 'native_delivery_id');
    end if;
  elsif tg_table_name='crm_quote_designs' then
    select q.meta ? 'native_delivery_id' into v_frozen from public.crm_quote_line_items l join public.crm_quotes q on q.id=l.quote_id
      where l.id=case when tg_op='INSERT' then new.line_item_id else old.line_item_id end;
    if tg_op='UPDATE' and new.line_item_id is distinct from old.line_item_id then
      v_frozen := v_frozen or exists(select 1 from public.crm_quote_line_items l join public.crm_quotes q on q.id=l.quote_id where l.id=new.line_item_id and q.meta ? 'native_delivery_id');
    end if;
  end if;
  if coalesce(v_frozen,false) then raise exception 'Native quote delivery has frozen this configuration.' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger freeze_native_sales_quote before update or delete on public.sales_quotes for each row execute function public.protect_native_quote_delivery();
create trigger freeze_native_sales_lines before insert or update or delete on public.sales_quote_line_items for each row execute function public.protect_native_quote_delivery();
create trigger freeze_native_sales_designs before insert or update or delete on public.sales_quote_designs for each row execute function public.protect_native_quote_delivery();
create trigger freeze_native_crm_quote before update or delete on public.crm_quotes for each row execute function public.protect_native_quote_delivery();
create trigger freeze_native_crm_lines before insert or update or delete on public.crm_quote_line_items for each row execute function public.protect_native_quote_delivery();
create trigger freeze_native_crm_designs before insert or update or delete on public.crm_quote_designs for each row execute function public.protect_native_quote_delivery();

create function public.reserve_native_quote_delivery(
 p_quote_id uuid,p_actor_id uuid,p_expected_revision bigint,p_request_key text,p_request jsonb,p_customer_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; d public.sales_quote_v2_deliveries%rowtype; prep record;
  v_id uuid:=gen_random_uuid(); v_prior_key text; v_prior_via text; v_token text; v_recipient text; v_channel text; v_channels integer:=0;
begin
  perform public.require_native_quote_actor(p_actor_id);
  select * into q from public.sales_quotes where id=p_quote_id for update;
  if not found or not q.quote_v2_backend or not exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=p_quote_id) then
    raise exception 'Native quote provenance is required.' using errcode='42501'; end if;
  if p_request_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$' or p_expected_revision is null or p_expected_revision<1 or jsonb_typeof(p_request) is distinct from 'object' then
    raise exception 'Invalid delivery request.' using errcode='22023'; end if;
  select * into d from public.sales_quote_v2_deliveries where quote_id=p_quote_id;
  if found then
    if q.deleted_at is not null or q.status not in ('draft','sent') or q.signed_at is not null then raise exception 'This quote can no longer resume delivery.' using errcode='40001'; end if;
    if d.request<>p_request or d.quote_revision<>p_expected_revision then
      raise exception 'This quote version is already reserved with different delivery details. Resume its existing delivery.' using errcode='40001'; end if;
    return to_jsonb(d);
  end if;
  if q.deleted_at is not null or q.quote_v2_revision<>p_expected_revision or q.status<>'draft' or q.signed_at is not null or q.sent_at is not null then
    raise exception 'Native draft changed before delivery.' using errcode='40001'; end if;
  if exists(select 1 from public.crm_quotes where external_source='mts_805_bookkeeping' and external_id='quote:'||p_quote_id::text
    and (status<>'draft' or signed_at is not null or customer_signature is not null or sent_at is not null)) then
    raise exception 'An existing historical customer contract cannot be replaced.' using errcode='55000'; end if;
  -- Whole quote groups must use their current authoritative selections. A mixed
  -- historical/native group is never silently rematerialized by this transaction.
  if q.quote_group_id is not null and exists(select 1 from public.sales_quotes where quote_group_id=q.quote_group_id and id<>q.id and deleted_at is null and status<>'archived')
    and current_setting('quote_v2.native_group',true) is distinct from q.quote_group_id::text then
    raise exception 'Native grouped delivery requires all alternatives to be reserved together.' using errcode='55000'; end if;
  for v_channel in select unnest(array['email','sms']) loop
    if jsonb_typeof(p_request->v_channel) is distinct from 'array' then raise exception 'Delivery recipient list is invalid.' using errcode='22023'; end if;
    for v_recipient in select jsonb_array_elements_text(p_request->v_channel) loop
      if length(v_recipient)>320 or btrim(v_recipient)='' or
        (v_channel='sms' and v_recipient !~ '^\+[1-9][0-9]{7,14}$') or
        (v_channel='email' and v_recipient !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then
        raise exception 'Delivery recipient is invalid.' using errcode='22023'; end if;
      v_channels:=v_channels+1;
    end loop;
  end loop;
  if v_channels<1 or v_channels>11 then raise exception 'Select 1-11 delivery recipients.' using errcode='22023'; end if;
  select pr.idempotency_key,pr.prepared_via into v_prior_key,v_prior_via from public.sales_quote_v2_customer_send_preparations pr where pr.quote_id=p_quote_id and pr.quote_revision=p_expected_revision;
  select * into prep from public.prepare_native_quote_customer_snapshot(p_quote_id,p_expected_revision,q.quote_v2_catalog_version,
    coalesce(v_prior_key,'native:'||v_id::text),p_actor_id,
    coalesce(v_prior_via,case when jsonb_array_length(p_request->'email')>0 and jsonb_array_length(p_request->'sms')>0 then 'both' when jsonb_array_length(p_request->'email')>0 then 'email' else 'sms' end),
    p_customer_payload);
  -- Persist immutable internal totals separately from the customer DTO.
  select share_token into v_token from public.crm_quotes where id=prep.crm_quote_id for update;
  v_token:=coalesce(q.share_token::text,nullif(v_token,''),gen_random_uuid()::text);
  insert into public.sales_quote_v2_deliveries(id,quote_id,preparation_id,crm_quote_id,actor_id,quote_revision,request_key,request,customer_payload,share_token,internal_line_costs)
    values(v_id,p_quote_id,prep.send_preparation_id,prep.crm_quote_id,p_actor_id,p_expected_revision,p_request_key,p_request,prep.customer_payload,v_token,
      (select jsonb_object_agg(l.id::text,jsonb_build_object('quantity',l.quantity,'productTotal',case when s.catalog_version='custom-override-v1' then round((s.internal_cost_snapshot->>'manufacturerCost')::numeric*l.quantity,2) else (s.internal_cost_snapshot->>'productCostTotal')::numeric end,'total',
        case when s.catalog_version='custom-override-v1' then round(s.internal_landed_cost_total*l.quantity,2) else s.internal_landed_cost_total end))
       from public.sales_quote_line_items l join public.sales_quote_designs ds on ds.id=l.selected_design_id join public.sales_quote_v2_price_snapshots s on s.id=ds.current_v2_snapshot_id where l.quote_id=p_quote_id)) returning * into d;
  if coalesce(nullif(current_setting('quote_v2.native_dispatch_quote',true),''),p_quote_id::text)=p_quote_id::text then
  for v_channel in select unnest(array['email','sms']) loop
    for v_recipient in select jsonb_array_elements_text(p_request->v_channel) loop
      insert into public.sales_quote_v2_delivery_attempts(delivery_id,channel,recipient) values(v_id,v_channel,v_recipient);
    end loop;
  end loop;
  end if;
  update public.crm_quotes set share_token=v_token,meta=meta||jsonb_build_object('native_delivery_id',v_id,'native_frozen_line_totals',(select jsonb_object_agg(x->>'lineItemId',jsonb_build_object('quantity',x->'quantity','total',x#>'{price,total}')) from jsonb_array_elements(prep.customer_payload->'lines') x)) where id=prep.crm_quote_id;
  if p_request->>'measureDecision' in ('needed','not_needed') then
    update public.crm_quotes set meta=meta||jsonb_build_object('measure_needed',jsonb_build_object('status',p_request->>'measureDecision','requested_at',now(),'requested_by',p_actor_id,'request_source','native_contract_send')) where id=prep.crm_quote_id;
    update public.crm_jobs set meta=meta||jsonb_build_object('measure_needed',jsonb_build_object('status',p_request->>'measureDecision','requested_at',now(),'requested_by',p_actor_id,'request_source','native_contract_send')) where id=(select job_id from public.crm_quotes where id=prep.crm_quote_id);
  end if;
  update public.crm_quotes set customer_email=coalesce(p_request#>>'{email,0}',customer_email),customer_phone=coalesce(p_request#>>'{sms,0}',customer_phone) where id=prep.crm_quote_id;
  update public.crm_jobs set email=coalesce(p_request#>>'{email,0}',email),phone=coalesce(p_request#>>'{sms,0}',phone) where id=(select job_id from public.crm_quotes where id=prep.crm_quote_id);
  update public.sales_quotes set customer_email=coalesce(p_request#>>'{email,0}',customer_email),customer_phone=coalesce(p_request#>>'{sms,0}',customer_phone),share_token=v_token::uuid,quote_v2_delivery_id=v_id where id=p_quote_id;
  return to_jsonb(d);
end; $$;

create function public.claim_native_quote_delivery_attempt(p_attempt_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare a public.sales_quote_v2_delivery_attempts%rowtype;
begin
  perform public.require_native_quote_actor(p_actor_id);
  select * into a from public.sales_quote_v2_delivery_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Delivery attempt not found.' using errcode='P0002'; end if;
  if exists(select 1 from public.sales_quote_v2_deliveries d join public.crm_quotes q on q.id=d.crm_quote_id where d.id=a.delivery_id and (q.signed_at is not null or q.status not in ('draft','sent') or exists(select 1 from public.sales_quotes sq where sq.id=d.quote_id and (sq.deleted_at is not null or sq.status='archived')) or exists(select 1 from public.crm_quotes sibling where sibling.quote_group_id=q.quote_group_id and sibling.signed_at is not null))) then raise exception 'This contract has already been accepted or superseded.' using errcode='40001'; end if;
  if a.state not in ('pending','failed') then return jsonb_build_object('claimed',false,'attempt',to_jsonb(a)); end if;
  update public.sales_quote_v2_delivery_attempts set state='sending',claim_token=gen_random_uuid(),claimed_at=now(),completed_at=null,result=null where id=a.id returning * into a;
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
end; $$;

create function public.finish_native_quote_delivery_attempt(p_attempt_id uuid,p_actor_id uuid,p_claim_token uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare a public.sales_quote_v2_delivery_attempts%rowtype; d public.sales_quote_v2_deliveries%rowtype; v_state text; v_via text;
begin
  perform public.require_native_quote_actor(p_actor_id);
  select * into a from public.sales_quote_v2_delivery_attempts where id=p_attempt_id for update;
  if not found or a.claim_token is distinct from p_claim_token then raise exception 'Delivery attempt claim changed.' using errcode='40001'; end if;
  if a.state<>'sending' then
    if a.result is distinct from p_result then raise exception 'Delivery outcome already recorded.' using errcode='40001'; end if;
    return to_jsonb(a);
  end if;
  if jsonb_typeof(p_result->'sent') is distinct from 'boolean' then raise exception 'Invalid provider outcome.' using errcode='22023'; end if;
  v_state:=case when p_result->>'sent'='true' and nullif(p_result->>'providerId','') is not null then 'sent'
    when p_result->>'uncertain'='true' or p_result->>'sent'='true' then 'uncertain' else 'failed' end;
  update public.sales_quote_v2_delivery_attempts set state=v_state,result=p_result,completed_at=now() where id=a.id returning * into a;
  select * into d from public.sales_quote_v2_deliveries where id=a.delivery_id;
  select case when count(distinct channel)=2 then 'both' else min(channel) end into v_via from public.sales_quote_v2_delivery_attempts where delivery_id=d.id and state='sent';
  if v_via is not null then
    update public.sales_quotes set status=case when status='draft' then 'sent' else status end,quote_v2_status='sent',sent_at=coalesce(sent_at,now()),sent_via=v_via where id=d.quote_id or (quote_v2_delivery_id is not null and quote_group_id=(select quote_group_id from public.sales_quotes where id=d.quote_id));
    update public.crm_quotes set status=case when status='draft' then 'sent' else status end,sent_at=coalesce(sent_at,now()),sent_via=v_via where id=d.crm_quote_id or (meta ? 'native_delivery_id' and quote_group_id=(select quote_group_id from public.crm_quotes where id=d.crm_quote_id));
  end if;
  return to_jsonb(a);
end; $$;

create function public.native_quote_delivery_capability(p_quote_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; v_native boolean; d public.sales_quote_v2_deliveries%rowtype; v_state text;
begin
 perform public.require_native_quote_actor(p_actor_id);
 if to_regprocedure('public.accept_native_quote_delivery(uuid,text,text[],numeric,timestamptz,text,text)') is null or to_regprocedure('public.reconcile_native_quote_delivery_attempt(uuid,uuid,text,boolean,text)') is null then return jsonb_build_object('schemaVersion',0,'native',false,'reserved',false,'canSend',false); end if;
 select * into q from public.sales_quotes where id=p_quote_id;
 v_native:=coalesce(q.quote_v2_backend,false) and exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=p_quote_id);
 select dl.* into d from public.sales_quote_v2_deliveries dl join public.sales_quotes sq on sq.id=dl.quote_id
  where (sq.id=q.id or (q.quote_group_id is not null and sq.quote_group_id=q.quote_group_id))
   and exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=dl.id) limit 1;
 select case when bool_or(state in ('sending','uncertain')) then 'uncertain' when bool_and(state='sent') then 'sent' else 'pending' end into v_state
  from public.sales_quote_v2_delivery_attempts where delivery_id=d.id;
 return jsonb_build_object('schemaVersion',1,'native',v_native,'reserved',q.quote_v2_delivery_id is not null,
  'canSend',v_native and q.deleted_at is null and q.signed_at is null and q.status in ('draft','sent') and not exists(select 1 from public.crm_quotes cq where (cq.id=d.crm_quote_id and (cq.signed_at is not null or cq.status='archived')) or (cq.quote_group_id=q.quote_group_id and cq.signed_at is not null))
  and ((q.quote_v2_delivery_id is null and q.quote_v2_status='priced' and not exists(select 1 from public.sales_quotes sibling where sibling.quote_group_id=q.quote_group_id and sibling.deleted_at is null and sibling.status<>'archived' and (not sibling.quote_v2_backend or sibling.status<>'draft' or sibling.quote_v2_status<>'priced' or not exists(select 1 from public.sales_quote_v2_draft_requests nr where nr.quote_id=sibling.id)))) or v_state='pending'),
  'reservation',case when d.id is null then null else jsonb_build_object('requestKey',d.request_key,'revision',q.quote_v2_revision,'request',d.request,'state',v_state) end);
end; $$;

revoke all on function public.require_native_quote_actor(uuid),public.protect_native_quote_delivery(),public.reserve_native_quote_delivery(uuid,uuid,bigint,text,jsonb,jsonb),public.claim_native_quote_delivery_attempt(uuid,uuid),public.finish_native_quote_delivery_attempt(uuid,uuid,uuid,jsonb),public.native_quote_delivery_capability(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_native_quote_delivery(uuid,uuid,bigint,text,jsonb,jsonb),public.claim_native_quote_delivery_attempt(uuid,uuid),public.finish_native_quote_delivery_attempt(uuid,uuid,uuid,jsonb),public.native_quote_delivery_capability(uuid,uuid) to service_role;

create function public.reserve_native_quote_group_delivery(p_quote_id uuid,p_actor_id uuid,p_expected_revision bigint,p_request_key text,p_request jsonb,p_payloads jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare q public.sales_quotes%rowtype; member public.sales_quotes%rowtype; dispatch public.sales_quote_v2_deliveries%rowtype; v_payload jsonb; v_result jsonb; v_active jsonb; v_count integer;
begin
 perform public.require_native_quote_actor(p_actor_id);
 select * into q from public.sales_quotes where id=p_quote_id;
 if not found then raise exception 'Quote not found.' using errcode='P0002'; end if;
 -- Same ordering for send and acceptance avoids group deadlocks.
 if q.quote_group_id is not null then
   perform pg_advisory_xact_lock(hashtextextended(q.quote_group_id::text,8391));
 end if;
 if q.quote_v2_delivery_id is not null then
   v_active:=public.reserve_native_quote_delivery(p_quote_id,p_actor_id,p_expected_revision,p_request_key,p_request,null);
   select d.* into dispatch from public.sales_quote_v2_deliveries d join public.sales_quotes sq on sq.id=d.quote_id
    where (sq.id=q.id or (q.quote_group_id is not null and sq.quote_group_id=q.quote_group_id))
      and exists(select 1 from public.sales_quote_v2_delivery_attempts a where a.delivery_id=d.id) limit 1;
   if not found then raise exception 'Delivery dispatch receipt missing.' using errcode='55000'; end if;
   return to_jsonb(dispatch);
 end if;
 if jsonb_typeof(p_payloads) is distinct from 'array' then raise exception 'Quote group payloads are required.' using errcode='22023'; end if;
 select count(*) into v_count from public.sales_quotes where (id=q.id or (q.quote_group_id is not null and quote_group_id=q.quote_group_id)) and deleted_at is null and status<>'archived';
 if v_count<>jsonb_array_length(p_payloads) or v_count<>(select count(distinct x->>'quoteId') from jsonb_array_elements(p_payloads) x) then
   raise exception 'Quote alternatives changed. Reload the project before sending.' using errcode='40001'; end if;
 perform set_config('quote_v2.native_dispatch_quote',p_quote_id::text,true);
 perform set_config('quote_v2.native_group',coalesce(q.quote_group_id::text,''),true);
 for member in select * from public.sales_quotes where (id=q.id or (q.quote_group_id is not null and quote_group_id=q.quote_group_id)) and deleted_at is null and status<>'archived' order by id for update loop
   select x into v_payload from jsonb_array_elements(p_payloads) x where x->>'quoteId'=member.id::text;
   if v_payload is null or (member.id=q.id and (v_payload->>'revision')::bigint<>p_expected_revision) then
     raise exception 'Quote group revision changed.' using errcode='40001'; end if;
   v_result:=public.reserve_native_quote_delivery(member.id,p_actor_id,(v_payload->>'revision')::bigint,p_request_key,p_request,v_payload->'payload');
   if member.id=q.id then v_active:=v_result; end if;
 end loop;
 perform set_config('quote_v2.native_group','',true);
 perform set_config('quote_v2.native_dispatch_quote','',true);
 return v_active;
end; $$;
revoke all on function public.reserve_native_quote_group_delivery(uuid,uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_native_quote_group_delivery(uuid,uuid,bigint,text,jsonb,jsonb) to service_role;
