-- Provider evidence is separate from the existing customer-credit ledger.
-- No historical payment, customer balance, or operational job is changed here.
create table public.crm_square_objects (
  kind text not null check(kind in ('payment','refund','dispute','payout','payout_entry')),
  id text not null,
  environment text not null check(environment in ('production','sandbox')),
  merchant_id text not null,
  location_id text not null,
  status text not null,
  currency text not null,
  amount_cents bigint not null,
  fee_cents bigint,
  payment_id text,
  payout_id text,
  occurred_at timestamptz not null,
  provider_updated_at timestamptz not null,
  details jsonb not null default '{}',
  imported_at timestamptz not null default now(),
  primary key (environment,kind,id)
);
create index crm_square_objects_payment on public.crm_square_objects(environment,payment_id);
create index crm_square_objects_payout on public.crm_square_objects(environment,payout_id);
create table public.crm_square_events (
  environment text not null, id text not null, event_type text not null,
  merchant_id text not null, object_id text not null,
  received_at timestamptz not null default now(), processed_at timestamptz,
  attempts integer not null default 0, error text,
  primary key(environment,id)
);
create index crm_square_events_pending on public.crm_square_events(received_at) where processed_at is null;
create table public.crm_square_sync (
  environment text primary key check(environment in ('production','sandbox')),
  merchant_id text, location_id text,
  history_from timestamptz not null default '2020-01-01T00:00:00Z',
  auto_post_after timestamptz not null default now(),
  state jsonb not null default '{}',
  lease_id uuid, lease_until timestamptz,
  last_started_at timestamptz, last_finished_at timestamptz, error text
);
insert into public.crm_square_sync(environment) values ('production'),('sandbox');
create table public.crm_square_allocations (
  id uuid primary key default gen_random_uuid(), environment text not null,
  square_payment_id text not null,
  ledger_payment_id uuid not null unique references public.crm_quote_bookkeeping_payments(id) on delete restrict,
  amount_cents bigint not null check(amount_cents > 0),
  decision_id uuid not null,
  actor_email text not null, evidence text not null,
  created_at timestamptz not null default now(),
  unique(environment,square_payment_id,decision_id)
);
create table public.crm_square_classifications (
  environment text not null, square_payment_id text not null,
  classification text not null check(classification = 'not_805'),
  actor_email text not null, evidence text not null,
  created_at timestamptz not null default now(),
  primary key(environment,square_payment_id)
);
create table public.crm_square_bank_matches (
  id uuid primary key default gen_random_uuid(), environment text not null, payout_id text not null,
  statement_reference text not null, bank_date date not null, amount_cents bigint not null check(amount_cents <> 0),
  actor_email text not null, created_at timestamptz not null default now(),
  unique(environment,payout_id,statement_reference)
);

