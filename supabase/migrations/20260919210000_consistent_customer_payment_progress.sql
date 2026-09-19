-- Customer receipts cover the configured deposit first, for every tender/source.
-- Receipt identity, amount, original purpose, fees, and fulfillment evidence are unchanged.
create or replace function public.crm_customer_payment_totals(p_quote uuid, p_entry uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 with target as (
   select quote_total total, greatest(coalesce(deposit_required,0),0) required from crm_quotes where id=p_quote and p_entry is null
   union all
   select total_amount, greatest(coalesce(nullif(meta->>'deposit_required','')::numeric,total_amount/2),0)
   from crm_quote_bookkeeping_entries where id=p_entry and p_quote is null
 ), received as (
   select coalesce(sum(amount),0) paid from crm_quote_bookkeeping_payments
   where (p_quote is not null and quote_id=p_quote) or (p_entry is not null and bookkeeping_entry_id=p_entry and quote_id is null)
 ), credits as (
   select coalesce(sum(case when to_quote_id=p_quote or (p_quote is null and to_bookkeeping_entry_id=p_entry) then amount else 0 end),0)
     - coalesce(sum(case when from_quote_id=p_quote or (p_quote is null and from_bookkeeping_entry_id=p_entry) then amount else 0 end),0) net
   from crm_quote_bookkeeping_credits
 ), totals as (
   select total, required, round(paid,2) paid, round(net,2) credit,
     least(greatest(round(paid,2),0),required) deposit, round(total-paid-net,2) balance
   from target cross join received cross join credits
 ) select jsonb_build_object('total',total,'required',required,'received',paid,'credit',credit,
   'depositPaid',deposit,'balancePaid',paid-deposit,'balanceDue',balance,
   'depositComplete',least(greatest(required-deposit,0),greatest(balance,0))=0,
   'closed',total>0 and balance<=0) from totals;
$$;
revoke all on function public.crm_customer_payment_totals(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_customer_payment_totals(uuid,uuid) to service_role;

create or replace function public.crm_sync_customer_payment_progress(p_quote uuid, p_entry uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_job uuid; v_meta jsonb; v_old jsonb; v_state jsonb; v_status text; v_sale boolean;
 v_count integer; v_closed boolean; v_deposit numeric; v_balance numeric; v_received numeric;
 v_job_row crm_jobs%rowtype; v_job_state jsonb; v_new_status text;
begin
 if (p_quote is null)=(p_entry is null) then raise exception 'Choose exactly one payment ledger'; end if;
 if p_quote is not null then
   select job_id,coalesce(meta,'{}'),status,
     (status not in ('lost','archived') and (status in ('sold','approved','ordered','received','installed','invoiced','paid') or signed_at is not null or sold_at is not null))
   into v_job,v_meta,v_status,v_sale from crm_quotes where id=p_quote;
 else
   select job_id,coalesce(meta,'{}'),null,source in ('manual','legacy_sheet')
   into v_job,v_meta,v_status,v_sale from crm_quote_bookkeeping_entries where id=p_entry;
 end if;
 if not found then return null; end if;
 if v_meta->>'deleted_at' is not null or v_meta->>'bookkeeping_deleted_at' is not null then return null; end if;
 -- Serialize sibling receipts before deciding whether the entire parent is paid.
 if v_job is not null then select * into v_job_row from crm_jobs where id=v_job for no key update; end if;
 v_state:=crm_customer_payment_totals(p_quote,p_entry);
 v_old:=coalesce(v_meta->'payment_progress','{}');
 v_state:=v_state||jsonb_build_object('source','customer-payment-ledger',
   'closed',coalesce(v_sale,false) and (v_state->>'closed')::boolean,
   'previousStatus',case when v_status='paid' then coalesce(v_old->>'previousStatus','sold') else v_status end);
 if (v_state->>'closed')::boolean then
   v_state:=v_state||jsonb_build_object('closedAt',coalesce(v_old->>'closedAt',clock_timestamp()::text));
 end if;
 if v_old is distinct from v_state then
   if p_quote is not null then
     v_new_status:=case when v_status in ('lost','archived') then v_status
       when (v_state->>'closed')::boolean then 'paid'
       when v_status='paid' and v_old->>'source'='customer-payment-ledger' then coalesce(v_old->>'previousStatus','sold') else v_status end;
     update crm_quotes set meta=coalesce(meta,'{}')||jsonb_build_object('payment_progress',v_state),
       balance_due=greatest((v_state->>'balanceDue')::numeric,0),status=v_new_status where id=p_quote;
   else
     update crm_quote_bookkeeping_entries set meta=coalesce(meta,'{}')||jsonb_build_object('payment_progress',v_state) where id=p_entry;
   end if;
   insert into crm_activity_events(actor_email,entity_type,entity_id,action,after_data,metadata)
   values('payment-ledger',case when p_quote is not null then 'quote' else 'bookkeeping_entry' end,coalesce(p_quote,p_entry),
     'payment.progress_updated',v_state,jsonb_build_object('quoteId',p_quote,'entryId',p_entry,'jobId',v_job));
 end if;
 if v_job is not null and v_job_row.id is not null and v_job_row.status<>'lost' then
   with ledgers as (
     select q.id quote_id,null::uuid entry_id from crm_quotes q where q.job_id=v_job
       and (q.status in ('sold','approved','ordered','received','installed','invoiced','paid') or q.signed_at is not null or q.sold_at is not null)
       and q.status not in ('lost','archived') and q.meta->>'deleted_at' is null and q.meta->>'bookkeeping_deleted_at' is null
       and not exists(select 1 from crm_quote_bookkeeping_entries e where e.quote_id=q.id and e.source in ('manual','legacy_sheet') and e.meta->>'deleted_at' is null and e.meta->>'bookkeeping_deleted_at' is null)
     union all
     select null::uuid,e.id from crm_quote_bookkeeping_entries e where e.job_id=v_job and e.source in ('manual','legacy_sheet')
       and e.meta->>'deleted_at' is null and e.meta->>'bookkeeping_deleted_at' is null
   ), states as (select crm_customer_payment_totals(quote_id,entry_id) s from ledgers)
   select count(*),coalesce(bool_and((s->>'closed')::boolean),false),coalesce(sum((s->>'depositPaid')::numeric),0),
     coalesce(sum(greatest((s->>'balanceDue')::numeric,0)),0),coalesce(sum((s->>'received')::numeric),0)
     into v_count,v_closed,v_deposit,v_balance,v_received from states;
   if v_count>0 or v_job_row.meta->'payment_progress'->>'source'='customer-payment-ledger' then
     v_old:=coalesce(v_job_row.meta->'payment_progress','{}');
     v_job_state:=jsonb_build_object('source','customer-payment-ledger','closed',v_closed,'scopeCount',v_count,
       'depositPaid',v_deposit,'balanceDue',v_balance,'received',v_received,
       'previousStatus',case when v_job_row.status='closed' then coalesce(v_old->>'previousStatus','invoiced') else v_job_row.status end);
     if v_closed then v_job_state:=v_job_state||jsonb_build_object('closedAt',coalesce(v_old->>'closedAt',clock_timestamp()::text)); end if;
     v_new_status:=case when v_closed then 'closed'
       when v_job_row.status='closed' and v_old->>'source'='customer-payment-ledger' then coalesce(v_old->>'previousStatus','invoiced') else v_job_row.status end;
     if v_old is distinct from v_job_state or v_job_row.deposit_paid is distinct from v_deposit or v_job_row.status is distinct from v_new_status then
       update crm_jobs set status=v_new_status,deposit_paid=v_deposit,
         meta=coalesce(meta,'{}')||jsonb_build_object('payment_progress',v_job_state)
           ||case when v_closed and v_job_row.status<>'closed' then jsonb_build_object('closedAt',v_job_state->>'closedAt') else '{}'::jsonb end where id=v_job;
       insert into crm_activity_events(actor_email,entity_type,entity_id,action,after_data,metadata)
       values('payment-ledger','job',v_job,'payment.job_updated',v_job_state,jsonb_build_object('previousStatus',v_job_row.status,'status',v_new_status));
     end if;
   end if;
 end if;
 return v_state;
end;
$$;
revoke all on function public.crm_sync_customer_payment_progress(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_sync_customer_payment_progress(uuid,uuid) to service_role;

create or replace function public.crm_receipt_payment_progress_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op<>'INSERT' and (old.quote_id is not null or old.bookkeeping_entry_id is not null) then
   perform crm_sync_customer_payment_progress(old.quote_id,case when old.quote_id is null then old.bookkeeping_entry_id else null end);
 end if;
 if tg_op<>'DELETE' and (new.quote_id is not null or new.bookkeeping_entry_id is not null) then
   if tg_op='INSERT' or (new.quote_id,new.bookkeeping_entry_id) is distinct from (old.quote_id,old.bookkeeping_entry_id) then
     perform crm_sync_customer_payment_progress(new.quote_id,case when new.quote_id is null then new.bookkeeping_entry_id else null end);
   end if;
 end if;
 return null;
end;
$$;
create trigger crm_receipt_payment_progress after insert or update of amount,quote_id,bookkeeping_entry_id or delete
on public.crm_quote_bookkeeping_payments for each row execute function public.crm_receipt_payment_progress_trigger();

create or replace function public.crm_credit_payment_progress_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; targets jsonb:='[]';
begin
 if tg_op<>'INSERT' then targets:=targets||jsonb_build_array(jsonb_build_object('q',old.from_quote_id,'e',old.from_bookkeeping_entry_id),jsonb_build_object('q',old.to_quote_id,'e',old.to_bookkeeping_entry_id)); end if;
 if tg_op<>'DELETE' then targets:=targets||jsonb_build_array(jsonb_build_object('q',new.from_quote_id,'e',new.from_bookkeeping_entry_id),jsonb_build_object('q',new.to_quote_id,'e',new.to_bookkeeping_entry_id)); end if;
 for r in select distinct (t->>'q')::uuid q,case when t->>'q' is null then (t->>'e')::uuid else null end e from jsonb_array_elements(targets) t order by 1,2 loop
   if r.q is not null or r.e is not null then perform crm_sync_customer_payment_progress(r.q,r.e); end if;
 end loop;
 return null;
end;
$$;
create trigger crm_credit_payment_progress after insert or update or delete on public.crm_quote_bookkeeping_credits
for each row execute function public.crm_credit_payment_progress_trigger();

create or replace function public.crm_terms_payment_progress_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if pg_trigger_depth()>1 then return null; end if;
 if tg_table_name='crm_quotes' then perform crm_sync_customer_payment_progress(new.id,null);
 else perform crm_sync_customer_payment_progress(null,new.id); end if;
 return null;
end;
$$;
create trigger crm_quote_terms_payment_progress after update of quote_total,deposit_required,status on public.crm_quotes
for each row execute function public.crm_terms_payment_progress_trigger();
create trigger crm_entry_terms_payment_progress after update of total_amount,meta on public.crm_quote_bookkeeping_entries
for each row when (old.total_amount is distinct from new.total_amount or old.meta->'deposit_required' is distinct from new.meta->'deposit_required')
execute function public.crm_terms_payment_progress_trigger();
revoke all on function public.crm_receipt_payment_progress_trigger(),public.crm_credit_payment_progress_trigger(),public.crm_terms_payment_progress_trigger() from public,anon,authenticated;

-- Updating payment progress is not a new sale or a request to resend its packet.
create or replace function public.installer_delivery_enqueue_base_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.meta->'payment_progress'->>'source'='customer-payment-ledger'
   and (to_jsonb(new)-'meta'-'balance_due'-'status'-'updated_at')=(to_jsonb(old)-'meta'-'balance_due'-'status'-'updated_at')
   and (coalesce(new.meta,'{}')-'payment_progress')=(coalesce(old.meta,'{}')-'payment_progress')
   and (new.status=old.status or new.status='paid' or old.status='paid') then return new; end if;
 if public.installer_delivery_quote_eligible(new) then
   insert into public.crm_installer_delivery_outbox(quote_id,kind,version_key)
   values(new.id,'base_packet','base-v1') on conflict(quote_id,kind,version_key) do nothing;
 end if;
 return new;
end;
$$;
