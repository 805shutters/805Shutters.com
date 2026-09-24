-- Forward-only customer lifecycle email. No email or SMS is sent by this migration.
-- Queue remains paused until crm_activate_forward_customer_email() is called after deployment.
create table public.crm_customer_email_settings (
 singleton boolean primary key default true check(singleton), enabled_from timestamptz
);
insert into public.crm_customer_email_settings(singleton) values(true);
create table public.crm_customer_email_exclusions (
 scope_key text primary key, excluded_at timestamptz not null default now()
);
alter table public.crm_customer_email_settings enable row level security;
alter table public.crm_customer_email_exclusions enable row level security;
revoke all on public.crm_customer_email_settings,public.crm_customer_email_exclusions from public,anon,authenticated;
grant all on public.crm_customer_email_settings,public.crm_customer_email_exclusions to service_role;
create policy service_customer_email_settings on public.crm_customer_email_settings for all to service_role using(true) with check(true);
create policy service_customer_email_exclusions on public.crm_customer_email_exclusions for all to service_role using(true) with check(true);

-- Retain existing queue identity and acceptance evidence; extend the proven worker to receipts.
alter table public.crm_customer_signed_contract_email_outbox
 add column kind text not null default 'signed_contract' check(kind in ('signed_contract','paid_in_full')),
 add column job_id uuid references public.crm_jobs(id),
 add column bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id),
 add column scope_key text unique,
 add column paid_snapshot jsonb,
 add column delivery_status text,
 add column delivery_checked_at timestamptz,
 add column delivery_error text,
 alter column contract_id drop not null,
 alter column quote_id drop not null,
 alter column signed_snapshot drop not null,
 alter column customer_signature drop not null,
 alter column contract_signed_at drop not null,
 add constraint customer_email_kind_evidence check(
   (kind='signed_contract' and contract_id is not null and quote_id is not null and signed_snapshot is not null and customer_signature is not null and contract_signed_at is not null)
   or (kind='paid_in_full' and scope_key is not null and paid_snapshot is not null and ((quote_id is null) <> (bookkeeping_entry_id is null)))
 );
update public.crm_customer_signed_contract_email_outbox o set job_id=q.job_id from public.crm_quotes q where q.id=o.quote_id;
create index customer_email_job_idx on public.crm_customer_signed_contract_email_outbox(job_id,created_at);

create function public.crm_activate_forward_customer_email()
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare activation timestamptz;
begin
 -- Serialize activation with financial mutations; take the same locks for a coherent baseline.
 lock table public.crm_quotes,public.crm_quote_bookkeeping_entries,public.crm_quote_bookkeeping_payments,public.crm_quote_bookkeeping_credits in share row exclusive mode;
 select enabled_from into activation from public.crm_customer_email_settings where singleton for update;
 if activation is not null then return activation; end if;
 insert into public.crm_customer_email_exclusions(scope_key)
 select 'quote:'||q.id from public.crm_quotes q
 where q.status='paid' or q.meta->'payment_progress'->>'closedAt' is not null
   or q.meta->'customer_closeout_email'->>'status'='sent'
   or coalesce((public.crm_customer_payment_totals(q.id,null)->>'closed')::boolean,false)
 union all
 select 'entry:'||e.id from public.crm_quote_bookkeeping_entries e where e.quote_id is null
   and (e.meta->'payment_progress'->>'closedAt' is not null or coalesce((public.crm_customer_payment_totals(null,e.id)->>'closed')::boolean,false))
 on conflict do nothing;
 activation:=clock_timestamp();
 update public.crm_customer_email_settings set enabled_from=activation where singleton;
 update public.crm_customer_signed_contract_email_settings set enabled_from=activation where singleton;
 return activation;
end; $$;
revoke all on function public.crm_activate_forward_customer_email() from public,anon,authenticated;
grant execute on function public.crm_activate_forward_customer_email() to service_role;

