-- One Ken entitlement per contract, with durable aliases for every source record.
-- Source receipts and historical payments are never rewritten by this migration.
create table public.crm_ken_payoff_obligations (
  canonical_key text primary key,
  entitlement numeric(14,2) not null check (entitlement >= 0),
  blocked_reason text,
  created_at timestamptz not null default now()
);
create table public.crm_ken_payoff_aliases (
  alias_key text primary key,
  canonical_key text not null references public.crm_ken_payoff_obligations(canonical_key),
  blocked_reason text,
  created_at timestamptz not null default now()
);
create index crm_ken_payoff_aliases_obligation_idx on public.crm_ken_payoff_aliases(canonical_key);
alter table public.crm_ken_payoff_obligations enable row level security;
alter table public.crm_ken_payoff_aliases enable row level security;
revoke all on public.crm_ken_payoff_obligations, public.crm_ken_payoff_aliases from public, anon, authenticated, service_role;
grant select on public.crm_ken_payoff_obligations, public.crm_ken_payoff_aliases to service_role;

-- Drafts remain separate quotes. Only an unambiguous sold contract can absorb
-- an unlinked manual entry. Equal names/phones/amounts never establish identity.
create view public.crm_ken_payoff_source_claims with (security_invoker=true) as
with quotes as (
 select q.*, round(greatest(coalesce(q.quote_total,0),0)*.1,2) entitlement,
   array[q.id::text] || case when q.sold_at is not null or q.signed_at is not null or
     q.status in ('sold','approved','ordered','received','installed','invoiced','paid','closed') then
     array_remove(array[nullif(q.meta->>'source_sales_quote_id',''),nullif(q.meta->>'mts_quote_id',''),
       nullif(q.meta->>'sales_quote_id',''),nullif(q.meta->>'target_sales_quote_id','')],null)
     else array[]::text[] end aliases
 from public.crm_quotes q
), entries as (
 select e.*, c.ids, c.total,
   case when e.quote_id is not null then 'quote:'||e.quote_id
        when cardinality(c.ids)=1 and round(e.total_amount,2)=round(c.total,2) then 'quote:'||c.ids[1]
        when cardinality(c.ids)>0 then 'entry:'||e.id
        when e.job_id is not null then 'job:'||e.job_id else 'entry:'||e.id end canonical_key,
   case when e.quote_id is not null and not exists(select 1 from quotes q where q.id=e.quote_id) then 'Linked contract is missing.'
        when e.quote_id is null and cardinality(c.ids)>1 then 'Multiple contracts on this job; link the exact contract before paying Ken.'
        when e.quote_id is null and cardinality(c.ids)=1 and round(e.total_amount,2)<>round(c.total,2) then 'Manual record conflicts with the linked job contract total.' end blocked_reason
 from public.crm_quote_bookkeeping_entries e
 left join lateral (select array_agg(q.id order by q.id) ids, max(q.quote_total) total from quotes q
   where q.job_id=e.job_id and q.archived_at is null and
   (q.sold_at is not null or q.signed_at is not null or q.status in ('sold','approved','ordered','received','installed','invoiced','paid','closed'))) c on true
)
select 'quote:'||q.id canonical_key, k.alias_key, q.entitlement, null::text blocked_reason
from quotes q cross join lateral unnest(q.aliases) a(id)
cross join lateral (values ('quote:'||a.id),('ken:crm_quote:'||a.id)) k(alias_key)
union all
select e.canonical_key,k.alias_key,
  round(greatest(coalesce(q.quote_total,e.total_amount,0),0)*.1,2),
  coalesce(e.blocked_reason,case when e.quote_id is not null and e.job_id is not null and q.job_id<>e.job_id then 'Contract and bookkeeping job identities conflict.' end)
from entries e left join quotes q on 'quote:'||q.id=e.canonical_key
cross join lateral (values ('entry:'||e.id),('ken:'||e.source||':'||e.id)) k(alias_key);
revoke all on public.crm_ken_payoff_source_claims from public,anon,authenticated;
grant select on public.crm_ken_payoff_source_claims to service_role;

