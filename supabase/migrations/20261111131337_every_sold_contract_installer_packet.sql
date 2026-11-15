-- Send the existing installer packet once for every new sold contract.
-- This does not update existing outbox rows, rewrite sent receipts, or
-- backfill contracts that were already sold before this migration.

do $$
declare
  recipient_constraint name;
begin
  for recipient_constraint in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.crm_installer_delivery_outbox'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%recipient%'
  loop
    execute format(
      'alter table public.crm_installer_delivery_outbox drop constraint %I',
      recipient_constraint
    );
  end loop;
end
$$;

alter table public.crm_installer_delivery_outbox
  add constraint crm_installer_delivery_outbox_recipient_check
  check (
    recipient ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}(,[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})*$'
  );

alter table public.crm_installer_delivery_outbox
  alter column recipient set default 'mtsinstallations@gmail.com,mtsshutters@mail.grokbot.com';

create or replace function public.installer_delivery_quote_eligible(p_quote public.crm_quotes)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_quote.archived_at is null
    and lower(coalesce(p_quote.status, '')) in
      ('sold', 'approved', 'ordered', 'received', 'installed', 'invoiced', 'paid')
    and not (coalesce(p_quote.meta, '{}'::jsonb) @> '{"historical_recordkeeping_only":true}'::jsonb)
    and exists (
      select 1
      from public.crm_jobs j
      where j.id = p_quote.job_id
        and coalesce(lower(j.source), '') <> 'mts_bookkeeping_import'
        and not (coalesce(j.meta, '{}'::jsonb) @> '{"historical_recordkeeping_only":true}'::jsonb)
        and lower(trim(j.customer_name)) !~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)'
        and coalesce(lower(j.email), '') !~ '@(example\.com|test|local\.invalid)$'
    )
$$;

create or replace function public.installer_delivery_enqueue_base_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A quote that is already in a sale status keeps its one packet. Later
  -- edits, signatures, payments, and status changes must not create another
  -- and must not backfill a sale that was recorded before this enqueue.
  if tg_op = 'UPDATE'
    and lower(coalesce(old.status, '')) in
      ('sold', 'approved', 'ordered', 'received', 'installed', 'invoiced', 'paid')
  then
    return new;
  end if;
  if public.installer_delivery_quote_eligible(new) then
    insert into public.crm_installer_delivery_outbox(quote_id, kind, version_key)
    values (new.id, 'base_packet', 'base-v1')
    on conflict (quote_id, kind, version_key) do nothing;
  end if;
  return new;
end
$$;

create or replace function public.installer_delivery_enqueue(
  p_quote_id uuid,
  p_kind text default 'base_packet',
  p_version_key text default 'base-v1'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.crm_quotes;
  queued public.crm_installer_delivery_outbox;
begin
  if p_kind not in ('base_packet', 'installation_handoff') or nullif(trim(p_version_key), '') is null then
    raise exception 'Invalid installer delivery version.';
  end if;
  if p_kind = 'base_packet' then
    select * into queued
    from public.crm_installer_delivery_outbox
    where quote_id = p_quote_id
      and kind = 'base_packet'
      and version_key = p_version_key;
    if not found then
      return null;
    end if;
    update public.crm_installer_delivery_outbox
    set updated_at = now()
    where id = queued.id
    returning * into queued;
    return to_jsonb(queued);
  end if;
  select * into q from public.crm_quotes where id = p_quote_id;
  if not found or not public.installer_delivery_quote_eligible(q) then
    return null;
  end if;
  insert into public.crm_installer_delivery_outbox(quote_id, kind, version_key)
  values (p_quote_id, p_kind, p_version_key)
  on conflict (quote_id, kind, version_key) do update set updated_at = now()
  returning * into queued;
  return to_jsonb(queued);
end
$$;

create or replace function public.installer_delivery_claim(p_quote_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_id uuid;
  claimed public.crm_installer_delivery_outbox;
begin
  update public.crm_installer_delivery_outbox o
  set status = 'blocked',
      failure_stage = 'form',
      last_error = 'Quote is archived, historical, or a fixture and is excluded from installer delivery.',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where o.status not in ('accepted', 'sent', 'blocked')
    and (p_quote_id is null or o.quote_id = p_quote_id)
    and not exists (
      select 1
      from public.crm_quotes q
      where q.id = o.quote_id
        and public.installer_delivery_quote_eligible(q)
    );

  -- A definite provider rejection stays retryable. An uncertain result is
  -- frozen after Resend's 24-hour idempotency window so a retry cannot
  -- become a second email.
  update public.crm_installer_delivery_outbox
  set status = 'blocked',
      failure_stage = 'send',
      last_error = 'Uncertain provider result exceeded the 24-hour Resend idempotency window; reconcile before retry.',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where status in ('uncertain', 'processing')
    and provider_message_id is null
    and first_send_attempt_at is not null
    and first_send_attempt_at <= now() - interval '24 hours'
    and (status = 'uncertain' or lease_expires_at <= now())
    and (p_quote_id is null or quote_id = p_quote_id);

  select id into selected_id
  from public.crm_installer_delivery_outbox
  where (p_quote_id is null or quote_id = p_quote_id)
    and available_at <= now()
    and (
      (status = 'accepted' and (lease_token is null or lease_expires_at <= now()))
      or status in ('pending', 'retry')
      or (status = 'uncertain' and first_send_attempt_at > now() - interval '24 hours')
      or (
        status = 'processing'
        and lease_expires_at <= now()
        and (
          provider_message_id is not null
          or first_send_attempt_at is null
          or first_send_attempt_at > now() - interval '24 hours'
        )
      )
    )
  order by case kind when 'base_packet' then 0 else 1 end, created_at, id
  for update skip locked
  limit 1;

  if selected_id is null then
    return null;
  end if;

  update public.crm_installer_delivery_outbox
  set status = 'processing',
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '10 minutes',
      attempts = attempts + 1,
      updated_at = now()
  where id = selected_id
  returning * into claimed;
  return to_jsonb(claimed);
end
$$;

notify pgrst, 'reload schema';