create function public.crm_enqueue_paid_customer_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare activation timestamptz; scope text; q uuid; e uuid; j public.crm_jobs; recipient text; reference text; totals jsonb;
begin
 select enabled_from into activation from public.crm_customer_email_settings where singleton;
 if activation is null then return new; end if;
 -- Only an actual new financial transition. Merely editing an old paid record cannot enqueue.
 if new.meta->'payment_progress'->>'closed' is distinct from 'true'
   or (tg_op='UPDATE' and old.meta->'payment_progress'->>'closed'='true') then return new; end if;
 if new.meta @> '{"historical_recordkeeping_only":true}' or new.meta @> '{"no_external_notification":true}'
   or new.meta->>'deleted_at' is not null or new.meta->>'bookkeeping_deleted_at' is not null then return new; end if;
 if tg_table_name='crm_quotes' then
   q:=new.id; scope:='quote:'||q; reference:=new.quote_number; recipient:=nullif(trim(new.customer_email),'');
   if new.archived_at is not null or new.status in ('lost','archived') then return new; end if;
 else
   if new.quote_id is not null then return new; end if;
   e:=new.id; scope:='entry:'||e; reference:='Order '||left(e::text,8); recipient:=nullif(trim(new.meta->>'customer_email'),'');
 end if;
 if exists(select 1 from public.crm_customer_email_exclusions where scope_key=scope) then return new; end if;
 select * into j from public.crm_jobs where id=new.job_id;
 if j.id is null or j.meta @> '{"historical_recordkeeping_only":true}' or j.meta @> '{"no_external_notification":true}'
   or lower(trim(j.customer_name)) ~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)' then return new; end if;
 totals:=public.crm_customer_payment_totals(q,e);
 if coalesce((totals->>'closed')::boolean,false)=false then return new; end if;
 recipient:=coalesce(recipient,nullif(trim(j.email),''),'');
 insert into public.crm_customer_signed_contract_email_outbox(kind,job_id,quote_id,bookkeeping_entry_id,scope_key,
   recipient,status,last_error,failure_stage,paid_snapshot)
 values('paid_in_full',j.id,q,e,scope,lower(recipient),
   case when recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'pending' else 'blocked' end,
   case when recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'Customer email is missing or invalid. Update the customer file and review this new receipt.' end,
   case when recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'prepare' end,
   jsonb_build_object('customerName',j.customer_name,'quoteNumber',reference,'total',(totals->>'total')::numeric,
     'paidOn',(clock_timestamp() at time zone 'America/Los_Angeles')::date,'recipient',lower(recipient),'scopeKey',scope))
 on conflict(scope_key) do nothing;
 return new;
end; $$;
revoke all on function public.crm_enqueue_paid_customer_email() from public,anon,authenticated;
create trigger crm_enqueue_paid_customer_email after insert or update of meta on public.crm_quotes
 for each row execute function public.crm_enqueue_paid_customer_email();
create trigger crm_enqueue_paid_customer_email after insert or update of meta on public.crm_quote_bookkeeping_entries
 for each row execute function public.crm_enqueue_paid_customer_email();

