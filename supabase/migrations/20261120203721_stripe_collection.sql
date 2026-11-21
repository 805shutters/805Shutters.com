-- Additive Stripe evidence. Square history and its recovery remain untouched.
create table public.crm_stripe_requests (
 id uuid primary key default gen_random_uuid(), account_id text not null, livemode boolean not null,
 quote_id uuid references public.crm_quotes(id), bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id),
 job_id uuid not null references public.crm_jobs(id), installment_id uuid, purpose text not null check(purpose in ('deposit','balance')),
 amount_cents bigint not null check(amount_cents>0), currency text not null default 'usd' check(currency='usd'),
 fingerprint text not null, status text not null default 'creating' check(status in ('creating','open','processing','paid','expired','review')),
 session_id text unique, payment_intent_id text unique, url text, expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), error text,
 check ((quote_id is null) <> (bookkeeping_entry_id is null))
);
create unique index crm_stripe_one_collectible_quote on public.crm_stripe_requests(account_id,livemode,quote_id) where quote_id is not null and status in ('creating','open','processing','review');
create unique index crm_stripe_one_collectible_entry on public.crm_stripe_requests(account_id,livemode,bookkeeping_entry_id) where bookkeeping_entry_id is not null and status in ('creating','open','processing','review');
create table public.crm_card_migration_clearances (
 target_id uuid primary key, reviewed_through timestamptz not null, evidence text not null check(length(evidence)>=8), actor_email text not null, created_at timestamptz not null default now()
);
create table public.crm_stripe_events (
 account_id text not null, livemode boolean not null, id text not null, event_type text not null, object_id text not null,
 received_at timestamptz not null default now(), processed_at timestamptz, error text,
 primary key(account_id,livemode,id)
);
create table public.crm_stripe_objects (
 account_id text not null, livemode boolean not null, kind text not null, id text not null, status text not null,
 currency text not null, amount_cents bigint not null, fee_cents bigint, payment_id text, payout_id text,
 occurred_at timestamptz not null, details jsonb not null default '{}', imported_at timestamptz not null default now(),
 primary key(account_id,livemode,kind,id)
);
create table public.crm_stripe_allocations (
 account_id text not null, payment_intent_id text not null, request_id uuid not null unique references public.crm_stripe_requests(id),
 ledger_payment_id uuid not null unique references public.crm_quote_bookkeeping_payments(id), amount_cents bigint not null,
 created_at timestamptz not null default now(), primary key(account_id,payment_intent_id)
);
create table public.crm_stripe_bank_matches (
 account_id text not null, payout_id text not null, bank_transaction_id text not null unique,
 bank_date date not null, amount_cents bigint not null, evidence text not null, actor_email text not null,
 created_at timestamptz not null default now(), primary key(account_id,payout_id)
);
create table public.crm_stripe_sync (
 account_id text not null, livemode boolean not null, state jsonb not null default '{}', lease_id uuid, lease_until timestamptz,
 last_started_at timestamptz, last_finished_at timestamptz, error text, primary key(account_id,livemode)
);
do $$ declare t text; begin
 foreach t in array array['crm_stripe_requests','crm_card_migration_clearances','crm_stripe_events','crm_stripe_objects','crm_stripe_allocations','crm_stripe_bank_matches','crm_stripe_sync'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

-- This lock is also used by Stripe allocation and matches Square's target row lock.
create function public.stripe_target_balance(p_quote uuid,p_entry uuid,p_job uuid) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_total numeric; v_paid numeric; v_job uuid;
begin
 if (p_quote is null)=(p_entry is null) then raise exception 'One exact ledger is required.'; end if;
 if p_quote is not null then
  select quote_total,job_id into v_total,v_job from crm_quotes where id=p_quote and status not in ('lost','archived') and meta->>'deleted_at' is null and meta->>'bookkeeping_deleted_at' is null for update;
 else
  select e.total_amount,coalesce(e.job_id,q.job_id) into v_total,v_job from crm_quote_bookkeeping_entries e left join crm_quotes q on q.id=e.quote_id where e.id=p_entry and e.source in ('manual','legacy_sheet') and e.meta->>'deleted_at' is null and e.meta->>'bookkeeping_deleted_at' is null and (q.id is null or (q.meta->>'deleted_at' is null and q.meta->>'bookkeeping_deleted_at' is null and (e.job_id is null or e.job_id=q.job_id))) for update of e;
 end if;
 if v_total is null or v_job is distinct from p_job or not exists(select 1 from crm_jobs where id=p_job and meta->>'deleted_at' is null and meta->>'bookkeeping_deleted_at' is null) then raise exception 'Exact active job ledger is required.'; end if;
 select coalesce(sum(amount),0) into v_paid from crm_quote_bookkeeping_payments where (p_quote is not null and quote_id=p_quote) or (p_entry is not null and bookkeeping_entry_id=p_entry and quote_id is null);
 select v_paid+coalesce(sum(case when to_quote_id=p_quote or to_bookkeeping_entry_id=p_entry then amount else -amount end),0) into v_paid from crm_quote_bookkeeping_credits where from_quote_id=p_quote or to_quote_id=p_quote or from_bookkeeping_entry_id=p_entry or to_bookkeeping_entry_id=p_entry;
 return greatest(round((v_total-v_paid)*100),0)::bigint;
end $$;
create function public.reserve_stripe_request(p_account text,p_live boolean,p_quote uuid,p_entry uuid,p_job uuid,p_installment uuid,p_purpose text,p_amount bigint,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_due bigint; r crm_stripe_requests%rowtype;
begin
 if p_account is null or p_account!~'^acct_[A-Za-z0-9]+$' or p_live is null or p_amount is null or p_fingerprint is null or length(p_fingerprint)<>64 then raise exception 'Valid request identity required.'; end if;
 v_due:=stripe_target_balance(p_quote,p_entry,p_job);
 if p_amount<=0 or p_amount>v_due then raise exception 'Amount exceeds current balance.'; end if;
 if exists(select 1 from crm_square_requests s where (s.quote_id=p_quote or s.bookkeeping_entry_id=p_entry) and s.environment='production' and not exists(select 1 from crm_card_migration_clearances c where c.target_id=coalesce(p_quote,p_entry) and c.reviewed_through>=s.created_at)) then raise exception 'Existing Square requests require verified retirement or resolution before Stripe collection.'; end if;
 select * into r from crm_stripe_requests where account_id=p_account and livemode=p_live and (quote_id=p_quote or bookkeeping_entry_id=p_entry) and status in ('creating','open','processing','review') for update;
 if found then
  if r.fingerprint<>p_fingerprint or r.amount_cents<>p_amount or r.purpose<>p_purpose or r.installment_id is distinct from p_installment then raise exception 'Existing card request must be reconciled and expired before replacement.'; end if;
  return to_jsonb(r);
 end if;
 insert into crm_stripe_requests(account_id,livemode,quote_id,bookkeeping_entry_id,job_id,installment_id,purpose,amount_cents,fingerprint)
 values(p_account,p_live,p_quote,p_entry,p_job,p_installment,p_purpose,p_amount,p_fingerprint) returning * into r;
 return to_jsonb(r);
end $$;
create function public.allocate_stripe_payment(p_request uuid,p_intent text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r crm_stripe_requests%rowtype; o crm_stripe_objects%rowtype; v_due bigint; v_id uuid;
begin
 select * into r from crm_stripe_requests where id=p_request;
 if not found then raise exception 'Exact live Stripe request is required.'; end if;
 v_due:=stripe_target_balance(r.quote_id,r.bookkeeping_entry_id,r.job_id);
 select * into r from crm_stripe_requests where id=p_request for update;
 if not found or not r.livemode or r.payment_intent_id is distinct from p_intent then raise exception 'Exact live Stripe request is required.'; end if;
 select ledger_payment_id into v_id from crm_stripe_allocations where account_id=r.account_id and payment_intent_id=p_intent;
 if found then
  if exists(select 1 from crm_stripe_objects where account_id=r.account_id and livemode and kind='payment' and id=p_intent and (coalesce((details->>'refunded_cents')::bigint,0)>0 or coalesce((details->>'disputed')::boolean,false))) then
   update crm_stripe_requests set status='review',error='Refund or dispute after allocation; ledger adjustment requires review.',updated_at=now() where id=r.id;
   return jsonb_build_object('status','review','paymentId',v_id);
  end if;
  update crm_stripe_requests set status='paid',error=null,updated_at=now() where id=r.id;
  return jsonb_build_object('status','duplicate','paymentId',v_id);
 end if;
 select * into o from crm_stripe_objects where account_id=r.account_id and livemode=true and kind='payment' and id=p_intent for update;
 if not found or o.status<>'succeeded' or o.currency<>'usd' or o.amount_cents<>r.amount_cents or o.details->>'request_id' is distinct from r.id::text then raise exception 'Verified exact successful USD payment is required.'; end if;
 v_due:=stripe_target_balance(r.quote_id,r.bookkeeping_entry_id,r.job_id);
 if r.amount_cents>v_due or coalesce((o.details->>'refunded_cents')::bigint,0)>0 or coalesce((o.details->>'disputed')::boolean,false) then
  update crm_stripe_requests set status='review',error='Payment exceeds current balance or has refund/dispute activity; owner review required.',updated_at=now() where id=r.id;
  return jsonb_build_object('status','review');
 end if;
 insert into crm_quote_bookkeeping_payments(quote_id,bookkeeping_entry_id,job_id,payment_label,payment_type,amount,paid_at,source,external_source,external_id,meta)
 values(r.quote_id,r.bookkeeping_entry_id,r.job_id,case when r.purpose='deposit' then 'Stripe deposit' else 'Stripe balance' end,'credit_card',r.amount_cents/100.0,(o.occurred_at at time zone 'America/Los_Angeles')::date,case when r.quote_id is not null then 'crm_quote' else 'manual' end,'stripe',r.account_id||':'||p_intent,jsonb_build_object('stripe_payment_intent_id',p_intent,'stripe_request_id',r.id,'stripe_account_id',r.account_id,'purpose',r.purpose,'in_house_installment_id',r.installment_id)) returning id into v_id;
 insert into crm_stripe_allocations(account_id,payment_intent_id,request_id,ledger_payment_id,amount_cents) values(r.account_id,p_intent,r.id,v_id,r.amount_cents);
 update crm_stripe_requests set status='paid',error=null,updated_at=now() where id=r.id;
 insert into crm_activity_events(actor_email,entity_type,entity_id,action,metadata) values('stripe-reconciliation','bookkeeping_payment',v_id,'stripe.payment_allocated',jsonb_build_object('paymentIntentId',p_intent,'requestId',r.id));
 return jsonb_build_object('status','recorded','paymentId',v_id);
end $$;
create function public.claim_stripe_sync(p_account text,p_live boolean,p_lease uuid) returns boolean
language sql security definer set search_path=public as $$
 with claimed as (insert into crm_stripe_sync(account_id,livemode,lease_id,lease_until,last_started_at) values(p_account,p_live,p_lease,now()+interval '3 minutes',now())
 on conflict(account_id,livemode) do update set lease_id=p_lease,lease_until=now()+interval '3 minutes',last_started_at=now() where crm_stripe_sync.lease_until is null or crm_stripe_sync.lease_until<now() returning 1) select exists(select 1 from claimed);
$$;
revoke all on function public.stripe_target_balance(uuid,uuid,uuid), public.reserve_stripe_request(text,boolean,uuid,uuid,uuid,uuid,text,bigint,text),public.allocate_stripe_payment(uuid,text),public.claim_stripe_sync(text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.stripe_target_balance(uuid,uuid,uuid), public.reserve_stripe_request(text,boolean,uuid,uuid,uuid,uuid,text,bigint,text),public.allocate_stripe_payment(uuid,text),public.claim_stripe_sync(text,boolean,uuid) to service_role;

-- Legacy column names are retained for compatibility; provider disambiguates new links.
alter table public.crm_in_house_plan_links add column provider text not null default 'square' check(provider in ('square','stripe'));

create function public.match_stripe_bank(p_account text,p_payout text,p_transaction text,p_date date,p_amount bigint,p_evidence text,p_actor text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o crm_stripe_objects%rowtype; m crm_stripe_bank_matches%rowtype;
begin
 if p_transaction is null or length(trim(p_transaction))<3 or p_date is null or p_evidence is null or length(trim(p_evidence))<8 or p_actor is null or p_amount is null then raise exception 'Exact bank transaction and evidence required.'; end if;
 select * into o from crm_stripe_objects where account_id=p_account and livemode and kind='payout' and id=p_payout for update;
 if not found or o.status<>'paid' or o.currency<>'usd' or o.amount_cents<>p_amount or p_amount=0 then raise exception 'Match must equal a verified paid USD payout.'; end if;
 select * into m from crm_stripe_bank_matches where account_id=p_account and payout_id=p_payout;
 if found then
  if m.bank_transaction_id<>p_transaction or m.bank_date<>p_date or m.amount_cents<>p_amount then raise exception 'Existing bank evidence differs.'; end if;
  return jsonb_build_object('status','duplicate');
 end if;
 insert into crm_stripe_bank_matches(account_id,payout_id,bank_transaction_id,bank_date,amount_cents,evidence,actor_email)values(p_account,p_payout,p_transaction,p_date,p_amount,p_evidence,p_actor);
 insert into crm_activity_events(actor_email,entity_type,entity_id,action,metadata) values(p_actor,'stripe_payout',gen_random_uuid(),'stripe.bank_matched',jsonb_build_object('account',p_account,'payout',p_payout,'bankTransaction',p_transaction,'evidence',p_evidence));
 return jsonb_build_object('status','matched');
end $$;
revoke all on function public.match_stripe_bank(text,text,text,date,bigint,text,text) from public,anon,authenticated;
grant execute on function public.match_stripe_bank(text,text,text,date,bigint,text,text) to service_role;

create function public.guard_stripe_ledger_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from crm_stripe_allocations where ledger_payment_id=old.id) and
 (tg_op='DELETE' or new.amount is distinct from old.amount or new.quote_id is distinct from old.quote_id or new.job_id is distinct from old.job_id or new.bookkeeping_entry_id is distinct from old.bookkeeping_entry_id or new.external_source is distinct from old.external_source or new.external_id is distinct from old.external_id) then
  raise exception 'Payment reconciled to Stripe; use an explicit reviewed adjustment.';
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger stripe_ledger_payment_guard before update or delete on public.crm_quote_bookkeeping_payments for each row execute function public.guard_stripe_ledger_payment();
revoke all on function public.guard_stripe_ledger_payment() from public,anon,authenticated;

create table public.crm_stripe_alerts (
 id uuid primary key default gen_random_uuid(), account_id text not null, livemode boolean not null default true check(livemode),
 payment_intent_id text not null, request_id uuid not null references crm_stripe_requests(id),
 status text not null default 'queued' check(status in ('queued','sending','accepted','delivered','failed','unknown')),
 body text, provider_sid text unique, provider_status text, error text,
 created_at timestamptz not null default now(), attempted_at timestamptz, delivered_at timestamptz,
 unique(account_id,payment_intent_id)
);
alter table public.crm_stripe_alerts enable row level security;
revoke all on public.crm_stripe_alerts from public,anon,authenticated;
grant all on public.crm_stripe_alerts to service_role;
create function public.queue_stripe_owner_alert() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into crm_stripe_alerts(account_id,payment_intent_id,request_id)values(new.account_id,new.payment_intent_id,new.request_id)on conflict(account_id,payment_intent_id)do nothing;return new;
end $$;
create trigger stripe_owner_alert after insert on public.crm_stripe_allocations for each row execute function public.queue_stripe_owner_alert();
revoke all on function public.queue_stripe_owner_alert() from public,anon,authenticated;
create function public.record_stripe_alert_status(p_id uuid,p_sid text,p_status text,p_error text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if nullif(p_sid,'') is null then return false; end if;
  update crm_stripe_alerts set provider_sid=p_sid,provider_status=p_status,
    status=case when p_status='delivered' then 'delivered' when p_status in ('failed','undelivered') then 'failed' else 'accepted' end,
    delivered_at=case when p_status='delivered' then now() else delivered_at end,error=p_error
  where id=p_id and status in ('sending','accepted','unknown') and (provider_sid is null or provider_sid=p_sid);
  return found;
end $$;
revoke all on function public.record_stripe_alert_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_stripe_alert_status(uuid,text,text,text) to service_role;


-- Owner-supplied evidence must cover every historical request for this exact ledger.
create function public.clear_stripe_migration_target(p_target uuid,p_evidence text,p_actor text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare reviewed timestamptz;
begin
 if p_actor is null or length(trim(coalesce(p_evidence,'')))<20 then raise exception 'Historical obligations review evidence is required.';end if;
 if not exists(select 1 from crm_quotes where id=p_target) and not exists(select 1 from crm_quote_bookkeeping_entries where id=p_target)then raise exception 'Exact ledger not found.';end if;
 select max(created_at)into reviewed from crm_square_requests where environment='production'and(quote_id=p_target or bookkeeping_entry_id=p_target);
 if reviewed is null then raise exception 'No historical Square request to clear.';end if;
 insert into crm_card_migration_clearances(target_id,reviewed_through,evidence,actor_email)values(p_target,reviewed,p_evidence,p_actor)
 on conflict(target_id)do update set reviewed_through=excluded.reviewed_through,evidence=excluded.evidence,actor_email=excluded.actor_email,created_at=now();
 insert into crm_activity_events(actor_email,entity_type,entity_id,action,metadata)values(p_actor,'card_migration',p_target,'stripe.legacy_clearance',jsonb_build_object('evidence',p_evidence,'reviewedThrough',reviewed));
 return jsonb_build_object('status','recorded','reviewedThrough',reviewed);
end $$;
revoke all on function public.clear_stripe_migration_target(uuid,text,text) from public,anon,authenticated;
grant execute on function public.clear_stripe_migration_target(uuid,text,text) to service_role;

-- Preserve mobile send IDs and historical column compatibility with an explicit provider.
alter table public.crm_payment_link_send_requests add column card_provider text not null default 'square' check(card_provider in ('square','stripe'));

create table public.crm_stripe_deliveries (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references crm_stripe_requests(id),channel text not null check(channel in ('email','text')),
 request_key text not null,recipient text not null,fingerprint text not null,status text not null default 'pending' check(status in ('pending','sending','accepted','failed','unknown')),
 result jsonb,created_at timestamptz not null default now(),attempted_at timestamptz,updated_at timestamptz not null default now(),unique(request_id,channel,request_key)
);
alter table public.crm_stripe_deliveries enable row level security;
revoke all on public.crm_stripe_deliveries from public,anon,authenticated;
grant all on public.crm_stripe_deliveries to service_role;