create function public.crm_refresh_ken_payoff_identity() returns void
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('crm_ken_payment_batch_v2'));
 insert into crm_ken_payoff_obligations(canonical_key,entitlement,blocked_reason)
 select canonical_key,min(entitlement),coalesce(max(blocked_reason),case when min(entitlement)<>max(entitlement) then 'Conflicting totals for the same job.' end)
 from crm_ken_payoff_source_claims group by canonical_key
 on conflict(canonical_key) do update set entitlement=excluded.entitlement,blocked_reason=excluded.blocked_reason
 where (crm_ken_payoff_obligations.entitlement,crm_ken_payoff_obligations.blocked_reason) is distinct from (excluded.entitlement,excluded.blocked_reason);
 insert into crm_ken_payoff_aliases(alias_key,canonical_key,blocked_reason)
 select alias_key,min(canonical_key),coalesce(max(blocked_reason),case when count(distinct canonical_key)>1 then 'Source identity belongs to multiple contracts.' end)
 from crm_ken_payoff_source_claims group by alias_key
 on conflict(alias_key) do update set blocked_reason=case
   when crm_ken_payoff_aliases.canonical_key<>excluded.canonical_key then 'Source identity changed; reconcile the original obligation before paying.'
   else excluded.blocked_reason end
 where crm_ken_payoff_aliases.blocked_reason is distinct from case
   when crm_ken_payoff_aliases.canonical_key<>excluded.canonical_key then 'Source identity changed; reconcile the original obligation before paying.'
   else excluded.blocked_reason end;
 -- Conflicts block all claimants, including the original obligation after relinking.
 update crm_ken_payoff_obligations o set blocked_reason='Conflicting or reassigned source identity; review required.'
 where exists(select 1 from crm_ken_payoff_aliases a where a.blocked_reason is not null and
   (a.canonical_key=o.canonical_key or exists(select 1 from crm_ken_payoff_source_claims c where c.alias_key=a.alias_key and c.canonical_key=o.canonical_key)));
 update crm_ken_payoff_obligations o set blocked_reason='Source record removed; historical obligation retained.'
 where not exists(select 1 from crm_ken_payoff_source_claims c where c.canonical_key=o.canonical_key);
end $$;
revoke all on function public.crm_refresh_ken_payoff_identity() from public,anon,authenticated,service_role;
create function public.crm_refresh_ken_payoff_identity_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform crm_refresh_ken_payoff_identity(); return null; end $$;
revoke all on function public.crm_refresh_ken_payoff_identity_trigger() from public,anon,authenticated,service_role;
create trigger crm_quotes_ken_identity after insert or update of job_id,quote_total,meta,sold_at,signed_at,status,archived_at or delete on public.crm_quotes
for each statement execute function public.crm_refresh_ken_payoff_identity_trigger();
create trigger crm_entries_ken_identity after insert or update of quote_id,job_id,total_amount,source or delete on public.crm_quote_bookkeeping_entries
for each statement execute function public.crm_refresh_ken_payoff_identity_trigger();
select public.crm_refresh_ken_payoff_identity();
create view public.crm_ken_payoff_registry with(security_invoker=true) as
select a.alias_key,a.canonical_key,o.entitlement,coalesce(a.blocked_reason,o.blocked_reason) blocked_reason
from public.crm_ken_payoff_aliases a join public.crm_ken_payoff_obligations o using(canonical_key);
revoke all on public.crm_ken_payoff_registry from public,anon,authenticated;
grant select on public.crm_ken_payoff_registry to service_role;

-- All supplied stable identifiers must resolve to the same obligation.
create function public.crm_ken_allocation_identity(a jsonb) returns text
language sql stable security invoker set search_path=public as $$
 with keys as (select distinct k from unnest(array[nullif(a->>'item_key',''),
   case when nullif(a->>'quote_id','') is not null then 'quote:'||(a->>'quote_id') end,
   case when nullif(a->>'bookkeeping_entry_id','') is not null then 'entry:'||(a->>'bookkeeping_entry_id') end]) k where k is not null),
 matched as (select r.* from keys left join crm_ken_payoff_registry r on r.alias_key=keys.k),
 resolved as (select case when count(*)>0 and count(*)=count(canonical_key) and count(distinct canonical_key)=1 and count(blocked_reason)=0 then min(canonical_key) end k from matched)
 select case when nullif(a->>'job_id','') is null or
   k='job:'||(a->>'job_id') or
   exists(select 1 from crm_quotes q where 'quote:'||q.id=k and q.job_id::text=a->>'job_id') or
   exists(select 1 from crm_quote_bookkeeping_entries e where 'entry:'||e.id=k and e.job_id::text=a->>'job_id') then k end from resolved