create or replace function public.customer_signed_contract_email_claim(p_quote_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare selected_id uuid; claimed public.crm_customer_signed_contract_email_outbox;
begin
  if not exists(select 1 from public.crm_customer_email_settings where singleton and enabled_from is not null) then return null; end if;
  update public.crm_customer_signed_contract_email_outbox
  set status='blocked',failure_stage='send',last_error=case
      when attempts>=5 then 'Customer signed-contract email reached the retry limit; reconcile before retry.'
      else 'Uncertain provider result exceeded the 24-hour idempotency window; reconcile before retry.' end,
      lease_token=null,lease_expires_at=null,updated_at=now()
  where (p_quote_id is null or quote_id=p_quote_id) and created_at >= (select enabled_from from public.crm_customer_email_settings where singleton)
    and ((status='retry' and attempts>=5) or
      (status in ('uncertain','processing','retry') and provider_message_id is null
       and first_send_attempt_at<=now()-interval '23 hours'
       and (status in ('uncertain','retry') or lease_expires_at<=now())));

  -- Do not send a receipt after a reversal/reopened balance. Never retry an already
  -- accepted message because delivery is delayed or failed.
  update public.crm_customer_signed_contract_email_outbox o
  set status='blocked',last_error='The balance changed after this receipt was queued; review required.',failure_stage='prepare'
  where kind='paid_in_full' and status in ('pending','retry','uncertain')
    and provider_message_id is null and first_send_attempt_at is null
    and coalesce((public.crm_customer_payment_totals(quote_id,bookkeeping_entry_id)->>'closed')::boolean,false)=false;

  select id into selected_id from public.crm_customer_signed_contract_email_outbox
  where (p_quote_id is null or quote_id=p_quote_id) and created_at >= (select enabled_from from public.crm_customer_email_settings where singleton) and available_at<=now()
    and (status in ('pending','retry')
      or (status='uncertain' and first_send_attempt_at>now()-interval '23 hours')
      or (status='processing' and lease_expires_at<=now()
        and (provider_message_id is not null or first_send_attempt_at is null or first_send_attempt_at>now()-interval '23 hours')))
  order by created_at,id for update skip locked limit 1;
  if selected_id is null then return null; end if;
  update public.crm_customer_signed_contract_email_outbox
  set status='processing',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',
      attempts=attempts+1,updated_at=now()
  where id=selected_id returning * into claimed;
  return to_jsonb(claimed);
end; $$;


revoke all on function public.customer_signed_contract_email_claim(uuid) from public,anon,authenticated;
grant execute on function public.customer_signed_contract_email_claim(uuid) to service_role;

create function public.crm_customer_email_job_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.job_id is null and new.quote_id is not null then
   select job_id into new.job_id from public.crm_quotes where id=new.quote_id;
 end if;
 return new;
end; $$;
revoke all on function public.crm_customer_email_job_identity() from public,anon,authenticated;
create trigger crm_customer_email_job_identity before insert on public.crm_customer_signed_contract_email_outbox
 for each row execute function public.crm_customer_email_job_identity();

-- Read-only reconciliation. This detects missing queue rows but never backfills them.
create function public.crm_customer_email_missing_count()
returns integer language sql stable security invoker set search_path='' as $$
 select (
 (select count(*) from public.crm_customer_contracts c join public.crm_quotes q on q.id=c.quote_id join public.crm_jobs j on j.id=q.job_id,public.crm_customer_email_settings s
  where s.singleton and s.enabled_from is not null and c.signed_at>=s.enabled_from and q.signed_at>=s.enabled_from
    and c.external_source='crm_quote' and c.meta #>> '{contract_snapshot,customerEmailDelivery}'='enabled'
    and q.archived_at is null
    and not (coalesce(q.meta,'{}') @> '{"historical_recordkeeping_only":true}' or coalesce(q.meta,'{}') @> '{"no_external_notification":true}')
    and not (coalesce(j.meta,'{}') @> '{"historical_recordkeeping_only":true}' or coalesce(j.meta,'{}') @> '{"no_external_notification":true}')
    and lower(trim(j.customer_name)) !~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)'
    and not exists(select 1 from public.crm_customer_signed_contract_email_outbox o where o.contract_id=c.id))
 + (select count(*) from (
   select 'quote:'||q.id scope from public.crm_quotes q,public.crm_customer_email_settings s
   where s.singleton and s.enabled_from is not null and q.meta->'payment_progress'->>'closed'='true'
     and (q.meta->'payment_progress'->>'closedAt')::timestamptz>=s.enabled_from
     and q.archived_at is null and q.status not in ('lost','archived')
     and not (coalesce(q.meta,'{}') @> '{"historical_recordkeeping_only":true}' or coalesce(q.meta,'{}') @> '{"no_external_notification":true}')
     and exists(select 1 from public.crm_jobs j where j.id=q.job_id and not (coalesce(j.meta,'{}') @> '{"historical_recordkeeping_only":true}' or coalesce(j.meta,'{}') @> '{"no_external_notification":true}') and lower(trim(j.customer_name)) !~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)')
   union all
   select 'entry:'||e.id from public.crm_quote_bookkeeping_entries e,public.crm_customer_email_settings s
   where s.singleton and s.enabled_from is not null and e.quote_id is null and e.meta->'payment_progress'->>'closed'='true'
     and (e.meta->'payment_progress'->>'closedAt')::timestamptz>=s.enabled_from
     and not (coalesce(e.meta,'{}') @> '{"historical_recordkeeping_only":true}' or coalesce(e.meta,'{}') @> '{"no_external_notification":true}')
     and exists(select 1 from public.crm_jobs j where j.id=e.job_id and not (coalesce(j.meta,'{}') @> '{"historical_recordkeeping_only":true}' or coalesce(j.meta,'{}') @> '{"no_external_notification":true}') and lower(trim(j.customer_name)) !~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)')
 ) eligible
 where not exists(select 1 from public.crm_customer_email_exclusions x where x.scope_key=eligible.scope)
 and not exists(select 1 from public.crm_customer_signed_contract_email_outbox o where o.scope_key=eligible.scope)))::integer;
$$;
revoke all on function public.crm_customer_email_missing_count() from public,anon,authenticated;
grant execute on function public.crm_customer_email_missing_count() to service_role;
