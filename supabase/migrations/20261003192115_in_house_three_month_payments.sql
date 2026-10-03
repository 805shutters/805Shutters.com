-- Service-only payment schedules; staff access is authorized by the CRM API.
create table public.crm_in_house_plans (
  id uuid primary key,
  quote_id uuid references public.crm_quotes(id),
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id),
  status text not null check (status in ('waiting_deposit','active','paused','review','completed','cancelled')),
  principal_cents bigint not null check (principal_cents >= 3),
  baseline jsonb not null,
  current jsonb not null,
  anchor_date date,
  review_reason text,
  processing_error text,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  check (num_nonnulls(quote_id,bookkeeping_entry_id) = 1)
);
create unique index crm_in_house_plans_quote_open on public.crm_in_house_plans(quote_id);
create unique index crm_in_house_plans_entry_open on public.crm_in_house_plans(bookkeeping_entry_id);
create table public.crm_in_house_plan_installments (
  id uuid primary key,
  plan_id uuid not null references public.crm_in_house_plans(id),
  number smallint not null check (number between 1 and 3),
  amount_cents bigint not null check (amount_cents > 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0 and paid_cents <= amount_cents),
  due_date date,
  paid_at date,
  payment_method text,
  unique(plan_id,number)
);
create table public.crm_in_house_plan_allocations (
  plan_id uuid not null references public.crm_in_house_plans(id),
  payment_id uuid not null references public.crm_quote_bookkeeping_payments(id) on delete cascade,
  installment_id uuid not null references public.crm_in_house_plan_installments(id),
  amount_cents bigint not null check (amount_cents > 0),
  primary key(plan_id,payment_id,installment_id)
);
create table public.crm_in_house_plan_links (
  id uuid primary key,
  plan_id uuid not null references public.crm_in_house_plans(id),
  installment_id uuid not null references public.crm_in_house_plan_installments(id),
  amount_cents bigint not null check (amount_cents > 0),
  square_link_id text unique,
  square_order_id text unique,
  url text,
  status text not null default 'creating' check(status in ('creating','active','retiring','retired','paid')),
  created_at timestamptz not null default now()
);
create unique index crm_in_house_plan_one_link on public.crm_in_house_plan_links(installment_id) where status in ('creating','active','retiring');
create table public.crm_in_house_plan_notifications (
  id uuid primary key,
  plan_id uuid not null references public.crm_in_house_plans(id),
  event_key text not null,
  channel text not null check(channel in ('email','sms','owner')),
  recipient text,
  status text not null default 'pending' check(status in ('pending','sending','accepted','delivered','failed','unknown','skipped')),
  provider_id text,
  error text,
  attempts integer not null default 0,
  retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,event_key,channel)
);
create index crm_in_house_plan_notifications_provider on public.crm_in_house_plan_notifications(provider_id);
create table public.crm_in_house_plan_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.crm_in_house_plans(id),
  action text not null,
  actor text not null,
  detail text,
  created_at timestamptz not null default now()
);
-- Index every referencing column used in reconciliation and deletion checks.
create index crm_in_house_plans_quote_fk on public.crm_in_house_plans(quote_id);
create index crm_in_house_plans_entry_fk on public.crm_in_house_plans(bookkeeping_entry_id);
create index crm_in_house_plan_allocations_payment_fk on public.crm_in_house_plan_allocations(payment_id);
create index crm_in_house_plan_allocations_installment_fk on public.crm_in_house_plan_allocations(installment_id);
create index crm_in_house_plan_links_plan_fk on public.crm_in_house_plan_links(plan_id);
create index crm_in_house_plan_links_installment_fk on public.crm_in_house_plan_links(installment_id);
create index crm_in_house_plan_events_plan_fk on public.crm_in_house_plan_events(plan_id,created_at);
-- Explicit grants avoid relying on project-specific default privileges.
alter table public.crm_in_house_plans enable row level security;
alter table public.crm_in_house_plan_installments enable row level security;
alter table public.crm_in_house_plan_allocations enable row level security;
alter table public.crm_in_house_plan_links enable row level security;
alter table public.crm_in_house_plan_notifications enable row level security;
alter table public.crm_in_house_plan_events enable row level security;
revoke all on public.crm_in_house_plans, public.crm_in_house_plan_installments, public.crm_in_house_plan_allocations, public.crm_in_house_plan_links, public.crm_in_house_plan_notifications, public.crm_in_house_plan_events from public, anon, authenticated;
grant all on public.crm_in_house_plans, public.crm_in_house_plan_installments, public.crm_in_house_plan_allocations, public.crm_in_house_plan_links, public.crm_in_house_plan_notifications, public.crm_in_house_plan_events to service_role;

