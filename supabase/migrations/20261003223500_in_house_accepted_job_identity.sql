-- Quote customer identity belongs to its exact linked CRM job.
create or replace function public.ensure_in_house_plan_for_acceptance(qid uuid) returns void language plpgsql security invoker set search_path='' as $$
declare q public.crm_quotes%rowtype; j public.crm_jobs%rowtype; pid uuid:=gen_random_uuid(); total bigint; third bigint; snapshot jsonb; day date;
begin
  select * into q from public.crm_quotes where id=qid for update;
  if q.meta#>>'{adjustments,paymentSchedule}' is distinct from 'in_house_three_month_v1' or q.signed_at is null then return; end if;
  if not exists(select 1 from public.sales_quote_v2_acceptances where crm_quote_id=q.id) then return;end if;
  if q.signed_at is null or q.job_id is null or q.meta->>'native_delivery_id' is null then raise exception 'Accepted native quote identity is required'; end if;
  select * into j from public.crm_jobs where id=q.job_id;
  if not found then raise exception 'Accepted quote job is required'; end if;
  total:=round(q.quote_total*100); third:=total/3;
  if total<3 then raise exception 'Three-month plans require at least three cents'; end if;
  day:=(q.signed_at at time zone 'America/Los_Angeles')::date;
  snapshot:=jsonb_build_object('target',jsonb_build_object('quoteId',q.id,'bookkeepingEntryId',null),'jobId',q.job_id,
    'customerName',j.customer_name,'quoteNumber',q.quote_number,'email',coalesce(q.customer_email,j.email),'phone',coalesce(q.customer_phone,j.phone),
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
