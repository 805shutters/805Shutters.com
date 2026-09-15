-- Durable installer delivery outbox. This intentionally does not backfill
-- existing sold contracts; the audited production backlog is enqueued separately.

alter table public.crm_installer_forms
  drop constraint if exists crm_installer_forms_status_check;
alter table public.crm_installer_forms
  add constraint crm_installer_forms_status_check check (
    status in ('pending_delivery', 'preparation_failed', 'sent', 'partially_installed', 'completed', 'email_failed')
  );

alter table public.crm_installer_forms
  alter column status set default 'pending_delivery';

create table public.crm_installer_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  form_id uuid references public.crm_installer_forms(id) on delete set null,
  kind text not null check (kind in ('base_packet', 'installation_handoff')),
  version_key text not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'retry', 'uncertain', 'accepted', 'sent', 'blocked')
  ),
  recipient text not null default 'mtsagent101@gmail.com'
    check (recipient = 'mtsagent101@gmail.com'),
  sender text not null default '805 Shutters <805@805shutters.com>'
    check (sender = '805 Shutters <805@805shutters.com>'),
  payload jsonb,
  idempotency_key text,
  attempts integer not null default 0 check (attempts >= 0),
  failure_stage text check (failure_stage is null or failure_stage in ('form', 'balance', 'handoff', 'send', 'persist')),
  last_error text,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  first_send_attempt_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  constraint crm_installer_delivery_payload_pair check (
    (payload is null and idempotency_key is null) or
    (payload is not null and nullif(idempotency_key, '') is not null)
  ),
  constraint crm_installer_delivery_accepted_proof check (
    status <> 'accepted' or
    (nullif(trim(provider_message_id), '') is not null and sent_at is not null)
  ),
  unique (quote_id, kind, version_key),
  unique (idempotency_key)
);

create index crm_installer_delivery_ready_idx
  on public.crm_installer_delivery_outbox (status, available_at, created_at);
create index crm_installer_delivery_quote_idx
  on public.crm_installer_delivery_outbox (quote_id, created_at);

alter table public.crm_installer_delivery_outbox enable row level security;
revoke all on public.crm_installer_delivery_outbox from public, anon, authenticated;
grant all on public.crm_installer_delivery_outbox to service_role;
create policy "service role can manage installer delivery outbox"
  on public.crm_installer_delivery_outbox for all to service_role
  using (true) with check (true);

create function public.installer_delivery_quote_eligible(p_quote public.crm_quotes)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_quote.archived_at is null
    and lower(coalesce(p_quote.status, '')) in
      ('sold', 'approved', 'ordered', 'received', 'installed', 'invoiced', 'paid')
    and p_quote.signed_at is not null
    and not (p_quote.meta @> '{"historical_recordkeeping_only":true}'::jsonb)
    and not (p_quote.meta @> '{"no_external_notification":true}'::jsonb)
    and not (p_quote.meta @> '{"no_installer_form":true}'::jsonb)
    and exists (
      select 1
      from public.crm_jobs j
      where j.id = p_quote.job_id
        and coalesce(lower(j.source), '') <> 'mts_bookkeeping_import'
        and not (j.meta @> '{"historical_recordkeeping_only":true}'::jsonb)
        and not (j.meta @> '{"no_external_notification":true}'::jsonb)
        and lower(trim(j.customer_name)) !~ '(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)'
        and coalesce(lower(j.email), '') !~ '@(example\.com|test|local\.invalid)$'
    )
$$;

create function public.installer_delivery_enqueue_base_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.installer_delivery_quote_eligible(new) then
    insert into public.crm_installer_delivery_outbox(quote_id, kind, version_key)
    values(new.id, 'base_packet', 'base-v1')
    on conflict (quote_id, kind, version_key) do nothing;
  end if;
  return new;
end
$$;

create trigger crm_quotes_enqueue_installer_delivery
after insert or update of status, signed_at, sold_at, archived_at, meta, external_source
on public.crm_quotes
for each row execute function public.installer_delivery_enqueue_base_trigger();

create function public.installer_delivery_enqueue(
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
  select * into q from public.crm_quotes where id = p_quote_id;
  if not found or not public.installer_delivery_quote_eligible(q) then return null; end if;
  insert into public.crm_installer_delivery_outbox(quote_id, kind, version_key)
  values(p_quote_id, p_kind, p_version_key)
  on conflict (quote_id, kind, version_key) do update set updated_at = now()
  returning * into queued;
  return to_jsonb(queued);
end
$$;

create function public.installer_delivery_claim(p_quote_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_id uuid;
  claimed public.crm_installer_delivery_outbox;
begin
  -- A quote can be archived or acquire an exclusion after it was queued. Fail
  -- closed at claim time so a stale outbox row cannot contact MTS.
  update public.crm_installer_delivery_outbox o
  set status = 'blocked',
      failure_stage = 'form',
      last_error = 'Quote is archived or excluded from external installer delivery.',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where o.status not in ('accepted', 'sent', 'blocked')
    and (p_quote_id is null or o.quote_id = p_quote_id)
    and not exists (
      select 1 from public.crm_quotes q
      where q.id = o.quote_id and public.installer_delivery_quote_eligible(q)
    );

  -- Resend only guarantees idempotency-key replay for 24 hours. Once an
  -- uncertain attempt ages beyond that window, human provider reconciliation
  -- is required instead of a blind duplicate send.
  update public.crm_installer_delivery_outbox
  set status = 'blocked',
      failure_stage = 'send',
      last_error = 'Uncertain provider result exceeded the 24-hour Resend idempotency window; reconcile before retry.',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where status in ('uncertain', 'processing', 'retry')
    and provider_message_id is null
    and first_send_attempt_at is not null
    and first_send_attempt_at <= now() - interval '24 hours'
    and (status in ('uncertain', 'retry') or lease_expires_at <= now())
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

  if selected_id is null then return null; end if;

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

revoke all on function public.installer_delivery_quote_eligible(public.crm_quotes) from public, anon, authenticated;
revoke all on function public.installer_delivery_enqueue_base_trigger() from public, anon, authenticated;
revoke all on function public.installer_delivery_enqueue(uuid, text, text) from public, anon, authenticated;
revoke all on function public.installer_delivery_claim(uuid) from public, anon, authenticated;
grant execute on function public.installer_delivery_quote_eligible(public.crm_quotes) to service_role;
grant execute on function public.installer_delivery_enqueue(uuid, text, text) to service_role;
grant execute on function public.installer_delivery_claim(uuid) to service_role;