$$;
revoke all on function public.crm_ken_allocation_identity(jsonb) from public,anon,authenticated;
grant execute on function public.crm_ken_allocation_identity(jsonb) to service_role;

create view public.crm_ken_payoff_payment_evidence with(security_invoker=true) as
with raw as (
 select p.id payment_id,p.amount payment_amount,p.note,p.meta payment_meta,a.id::text allocation_id,to_jsonb(a) allocation
 from public.crm_ken_payments p join public.crm_ken_payment_allocations a on a.payment_id=p.id
 union all
 select p.id,p.amount,p.note,p.meta,p.id::text||':'||a.n,a.value
 from public.crm_ken_payments p cross join lateral jsonb_array_elements(coalesce(p.meta->'selectedItemAllocations','[]'::jsonb)) with ordinality a(value,n)
 where not exists(select 1 from public.crm_ken_payment_allocations x where x.payment_id=p.id)
), evidence as (
 select *,public.crm_ken_allocation_identity(allocation) canonical_key,(allocation->>'amount')::numeric amount,
   coalesce(note,'') ilike 'Manual paid checkbox reconciliation for %' or payment_meta->>'batchSource'='manual_paid_checkbox_reconciliation' marker
 from raw where coalesce(payment_meta->>'partnerPaymentPerson','ken')='ken'
)
select *,sum(amount) over(partition by payment_id)=payment_amount balanced from evidence;
revoke all on public.crm_ken_payoff_payment_evidence from public,anon,authenticated;
grant select on public.crm_ken_payoff_payment_evidence to service_role;

-- Existing source payments remain immutable. Only new guarded batches may write.
revoke insert, update, delete, truncate on public.crm_ken_payments, public.crm_ken_payment_allocations from public, anon, authenticated, service_role;
create function public.crm_guard_ken_payment_write() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if current_user not in ('postgres','supabase_admin') then
   raise exception using errcode='23514',message='Ken payment changes require the guarded payoff transaction.';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.crm_guard_ken_payment_write() from public,anon,authenticated,service_role;
create trigger crm_ken_payment_write_guard before insert or update or delete on public.crm_ken_payments
for each row execute function public.crm_guard_ken_payment_write();
create trigger crm_ken_allocation_write_guard before insert or update or delete on public.crm_ken_payment_allocations
for each row execute function public.crm_guard_ken_payment_write();

