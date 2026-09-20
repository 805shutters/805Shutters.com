-- Preserve an audited manual reopening during subsequent payment synchronization.
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
     -- An explicit operational reopening overrides automatic financial closure.
     -- Receipts, quote payment status and all money calculations remain intact.
     if v_job_row.meta->'job_closure_override'->>'closed' = 'false' then
       v_closed := false;
     end if;
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

