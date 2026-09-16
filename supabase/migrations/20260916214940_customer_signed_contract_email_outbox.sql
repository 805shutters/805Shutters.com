-- Future-only, durable delivery of the exact signed customer contract.
-- There is deliberately no historical INSERT/SELECT backfill in this migration.

create table public.crm_customer_signed_contract_email_settings (
  singleton boolean primary key default true check (singleton),
  enabled_from timestamptz not null default statement_timestamp()
);
insert into public.crm_customer_signed_contract_email_settings(singleton) values(true);

create table public.crm_customer_signed_contract_email_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contract_id uuid not null references public.crm_customer_contracts(id) on delete cascade,
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending','processing','retry','uncertain','accepted','blocked')
  ),
  recipient text not null,
  sender text not null default '805 Shutters <805@805shutters.com>'
    check (sender = '805 Shutters <805@805shutters.com>'),
  signed_snapshot jsonb not null,
  customer_signature text not null,
  contract_signed_at timestamptz not null,
  payload jsonb,
  idempotency_key text,
  attempts integer not null default 0 check (attempts >= 0),
  failure_stage text check (failure_stage is null or failure_stage in ('prepare','send','persist')),
  last_error text,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  first_send_attempt_at timestamptz,
  provider_message_id text,
  provider_accepted_at timestamptz,
  unique(contract_id),
  unique(idempotency_key),
  check ((payload is null and idempotency_key is null) or (payload is not null and nullif(idempotency_key,'') is not null)),
  check (status <> 'accepted' or (nullif(trim(provider_message_id),'') is not null and provider_accepted_at is not null))
);

create index crm_customer_signed_contract_email_ready_idx
  on public.crm_customer_signed_contract_email_outbox(status,available_at,created_at);
create index crm_customer_signed_contract_email_quote_idx
  on public.crm_customer_signed_contract_email_outbox(quote_id,created_at);

alter table public.crm_customer_signed_contract_email_settings enable row level security;
alter table public.crm_customer_signed_contract_email_outbox enable row level security;
revoke all on public.crm_customer_signed_contract_email_settings from public,anon,authenticated;
revoke all on public.crm_customer_signed_contract_email_outbox from public,anon,authenticated;
grant all on public.crm_customer_signed_contract_email_settings to service_role;
grant all on public.crm_customer_signed_contract_email_outbox to service_role;
create policy "service role manages customer signed contract email settings"
  on public.crm_customer_signed_contract_email_settings for all to service_role using(true) with check(true);
create policy "service role manages customer signed contract email outbox"
  on public.crm_customer_signed_contract_email_outbox for all to service_role using(true) with check(true);

create function public.customer_signed_contract_email_enqueue_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  activation timestamptz;
  q public.crm_quotes;
  j public.crm_jobs;
  snapshot jsonb;
  recipient text;
  signature text;
  initial_status text := 'pending';
  initial_error text;
begin
  if new.signed_at is null
    or new.external_source is distinct from 'crm_quote'
    or new.meta #>> '{contract_snapshot,customerEmailDelivery}' is distinct from 'enabled'
    or (tg_op='UPDATE' and old.signed_at is not null)
  then return new; end if;

  select enabled_from into activation
  from public.crm_customer_signed_contract_email_settings where singleton=true;
  select * into q from public.crm_quotes where id=new.quote_id;
  if not found or q.signed_at is null or q.signed_at < activation or new.signed_at < activation
    or q.archived_at is not null
    or q.meta @> '{"historical_recordkeeping_only":true}'::jsonb
    or q.meta @> '{"no_external_notification":true}'::jsonb
  then return new; end if;
  select * into j from public.crm_jobs where id=q.job_id;
  if j.id is null
    or j.meta @> '{"historical_recordkeeping_only":true}'::jsonb
    or j.meta @> '{"no_external_notification":true}'::jsonb
    or lower(trim(j.customer_name)) ~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)'
  then return new; end if;

  snapshot := coalesce(new.meta->'contract_snapshot','{}'::jsonb);
  recipient := lower(trim(coalesce(snapshot->>'customerEmail','')));
  signature := trim(coalesce(snapshot->>'customerSignature',''));
  if recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    initial_status := 'blocked'; initial_error := 'The signed customer contract has no valid customer email.';
  elsif snapshot->>'schema' is distinct from '805_signed_quote_contract_v1'
    or snapshot #>> '{quote,id}' is distinct from new.quote_id::text
    or q.signed_at is distinct from new.signed_at
    or signature is distinct from trim(coalesce(q.customer_signature,''))
    or jsonb_typeof(snapshot->'lines') is distinct from 'array'
    or (case when jsonb_typeof(snapshot->'lines')='array' then jsonb_array_length(snapshot->'lines')=0 else true end)
    or snapshot->'terms'->>'version' is distinct from '2026-09-16'
    or signature='' or length(signature)>200 or signature ~* '^data:'
  then
    initial_status := 'blocked'; initial_error := 'The immutable signed contract snapshot is incomplete.';
  end if;

  insert into public.crm_customer_signed_contract_email_outbox(
    contract_id,quote_id,status,recipient,signed_snapshot,customer_signature,contract_signed_at,failure_stage,last_error
  ) values(
    new.id,new.quote_id,initial_status,recipient,snapshot,signature,new.signed_at,
    case when initial_status='blocked' then 'prepare' end,initial_error
  ) on conflict(contract_id) do nothing;
  return new;
end; $$;

create trigger crm_customer_contracts_enqueue_signed_email
after insert or update of signed_at,meta,quote_id on public.crm_customer_contracts
for each row execute function public.customer_signed_contract_email_enqueue_trigger();

create function public.customer_signed_contract_email_claim(p_quote_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare selected_id uuid; claimed public.crm_customer_signed_contract_email_outbox;
begin
  update public.crm_customer_signed_contract_email_outbox
  set status='blocked',failure_stage='send',last_error=case
      when attempts>=5 then 'Customer signed-contract email reached the retry limit; reconcile before retry.'
      else 'Uncertain provider result exceeded the 24-hour idempotency window; reconcile before retry.' end,
      lease_token=null,lease_expires_at=null,updated_at=now()
  where (p_quote_id is null or quote_id=p_quote_id)
    and ((status='retry' and attempts>=5) or
      (status in ('uncertain','processing','retry') and provider_message_id is null
       and first_send_attempt_at<=now()-interval '24 hours'
       and (status in ('uncertain','retry') or lease_expires_at<=now())));

  select id into selected_id from public.crm_customer_signed_contract_email_outbox
  where (p_quote_id is null or quote_id=p_quote_id) and available_at<=now()
    and (status in ('pending','retry')
      or (status='uncertain' and first_send_attempt_at>now()-interval '24 hours')
      or (status='processing' and lease_expires_at<=now()
        and (provider_message_id is not null or first_send_attempt_at is null or first_send_attempt_at>now()-interval '24 hours')))
  order by created_at,id for update skip locked limit 1;
  if selected_id is null then return null; end if;
  update public.crm_customer_signed_contract_email_outbox
  set status='processing',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',
      attempts=attempts+1,updated_at=now()
  where id=selected_id returning * into claimed;
  return to_jsonb(claimed);
end; $$;

revoke all on function public.customer_signed_contract_email_enqueue_trigger() from public,anon,authenticated;
revoke all on function public.customer_signed_contract_email_claim(uuid) from public,anon,authenticated;
grant execute on function public.customer_signed_contract_email_claim(uuid) to service_role;
