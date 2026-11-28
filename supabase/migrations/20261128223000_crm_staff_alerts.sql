-- Staff alert texts. Additive only.
-- Not applied to any database by the pull request that adds this file.
-- No drops, no changes to existing tables, and no foreign keys.

create table public.crm_staff_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null,
  customer text not null,
  job_number text not null,
  missing text[] not null,
  from_bot text not null,
  event_type text not null,
  dedupe_key text not null,
  deliver_at timestamptz,
  sent_at timestamptz,
  twilio_sids text[] not null default '{}',
  error text,
  claim_token uuid,
  claimed_at timestamptz,
  constraint crm_staff_alerts_status_check check (
    status in ('sent', 'held', 'deduped', 'rejected', 'failed')
  ),
  constraint crm_staff_alerts_customer_present check (length(btrim(customer)) > 0),
  constraint crm_staff_alerts_job_number_present check (length(btrim(job_number)) > 0),
  constraint crm_staff_alerts_from_bot_present check (length(btrim(from_bot)) > 0),
  constraint crm_staff_alerts_event_type_present check (length(btrim(event_type)) > 0),
  constraint crm_staff_alerts_dedupe_key_present check (length(btrim(dedupe_key)) > 0),
  constraint crm_staff_alerts_missing_present check (cardinality(missing) > 0),
  constraint crm_staff_alerts_held_has_deliver_at check (status <> 'held' or deliver_at is not null),
  constraint crm_staff_alerts_sent_has_sent_at check (status <> 'sent' or sent_at is not null),
  constraint crm_staff_alerts_sent_has_sid check (status <> 'sent' or cardinality(twilio_sids) > 0)
);

comment on table public.crm_staff_alerts is
  'Staff SMS alerts. Sale and contract-signing events are stored as rejected and are never sent. Service role only.';

comment on column public.crm_staff_alerts.dedupe_key is
  'SHA-256 of the normalized customer, job number, missing list, and event type.';

comment on column public.crm_staff_alerts.deliver_at is
  'When a quiet-hours alert may be sent. 7:00 AM America/Los_Angeles.';

comment on column public.crm_staff_alerts.claim_token is
  'Set when a worker claims a held row. A second claim does not send again.';

create index crm_staff_alerts_dedupe_idx
  on public.crm_staff_alerts (dedupe_key, created_at desc);

create index crm_staff_alerts_held_due_idx
  on public.crm_staff_alerts (deliver_at, id)
  where status = 'held' and claim_token is null;

create trigger crm_staff_alerts_set_updated_at
  before update on public.crm_staff_alerts
  for each row execute function public.set_updated_at();

alter table public.crm_staff_alerts enable row level security;
alter table public.crm_staff_alerts force row level security;

create policy crm_staff_alerts_service_role
  on public.crm_staff_alerts
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.crm_staff_alerts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.crm_staff_alerts to service_role;

-- One claim statement. Skip locked so two workers cannot take the same row.
create function public.claim_due_crm_staff_alerts(p_limit integer default 25)
returns setof public.crm_staff_alerts
language sql
security invoker
set search_path = ''
as $$
  update public.crm_staff_alerts as alert
  set claim_token = gen_random_uuid(),
      claimed_at = now(),
      updated_at = now()
  where alert.id in (
    select due.id
    from public.crm_staff_alerts as due
    where due.status = 'held'
      and due.deliver_at is not null
      and due.deliver_at <= now()
      and due.claim_token is null
    order by due.deliver_at, due.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  returning alert.*;
$$;

revoke all on function public.claim_due_crm_staff_alerts(integer) from public, anon, authenticated;
grant execute on function public.claim_due_crm_staff_alerts(integer) to service_role;

notify pgrst, 'reload schema';
