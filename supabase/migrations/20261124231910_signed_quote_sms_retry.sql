-- A signature and its recovery ticket commit together. No historical replay.
create table public.crm_signed_sms_retry (
  quote_id uuid primary key references public.crm_quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','retry','complete','blocked','suppressed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now() + interval '2 minutes',
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text
);
alter table public.crm_signed_sms_retry enable row level security;
revoke all on public.crm_signed_sms_retry from public, anon, authenticated;
grant select, insert, update, delete on public.crm_signed_sms_retry to service_role;
create policy service_role_signed_sms_retry on public.crm_signed_sms_retry
  for all to service_role using (true) with check (true);
create index crm_signed_sms_retry_due on public.crm_signed_sms_retry (available_at)
  where status in ('pending','retry','processing');

create function public.enqueue_signed_sms_retry(p_quote_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_signed_sms_retry (quote_id)
  select q.id from public.crm_quotes q
  where q.id = p_quote_id and q.signed_at is not null
    and nullif(btrim(q.customer_signature), '') is not null
    and q.archived_at is null and q.status not in ('archived','lost')
    and coalesce(q.meta->>'no_external_notification','false') <> 'true'
    and coalesce(q.meta->>'historical_recordkeeping_only','false') <> 'true'
    and coalesce(q.meta->>'sold_sms_suppressed','false') <> 'true'
    and exists (select 1 from public.crm_jobs j where j.id=q.job_id
      and coalesce(j.source,'') <> 'mts_bookkeeping_import'
      and coalesce(j.meta->>'no_external_notification','false') <> 'true'
      and coalesce(j.meta->>'historical_recordkeeping_only','false') <> 'true')
  on conflict (quote_id) do nothing;
  return found;
end;
$$;
create function public.enqueue_signed_sms_retry_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.signed_at is not null and nullif(btrim(new.customer_signature),'') is not null then
    if TG_OP = 'INSERT' then
      perform public.enqueue_signed_sms_retry(new.id);
    elsif old.signed_at is null or nullif(btrim(old.customer_signature),'') is null then
      perform public.enqueue_signed_sms_retry(new.id);
    end if;
  end if;
  return new;
end;
$$;
create trigger crm_quotes_signed_sms_retry after insert or update of signed_at, customer_signature
on public.crm_quotes for each row execute function public.enqueue_signed_sms_retry_trigger();

create function public.claim_signed_sms_retry() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare claimed public.crm_signed_sms_retry;
begin
  select * into claimed from public.crm_signed_sms_retry
  where (status in ('pending','retry') and available_at <= now())
     or (status = 'processing' and lease_expires_at < now())
  order by available_at, quote_id for update skip locked limit 1;
  if not found then return null; end if;
  update public.crm_signed_sms_retry set status='processing', attempts=attempts+1,
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '5 minutes', updated_at=now()
    where quote_id=claimed.quote_id returning * into claimed;
  return to_jsonb(claimed);
end;
$$;
revoke all on function public.enqueue_signed_sms_retry(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_signed_sms_retry_trigger() from public, anon, authenticated;
revoke all on function public.claim_signed_sms_retry() from public, anon, authenticated;
grant execute on function public.enqueue_signed_sms_retry(uuid) to service_role;
grant execute on function public.claim_signed_sms_retry() to service_role;
notify pgrst, 'reload schema';
