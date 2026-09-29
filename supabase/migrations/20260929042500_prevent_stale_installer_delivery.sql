-- Prevent completed jobs and routine edits from generating installation packets.
create or replace function public.installer_delivery_quote_eligible(p_quote public.crm_quotes)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_quote.archived_at is null
    and lower(coalesce(p_quote.status, '')) in
      ('sold', 'approved', 'ordered', 'received', 'invoiced', 'paid')
    and p_quote.signed_at is not null
    and p_quote.installed_at is null
    and coalesce(p_quote.meta->'job_tracking'->>'stage', '') <> 'complete'
    and not exists (
      select 1 from public.crm_installer_forms f
      where f.quote_id = p_quote.id and f.status = 'completed'
    )
    and not (p_quote.meta @> '{"historical_recordkeeping_only":true}'::jsonb)
    and not (p_quote.meta @> '{"no_external_notification":true}'::jsonb)
    and not (p_quote.meta @> '{"no_installer_form":true}'::jsonb)
    and exists (
      select 1
      from public.crm_jobs j
      where j.id = p_quote.job_id
        and lower(coalesce(j.status, '')) not in ('installed', 'completed', 'closed', 'archived', 'lost')
        and coalesce(j.meta->'job_tracking'->>'stage', '') <> 'complete'
        and not (coalesce(j.meta, '{}'::jsonb) @> '{"no_installer_form":true}'::jsonb)
        and coalesce(lower(j.source), '') <> 'mts_bookkeeping_import'
        and not (j.meta @> '{"historical_recordkeeping_only":true}'::jsonb)
        and not (j.meta @> '{"no_external_notification":true}'::jsonb)
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
  -- Only the first signed-sale transition creates the automatic base packet.
  -- Edits, payment reconciliation, status progression, and date corrections on
  -- an existing sale must never backfill a missing historical installation email.
  if tg_op = 'UPDATE' then
    if old.signed_at is not null
      and lower(coalesce(old.status, '')) in
        ('sold', 'approved', 'ordered', 'received', 'installed', 'invoiced', 'paid')
    then return new; end if;
  end if;
  if public.installer_delivery_quote_eligible(new) then
    insert into public.crm_installer_delivery_outbox(quote_id, kind, version_key)
    values(new.id, 'base_packet', 'base-v1')
    on conflict (quote_id, kind, version_key) do nothing;
  end if;
  return new;
end
$$;

-- Quarantine unsent completed/excluded work, keeping accepted/sent evidence.
-- The existing claim RPC also applies the same eligibility check to retries.
update public.crm_installer_delivery_outbox o
set status = 'blocked', failure_stage = 'form',
    last_error = 'Completed or excluded job: installation delivery suppressed.',
    lease_token = null, lease_expires_at = null, updated_at = now()
where o.status in ('pending', 'retry', 'uncertain', 'processing')
  and o.provider_message_id is null
  and not exists (
    select 1 from public.crm_quotes q
    where q.id = o.quote_id and public.installer_delivery_quote_eligible(q)
  );