create or replace function public.crm_create_ken_payment_batch_v2(
 p_paid_on date,p_period_month date,p_amount numeric,p_note text,p_created_by_email text,p_meta jsonb,p_allocations jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_id uuid; a jsonb; v_key text; seen text[]:='{}'; v_paid numeric; v_limit numeric; v_sum numeric:=0; v_expected numeric;
 r record; v_match_count integer; v_request text:=nullif(p_meta->>'paymentRequestId','');
begin
 if v_request is null then raise exception using errcode='23514',message='Ken payment request id is required.'; end if;
 perform pg_advisory_xact_lock(hashtext('crm_ken_payment_batch_v2'));
 select id into v_id from crm_ken_payments where meta->>'paymentRequestId'=v_request;
 if v_id is not null then return jsonb_build_object('payment_id',v_id,'created',false); end if;
 if p_paid_on is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
 or coalesce(p_meta->>'manualPaymentConfirmed','false')<>'true'
 or coalesce(p_meta->>'manualPaymentMethod','') not in ('check','cash','ach','card','other')
 or coalesce(p_meta->>'partnerPaymentPerson','ken')<>'ken'
 or jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations)=0 then
   raise exception using errcode='23514',message='Confirmed Ken payment and exact allocations are required.';
 end if;
 for a in select value from jsonb_array_elements(p_allocations) loop
   v_key:=crm_ken_allocation_identity(a);
   if v_key is null then raise exception using errcode='23514',message='Duplicate or ambiguous payoff identity is blocked. Reload Payoff.'; end if;
   if v_key=any(seen) then raise exception using errcode='23514',message='The same contract cannot appear twice in a Ken payment.'; end if;
   seen:=array_append(seen,v_key);
   select entitlement into v_limit from crm_ken_payoff_obligations where canonical_key=v_key and blocked_reason is null;
   if v_limit is null or coalesce(a->'meta'->>'person','')<>'ken' or coalesce((a->>'amount')::numeric,0)<=0
     or (a->>'amount')::numeric<>round((a->>'amount')::numeric,2) then
     raise exception using errcode='23514',message='Invalid or blocked Ken obligation.';
   end if;
   v_paid:=0;
   for r in select * from crm_ken_payoff_payment_evidence e where e.canonical_key=v_key or
     (e.canonical_key is null and exists(select 1 from crm_ken_payoff_aliases x where x.canonical_key=v_key and
       (x.alias_key in (e.allocation->>'item_key','quote:'||(e.allocation->>'quote_id'),'entry:'||(e.allocation->>'bookkeeping_entry_id'))
       or (nullif(e.allocation->>'job_id','')=nullif(a->>'job_id','') and not exists(select 1 from crm_ken_payoff_aliases known where known.canonical_key like 'quote:%' and known.alias_key in (e.allocation->>'item_key','quote:'||(e.allocation->>'quote_id'),'entry:'||(e.allocation->>'bookkeeping_entry_id'))))))) loop
     if r.canonical_key is null or not r.balanced then
       raise exception using errcode='23514',message='Historical allocation needs review before this contract can be paid again.';
     end if;
     if coalesce(r.marker,false) then
       select count(*) into v_match_count from crm_ken_payoff_payment_evidence e where not coalesce(e.marker,false)
         and e.balanced and e.canonical_key=v_key and e.amount=r.amount;
       if v_match_count<>1 or (select count(*) from crm_ken_payoff_payment_evidence e where coalesce(e.marker,false) and e.canonical_key=v_key and e.amount=r.amount)>1 then raise exception using errcode='23514',message='Historical checkbox allocation needs review before paying this contract.'; end if;
     else v_paid:=v_paid+r.amount; end if;
   end loop;
   v_expected:=nullif(a->'meta'->>'expectedCanonicalPaidAmount','')::numeric;
   if v_expected is null or round(v_paid,2)<>round(v_expected,2) then
     raise exception using errcode='23514',message='Ken payoff balance changed. Reload Payoff before recording payment.';
   end if;
   if v_paid+(a->>'amount')::numeric>v_limit then
     raise exception using errcode='23514',message='Ken payment exceeds the remaining contract entitlement.';
   end if;
   v_sum:=v_sum+(a->>'amount')::numeric;
 end loop;
 if v_sum<>p_amount then raise exception using errcode='23514',message='Ken payment must equal its allocations.'; end if;
 insert into crm_ken_payments(paid_on,period_month,amount,note,created_by_email,meta)
 values(p_paid_on,p_period_month,p_amount,p_note,p_created_by_email,p_meta||jsonb_build_object('canonicalGuardVersion',1)) returning id into v_id;
 for a in select value from jsonb_array_elements(p_allocations) loop
   insert into crm_ken_payment_allocations(payment_id,source,quote_id,bookkeeping_entry_id,job_id,item_key,customer_name,closed_at,amount,period_month,meta)
   values(v_id,a->>'source',nullif(a->>'quote_id','')::uuid,nullif(a->>'bookkeeping_entry_id','')::uuid,nullif(a->>'job_id','')::uuid,
     a->>'item_key',a->>'customer_name',nullif(a->>'closed_at','')::date,(a->>'amount')::numeric,nullif(a->>'period_month','')::date,
     coalesce(a->'meta','{}'::jsonb)||jsonb_build_object('canonicalObligationKey',crm_ken_allocation_identity(a)));
 end loop;
 return jsonb_build_object('payment_id',v_id,'created',true);
end $$;
-- The legacy RPC has no canonical confirmation contract and must not bypass v2.
revoke all on function public.crm_create_ken_payment_batch(date,date,numeric,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.crm_create_ken_payment_batch_v2(date,date,numeric,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.crm_create_ken_payment_batch_v2(date,date,numeric,text,text,jsonb,jsonb) to service_role;
