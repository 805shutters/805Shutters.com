-- Preserve the deployed atomic receipt/idempotency implementation and remove only
-- the obsolete payment-driven parent-job closure. Fail closed if its contract drifted.
do $migration$
declare definition text; obsolete text := $obsolete$    update public.crm_jobs
    set status = 'closed', next_action = null, next_action_due = null,
        meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object(
          'closed_by','square-api-reconciliation','closed_at',now(),
          'square_payment_id',p_square_payment_id
        )
    where id = p_job_id and status not in ('closed','lost');
$obsolete$;
begin
 select pg_get_functiondef('public.reconcile_square_quote_payment(uuid,uuid,text,text,text,numeric,numeric,date,text,text,jsonb)'::regprocedure) into definition;
 if strpos(definition,obsolete)=0 or (length(definition)-length(replace(definition,obsolete,'')))/length(obsolete)<>1 then
   raise exception 'Square reconciliation closure block changed; inspect the deployed contract before migration';
 end if;
 definition:=replace(definition,obsolete,'    -- Financial settlement leaves operational status and next action unchanged.' || chr(10));
 if definition ~* 'update\s+public\.crm_jobs' then raise exception 'Unexpected remaining parent job mutation';end if;
 execute definition;
end
$migration$;