create function public.crm_claim_in_house_plan(p_id uuid,p_token uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with claimed as (update public.crm_in_house_plans set lease_token=p_token,lease_until=now()+interval '5 minutes'
    where id=p_id and (lease_until is null or lease_until < now()) returning id)
  select exists(select 1 from claimed);
$$;
create function public.crm_save_in_house_plan(p_id uuid,p_token uuid,p_state jsonb,p_action text default null,p_actor text default 'payment-plan-processor')
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.crm_in_house_plans where id=p_id and lease_token=p_token and lease_until>now() for update;
  if not found then raise exception 'Payment plan lease expired'; end if;
  update public.crm_in_house_plans set status=p_state->>'status',current=p_state->'current',
    anchor_date=(p_state->>'anchor_date')::date,review_reason=p_state->>'review_reason',updated_at=now() where id=p_id;
  update public.crm_in_house_plan_installments i set paid_cents=x.paid_cents,due_date=x.due_date,paid_at=x.paid_at,payment_method=x.payment_method
    from jsonb_to_recordset(p_state->'installments') as x(id uuid,paid_cents bigint,due_date date,paid_at date,payment_method text)
    where i.id=x.id and i.plan_id=p_id;
  delete from public.crm_in_house_plan_allocations where plan_id=p_id;
  insert into public.crm_in_house_plan_allocations(plan_id,payment_id,installment_id,amount_cents)
    select p_id,x.payment_id,x.installment_id,x.amount_cents
    from jsonb_to_recordset(p_state->'allocations') as x(payment_id uuid,installment_id uuid,amount_cents bigint);
  if p_action is not null then
    insert into public.crm_in_house_plan_events(plan_id,action,actor,detail) values(p_id,p_action,p_actor,p_state->>'review_reason');
  end if;
end $$;

-- Adapt the existing money helpers without altering standard/legacy schedules.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.quote_customer_adjustments(text)'::regprocedure) into definition;
  if position($anchor$'totalOverride',null,'balanceDueOverride',null,'balanceAdjustmentNote',null);$anchor$ in definition)=0 then
    raise exception 'Unexpected quote adjustment helper; review before migration'; end if;
  definition:=replace(definition,$old$'totalOverride',null,'balanceDueOverride',null,'balanceAdjustmentNote',null);$old$,$new$'totalOverride',null,'balanceDueOverride',null,'balanceAdjustmentNote',null)
    || case when v_controls->>'paymentSchedule'='in_house_three_month_v1' then jsonb_build_object('paymentSchedule','in_house_three_month_v1') else '{}'::jsonb end;$new$);
  execute definition;
  select pg_get_functiondef('public.native_quote_money(numeric,numeric,jsonb,numeric)'::regprocedure) into definition;
  if position('deposit:=round(total*case' in definition)=0 then raise exception 'Unexpected native money helper'; end if;
  definition:=replace(definition,$old$ return jsonb_build_object('subtotal'$old$,$new$ if a->>'paymentSchedule'='in_house_three_month_v1' then deposit:=floor(round(total*100)/3)/100; balance:=round(total-deposit,2);end if;
 return jsonb_build_object('subtotal'$new$);
  execute definition;
  select pg_get_functiondef('public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure) into definition;
  if position('v_deposit_required := round(v_retail_total*' in definition)=0 or position('  if public.quote_v2_customer_json_has_protected_key(v_safe_payload)' in definition)=0 then raise exception 'Unexpected native snapshot helper'; end if;
  definition:=replace(definition,$old$v_deposit_required := round(v_retail_total*(v_adjustments->>'depositPercent')::numeric/100,2);$old$,$new$v_deposit_required := case when v_adjustments->>'paymentSchedule'='in_house_three_month_v1' then floor(round(v_retail_total*100)/3)/100 else round(v_retail_total*(v_adjustments->>'depositPercent')::numeric/100,2) end;$new$);
  definition:=replace(definition,$old$  if public.quote_v2_customer_json_has_protected_key(v_safe_payload)$old$,$new$  if v_adjustments->>'paymentSchedule'='in_house_three_month_v1' then
    v_safe_payload:=v_safe_payload||jsonb_build_object('paymentSchedule','in_house_three_month_v1');
  end if;
  if public.quote_v2_customer_json_has_protected_key(v_safe_payload)$new$);
  execute definition;
end $migration$;

-- Create the exact accepted schedule in the same transaction as native acceptance.
create function public.ensure_in_house_plan_for_acceptance(qid uuid) returns void language plpgsql security invoker set search_path='' as $$
declare q public.crm_quotes%rowtype; pid uuid:=gen_random_uuid(); total bigint; third bigint; snapshot jsonb; day date;
begin
  select * into q from public.crm_quotes where id=qid for update;
  if q.meta#>>'{adjustments,paymentSchedule}' is distinct from 'in_house_three_month_v1' or q.signed_at is null then return; end if;
  if not exists(select 1 from public.sales_quote_v2_acceptances where crm_quote_id=q.id) then return;end if;
  if q.signed_at is null or q.job_id is null or q.meta->>'native_delivery_id' is null then raise exception 'Accepted native quote identity is required'; end if;
  total:=round(q.quote_total*100); third:=total/3;
  if total<3 then raise exception 'Three-month plans require at least three cents'; end if;
  day:=(q.signed_at at time zone 'America/Los_Angeles')::date;
  snapshot:=jsonb_build_object('target',jsonb_build_object('quoteId',q.id,'bookkeepingEntryId',null),'jobId',q.job_id,
    'customerName',q.customer_name,'quoteNumber',q.quote_number,'email',q.customer_email,'phone',q.customer_phone,
    'acceptedDate',day,'totalCents',total,'depositCents',third,'depositOutstandingCents',third,
    'outstandingCents',total,'paidCents',0,'creditFingerprint','[]','payments','[]'::jsonb);
  insert into public.crm_in_house_plans(id,quote_id,status,principal_cents,baseline,current,approved_by)
    values(pid,q.id,'waiting_deposit',total,snapshot,snapshot,'signed-contract') on conflict do nothing;
  if not found then return; end if;
  insert into public.crm_in_house_plan_installments(id,plan_id,number,amount_cents,paid_cents,due_date)
    select gen_random_uuid(),pid,n,case when n=3 then total-2*third else third end,0,case when n=1 then day else null end from generate_series(1,3) n;
  insert into public.crm_in_house_plan_events(plan_id,action,actor) values(pid,'accepted','signed-contract');
  return;
end $$;
revoke all on function public.ensure_in_house_plan_for_acceptance(uuid) from public,anon,authenticated;
grant execute on function public.ensure_in_house_plan_for_acceptance(uuid) to service_role;
create function public.create_in_house_plan_on_acceptance() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform public.ensure_in_house_plan_for_acceptance(new.crm_quote_id);return new;end $$;
revoke all on function public.create_in_house_plan_on_acceptance() from public,anon,authenticated;
grant execute on function public.create_in_house_plan_on_acceptance() to service_role;
create function public.create_in_house_plan_on_signature() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.signed_at is not null and old.signed_at is null then perform public.ensure_in_house_plan_for_acceptance(new.id);end if;return new;end $$;
create trigger in_house_signature after update of signed_at on public.crm_quotes for each row execute function public.create_in_house_plan_on_signature();
revoke all on function public.create_in_house_plan_on_signature() from public,anon,authenticated;
grant execute on function public.create_in_house_plan_on_signature() to service_role;
create trigger create_in_house_plan_on_acceptance after insert on public.sales_quote_v2_acceptances for each row execute function public.create_in_house_plan_on_acceptance();

-- New plans are created only by native acceptance, never by the older enrollment API.

-- Reuse the existing saved-price copy action deployed with the structural revision repair.
do $$begin
 if position('''manual-price'',''copy''' in pg_get_functiondef('public.create_sales_quote_revision(uuid,uuid,uuid,bigint,text,uuid,text,numeric)'::regprocedure))=0 then raise exception 'Saved-price copy support must be deployed before payment terms';end if;
end $$;

create table public.crm_in_house_schedule_requests(
 id uuid primary key, actor_id uuid not null, source_id uuid not null, schedule text not null,
 expected_revision bigint not null, quote_id uuid not null, created_at timestamptz not null default now()
);
alter table public.crm_in_house_schedule_requests enable row level security;
revoke all on public.crm_in_house_schedule_requests from public,anon,authenticated;
grant all on public.crm_in_house_schedule_requests to service_role;
create or replace function public.save_in_house_quote_schedule(p_id uuid,p_revision bigint,p_schedule text,p_actor uuid,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare q public.sales_quotes%rowtype; saved public.crm_in_house_schedule_requests%rowtype; line_id uuid; result jsonb; notes jsonb;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.crm_profiles where id=p_actor and active=true and lower(email) in ('805shutters@gmail.com','jessica@805shutters.com')) then raise exception 'Authorized CRM staff required' using errcode='42501';end if;
 if p_schedule not in ('standard','in_house_three_month_v1') or p_schedule is null or p_request is null then raise exception 'Valid schedule and request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('in-house-terms:'||p_request::text,0));
 select * into saved from public.crm_in_house_schedule_requests where id=p_request;
 if found then
  if saved.actor_id<>p_actor or saved.source_id<>p_id or saved.schedule<>p_schedule or saved.expected_revision<>p_revision then raise exception 'Request ID already used';end if;
  return saved.quote_id;
 end if;
 select * into q from public.sales_quotes where id=p_id and account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb' for update;
 if not found or not q.quote_v2_backend or q.quote_v2_revision<>p_revision then raise exception 'Quote changed. Reload before saving.';end if;
 if q.signed_at is not null or nullif(q.customer_signature,'') is not null or q.status in ('sold','ordered','received','installed','paid') then raise exception 'Signed terms are immutable. Create a separate reviewed agreement.';end if;
 if q.status<>'draft' or q.sent_at is not null or q.quote_v2_status='sent' then
  select id into line_id from public.sales_quote_line_items where quote_id=q.id and archived_at is null order by sort_order,id limit 1;
  result:=public.create_sales_quote_revision(q.id,p_actor,p_request,p_revision,'copy',line_id,null,null);
  select * into q from public.sales_quotes where id=(result->>'quoteId')::uuid;
 end if;
 if p_schedule='in_house_three_month_v1' and not exists(select 1 from public.sales_quote_v2_draft_requests where quote_id=q.id) then raise exception 'In-house terms require a native V2 draft. Create a new V2 quote before sending these terms.';end if;
 begin notes:=coalesce(nullif(q.installer_notes,''),'{}')::jsonb; exception when others then notes:=jsonb_build_object('__quoteBuilderNote',q.installer_notes);end;
 if jsonb_typeof(notes)<>'object' then notes:=jsonb_build_object('__quoteBuilderNote',q.installer_notes);end if;
 notes:=notes||jsonb_build_object('__adminControls',coalesce(notes->'__adminControls','{}')||jsonb_build_object('paymentSchedule',p_schedule));
 update public.sales_quotes set installer_notes=notes::text,quote_v2_revision=quote_v2_revision+1 where id=q.id;
 insert into public.crm_in_house_schedule_requests values(p_request,p_actor,p_id,p_schedule,p_revision,q.id,now());
 return q.id;
end $$;
revoke all on function public.save_in_house_quote_schedule(uuid,bigint,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_in_house_quote_schedule(uuid,bigint,text,uuid,uuid) to service_role;

-- Hold collection immediately when previously agreed evidence changes. Inserts are
-- still posted once by the authoritative ledger; the worker only allocates receipts.
create function public.hold_in_house_plan_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare qid uuid; reason text; pid uuid; payload jsonb;
begin
 if tg_table_name='crm_quotes' then
  if new.quote_total is not distinct from old.quote_total and new.meta->'adjustments' is not distinct from old.meta->'adjustments' then return new;end if;
  qid:=old.id;reason:='The agreed quote total or terms changed. Staff review required.';
 elsif tg_table_name='crm_quote_bookkeeping_payments' then
  if tg_op='UPDATE' and new.amount is not distinct from old.amount and new.paid_at is not distinct from old.paid_at and new.quote_id is not distinct from old.quote_id and new.bookkeeping_entry_id is not distinct from old.bookkeeping_entry_id and new.payment_label is not distinct from old.payment_label and new.meta->>'in_house_installment_id' is not distinct from old.meta->>'in_house_installment_id' then return new;end if;
  qid:=old.quote_id;reason:='A receipt was removed or changed. Staff review required.';
 elsif tg_table_name='crm_quote_bookkeeping_credits' then
  payload:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  for pid in select id from public.crm_in_house_plans where quote_id in(nullif(payload->>'to_quote_id','')::uuid,nullif(payload->>'from_quote_id','')::uuid,case when tg_op='UPDATE' then old.to_quote_id end,case when tg_op='UPDATE' then old.from_quote_id end) and status not in ('cancelled','review') loop
   update public.crm_in_house_plans set status='review',review_reason='A credit changed the agreed balance. Staff review required.',lease_token=null,lease_until=null,updated_at=now() where id=pid;
   insert into public.crm_in_house_plan_events(plan_id,action,actor,detail)values(pid,'evidence_review','ledger','Credit evidence changed');
  end loop;
  return case when tg_op='DELETE' then old else new end;
 end if;
 for pid in select id from public.crm_in_house_plans where quote_id=qid and status not in ('cancelled','review') loop
  update public.crm_in_house_plans set status='review',review_reason=reason,lease_token=null,lease_until=null,updated_at=now() where id=pid;
  insert into public.crm_in_house_plan_events(plan_id,action,actor,detail)values(pid,'evidence_review','ledger',reason);
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger in_house_receipt_changed after update or delete on public.crm_quote_bookkeeping_payments for each row execute function public.hold_in_house_plan_evidence();
create trigger in_house_total_changed after update on public.crm_quotes for each row execute function public.hold_in_house_plan_evidence();
create trigger in_house_credit_changed after insert or update or delete on public.crm_quote_bookkeeping_credits for each row execute function public.hold_in_house_plan_evidence();
revoke all on function public.hold_in_house_plan_evidence() from public,anon,authenticated;
grant execute on function public.hold_in_house_plan_evidence() to service_role;

create function public.hold_in_house_square_refund() returns trigger language plpgsql security definer set search_path='' as $$
declare payment text; pid uuid;
begin
 if new.environment<>'production' then return new;end if;
 if new.kind='payment' and coalesce((new.details->>'refunded_cents')::bigint,0)>0 then payment:=new.id;
 elsif new.kind='refund' and new.status in ('COMPLETED','PENDING') then payment:=new.payment_id;
 else return new;end if;
 for pid in select distinct p.id from public.crm_in_house_plans p join public.crm_quote_bookkeeping_payments r on r.quote_id=p.quote_id
  where p.status not in ('review','cancelled') and (r.meta->>'square_payment_id'=payment or (r.external_source='square' and r.external_id=payment)) loop
  update public.crm_in_house_plans set status='review',review_reason='Square reported a refund. Reconcile the ledger before resuming collection.',lease_token=null,lease_until=null,updated_at=now() where id=pid;
  insert into public.crm_in_house_plan_events(plan_id,action,actor,detail)values(pid,'refund_review','square-finance',payment);
 end loop;
 return new;
end $$;
create trigger in_house_square_refund after insert or update on public.crm_square_objects for each row execute function public.hold_in_house_square_refund();
revoke all on function public.hold_in_house_square_refund() from public,anon,authenticated;
grant execute on function public.hold_in_house_square_refund() to service_role;

revoke all on function public.crm_claim_in_house_plan(uuid,uuid),public.crm_save_in_house_plan(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.crm_claim_in_house_plan(uuid,uuid),public.crm_save_in_house_plan(uuid,uuid,jsonb,text,text) to service_role;