-- All access goes through authenticated CRM server routes. Never expose raw finance tables.
do $$ declare t text; begin
  foreach t in array array['crm_square_objects','crm_square_events','crm_square_sync','crm_square_allocations','crm_square_classifications','crm_square_bank_matches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create function public.claim_square_sync(p_environment text, p_lease uuid) returns boolean
language sql security definer set search_path=public as $$
  with claimed as (
    update crm_square_sync set lease_id=p_lease,lease_until=now()+interval '3 minutes',last_started_at=now()
    where environment=p_environment and (lease_until is null or lease_until<now()) returning 1
  ) select exists(select 1 from claimed);
$$;

-- A review decision and its customer credit are one transaction. The provider row
-- lock serializes split allocations; decision IDs make retries harmless.
create function public.allocate_square_payment(
  p_environment text,p_payment_id text,p_decision_id uuid,p_amount_cents bigint,
  p_quote_id uuid,p_entry_id uuid,p_existing_payment_id uuid,p_actor text,p_evidence text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_payment crm_square_objects%rowtype;
  v_existing crm_quote_bookkeeping_payments%rowtype;
  v_quote crm_quotes%rowtype;
  v_entry crm_quote_bookkeeping_entries%rowtype;
  v_ledger uuid; v_job uuid; v_used bigint; v_source text; v_total numeric; v_paid numeric;
begin
  if p_environment<>'production' then raise exception 'Sandbox payments cannot change the live CRM.'; end if;
  if p_actor is null or p_evidence is null or length(btrim(p_evidence))<8 or p_amount_cents is null or p_amount_cents<=0 then
    raise exception 'A positive amount, actor, and matching evidence are required.';
  end if;
  select * into v_payment from crm_square_objects where environment=p_environment and kind='payment' and id=p_payment_id for update;
  if not found or v_payment.status<>'COMPLETED' or v_payment.currency<>'USD' then raise exception 'A verified completed USD payment is required.'; end if;
  if exists(select 1 from crm_square_classifications where environment=p_environment and square_payment_id=p_payment_id) then raise exception 'Payment is classified outside 805.'; end if;
  select ledger_payment_id into v_ledger from crm_square_allocations where environment=p_environment and square_payment_id=p_payment_id and decision_id=p_decision_id;
  if found then
    if not exists(select 1 from crm_quote_bookkeeping_payments where id=v_ledger and amount=p_amount_cents/100.0 and ((p_quote_id is not null and quote_id=p_quote_id) or (p_entry_id is not null and quote_id is null and bookkeeping_entry_id=p_entry_id))) then
      raise exception 'Retry differs from the original allocation.';
    end if;
    return jsonb_build_object('status','duplicate','paymentId',v_ledger);
  end if;
  select coalesce(sum(amount_cents),0) into v_used from crm_square_allocations where environment=p_environment and square_payment_id=p_payment_id;
  -- Legacy canonical credits must be linked before any additional credit can be added.
  if exists(select 1 from crm_quote_bookkeeping_payments b where
    ((b.external_source='square' and b.external_id=p_payment_id) or b.meta->>'square_payment_id'=p_payment_id)
    and not exists(select 1 from crm_square_allocations a where a.ledger_payment_id=b.id)
    and b.id is distinct from p_existing_payment_id) then raise exception 'Link existing Square credits before adding money.'; end if;
  if v_used+p_amount_cents>v_payment.amount_cents then raise exception 'Allocations exceed the gross Square payment.'; end if;
  if (p_quote_id is null)=(p_entry_id is null) then raise exception 'Choose exactly one quote or standalone ledger.'; end if;
  if p_quote_id is not null then
    select * into v_quote from crm_quotes where id=p_quote_id for update;
    if not found or v_quote.status in ('archived','lost') or v_quote.meta->>'deleted_at' is not null or v_quote.meta->>'bookkeeping_deleted_at' is not null then raise exception 'Quote is unavailable for payment allocation.'; end if;
    v_job:=v_quote.job_id; v_source:='crm_quote'; v_total:=v_quote.quote_total;
  else
    select * into v_entry from crm_quote_bookkeeping_entries where id=p_entry_id for update;
    if not found or v_entry.source not in ('manual','legacy_sheet') or v_entry.meta->>'deleted_at' is not null or v_entry.meta->>'bookkeeping_deleted_at' is not null then raise exception 'Standalone ledger is unavailable.'; end if;
    v_job:=v_entry.job_id; v_source:='manual'; v_total:=v_entry.total_amount;
  end if;
  if v_job is not null and not exists(select 1 from crm_jobs where id=v_job and meta->>'deleted_at' is null and meta->>'bookkeeping_deleted_at' is null) then raise exception 'Linked job is unavailable.'; end if;
  if p_existing_payment_id is not null then
    select * into v_existing from crm_quote_bookkeeping_payments where id=p_existing_payment_id for update;
    if not found or v_existing.amount<>p_amount_cents/100.0
      or (p_quote_id is not null and v_existing.quote_id is distinct from p_quote_id)
      or (p_entry_id is not null and (v_existing.bookkeeping_entry_id is distinct from p_entry_id or v_existing.quote_id is not null)) then raise exception 'Existing payment amount or target differs. No new credit was created.'; end if;
    if (v_existing.external_source='square' and v_existing.external_id<>p_payment_id)
       or (v_existing.meta->>'square_payment_id' is not null and v_existing.meta->>'square_payment_id'<>p_payment_id) then raise exception 'Existing credit belongs to another Square payment.'; end if;
    v_ledger:=v_existing.id;
  else
    -- New allocations stop at the actual remaining ledger balance. Excess stays
    -- unallocated in Square for owner review, rather than silently overcrediting.
    select coalesce(sum(amount),0) into v_paid from crm_quote_bookkeeping_payments
      where (p_quote_id is not null and quote_id=p_quote_id) or (p_entry_id is not null and bookkeeping_entry_id=p_entry_id and quote_id is null);
    select v_paid + coalesce(sum(case when (p_quote_id is not null and to_quote_id=p_quote_id) or (p_entry_id is not null and to_bookkeeping_entry_id=p_entry_id) then amount else -amount end),0) into v_paid
      from crm_quote_bookkeeping_credits where (p_quote_id is not null and (to_quote_id=p_quote_id or from_quote_id=p_quote_id)) or (p_entry_id is not null and (to_bookkeeping_entry_id=p_entry_id or from_bookkeeping_entry_id=p_entry_id));
    if coalesce(v_total,0)-v_paid < p_amount_cents/100.0 then raise exception 'Amount exceeds the remaining job balance; retain excess for review.'; end if;
    -- A refund needs review of the original existing ledger, not a new gross posting.
    if coalesce((v_payment.details->>'refunded_cents')::bigint,0)>0 then raise exception 'Refunded payment requires linking its original credit for review.'; end if;
    if p_environment<>'production' then raise exception 'Sandbox payments cannot credit the live CRM.'; end if;
    insert into crm_quote_bookkeeping_payments(quote_id,job_id,bookkeeping_entry_id,payment_label,payment_type,amount,paid_at,source,external_source,external_id,meta)
    values(p_quote_id,v_job,p_entry_id,'Square payment','credit_card',p_amount_cents/100.0,(v_payment.occurred_at at time zone 'America/Los_Angeles')::date,v_source,
      case when v_used=0 then 'square' else 'square_split' end,
      case when v_used=0 then p_payment_id else p_payment_id||':'||p_decision_id::text end,
      jsonb_build_object('square_payment_id',p_payment_id,'square_finance_decision_id',p_decision_id,'square_environment',p_environment,'reviewed_by',p_actor)) returning id into v_ledger;
  end if;
  insert into crm_square_allocations(environment,square_payment_id,ledger_payment_id,amount_cents,decision_id,actor_email,evidence)
    values(p_environment,p_payment_id,v_ledger,p_amount_cents,p_decision_id,p_actor,p_evidence);
  -- Keep the original source, date and amount when linking historical evidence.
  update crm_quote_bookkeeping_payments set meta=coalesce(meta,'{}')||jsonb_build_object('square_payment_id',p_payment_id,'square_environment',p_environment) where id=v_ledger;
  insert into crm_activity_events(actor_email,entity_type,entity_id,action,after_data,metadata)
    values(p_actor,'bookkeeping_payment',v_ledger,'square_finance.allocated',jsonb_build_object('amountCents',p_amount_cents,'quoteId',p_quote_id,'entryId',p_entry_id),jsonb_build_object('squarePaymentId',p_payment_id,'decisionId',p_decision_id,'evidence',p_evidence,'linkedExisting',p_existing_payment_id is not null));
  return jsonb_build_object('status',case when p_existing_payment_id is null then 'recorded' else 'linked' end,'paymentId',v_ledger);
end $$;

create function public.classify_square_payment(p_environment text,p_payment_id text,p_actor text,p_evidence text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from crm_square_objects where environment=p_environment and kind='payment' and id=p_payment_id for update;
  if not found or p_actor is null or length(btrim(p_evidence))<8 then raise exception 'Payment and classification evidence are required.'; end if;
  if exists(select 1 from crm_square_allocations where environment=p_environment and square_payment_id=p_payment_id)
     or exists(select 1 from crm_quote_bookkeeping_payments where (external_source='square' and external_id=p_payment_id) or meta->>'square_payment_id'=p_payment_id) then raise exception 'An allocated payment cannot be excluded.'; end if;
  insert into crm_square_classifications values(p_environment,p_payment_id,'not_805',p_actor,p_evidence,now());
end $$;

create function public.match_square_bank(p_environment text,p_payout_id text,p_reference text,p_date date,p_amount_cents bigint,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_payout crm_square_objects%rowtype; v_matched bigint;
begin
  select * into v_payout from crm_square_objects where environment=p_environment and kind='payout' and id=p_payout_id for update;
  if not found or v_payout.status<>'PAID' or v_payout.currency<>'USD' or p_actor is null or p_date is null or length(btrim(p_reference))<8 then raise exception 'A paid USD payout and bank statement evidence are required.'; end if;
  if exists(select 1 from crm_square_bank_matches where environment=p_environment and payout_id=p_payout_id and statement_reference=p_reference and amount_cents=p_amount_cents and bank_date=p_date) then return; end if;
  select coalesce(sum(amount_cents),0) into v_matched from crm_square_bank_matches where environment=p_environment and payout_id=p_payout_id;
  if p_amount_cents is null or p_amount_cents=0 or sign(p_amount_cents)<>sign(v_payout.amount_cents) or abs(v_matched+p_amount_cents)>abs(v_payout.amount_cents) then raise exception 'Bank matches exceed or disagree with the payout.'; end if;
  insert into crm_square_bank_matches(environment,payout_id,statement_reference,bank_date,amount_cents,actor_email) values(p_environment,p_payout_id,p_reference,p_date,p_amount_cents,p_actor);
end $$;

revoke all on function public.claim_square_sync(text,uuid), public.allocate_square_payment(text,text,uuid,bigint,uuid,uuid,uuid,text,text), public.classify_square_payment(text,text,text,text), public.match_square_bank(text,text,text,date,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_square_sync(text,uuid), public.allocate_square_payment(text,text,uuid,bigint,uuid,uuid,uuid,text,text), public.classify_square_payment(text,text,text,text), public.match_square_bank(text,text,text,date,bigint,text) to service_role;

-- Mike explicitly requested one payment text to this business number.
create table public.crm_square_alerts (
  id uuid primary key default gen_random_uuid(), environment text not null,
  square_payment_id text not null, recipient text not null default '+18052985555' check(recipient='+18052985555'),
  status text not null default 'queued' check(status in ('queued','sending','accepted','delivered','failed','unknown')),
  body text, provider_sid text unique, provider_status text, error text,
  created_at timestamptz not null default now(), attempted_at timestamptz, delivered_at timestamptz,
  unique(environment,square_payment_id)
);
alter table public.crm_square_alerts enable row level security;
revoke all on public.crm_square_alerts from anon,authenticated;
grant all on public.crm_square_alerts to service_role;
create function public.queue_square_owner_alert() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.environment='production' and new.kind='payment' and new.status='COMPLETED' and new.currency='USD' and new.amount_cents>0
    and new.occurred_at >= (select auto_post_after from crm_square_sync where environment='production') then
    insert into crm_square_alerts(environment,square_payment_id) values(new.environment,new.id) on conflict(environment,square_payment_id) do nothing;
  end if;
  return new;
end $$;
create trigger crm_square_owner_alert after insert or update on public.crm_square_objects for each row execute function public.queue_square_owner_alert();
revoke all on function public.queue_square_owner_alert() from public,anon,authenticated;

create function public.record_square_alert_status(p_id uuid,p_sid text,p_status text,p_error text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if nullif(p_sid,'') is null then return false; end if;
  update crm_square_alerts set provider_sid=p_sid,provider_status=p_status,
    status=case when p_status='delivered' then 'delivered' when p_status in ('failed','undelivered') then 'failed' else 'accepted' end,
    delivered_at=case when p_status='delivered' then now() else delivered_at end,error=p_error
  where id=p_id and status in ('sending','accepted','unknown') and (provider_sid is null or provider_sid=p_sid);
  return found;
end $$;
revoke all on function public.record_square_alert_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_square_alert_status(uuid,text,text,text) to service_role;

-- Do not allow an ordinary ledger edit to invalidate a reconciled allocation.
create function public.protect_square_allocated_credit() returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from crm_square_allocations where ledger_payment_id=old.id)
     and (new.amount is distinct from old.amount or new.quote_id is distinct from old.quote_id or new.bookkeeping_entry_id is distinct from old.bookkeeping_entry_id or new.job_id is distinct from old.job_id or new.external_source is distinct from old.external_source or new.external_id is distinct from old.external_id) then
    raise exception 'This credit is reconciled to Square. Review the Square allocation before changing its financial identity.';
  end if;
  return new;
end $$;
create trigger crm_square_protect_allocated_credit before update on public.crm_quote_bookkeeping_payments for each row execute function public.protect_square_allocated_credit();

create table public.crm_square_requests (
  environment text not null, id text not null, order_id text,
  quote_id uuid references public.crm_quotes(id) on delete restrict,
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete restrict,
  amount_cents bigint not null check(amount_cents>0), payment_type text not null,
  url text not null, created_at timestamptz not null default now(),
  check((quote_id is null) <> (bookkeeping_entry_id is null)),
  primary key(environment,id)
);
alter table public.crm_square_requests enable row level security;
revoke all on public.crm_square_requests from anon,authenticated;
grant all on public.crm_square_requests to service_role;
