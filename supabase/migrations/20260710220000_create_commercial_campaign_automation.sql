create table if not exists public.crm_commercial_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  account_type text not null,
  audience_statuses text[] not null default array['researching', 'ready']::text[],
  status text not null default 'draft',
  intro_subject text not null,
  intro_body text not null,
  follow_up_subject text not null,
  follow_up_body text not null,
  follow_up_delay_days integer not null default 5,
  daily_limit integer not null default 25,
  created_by text,
  launched_at timestamptz,
  paused_at timestamptz,
  last_run_at timestamptz,
  constraint crm_commercial_campaigns_status_check check (status in ('draft', 'active', 'paused', 'completed')),
  constraint crm_commercial_campaigns_account_type_check check (
    account_type in (
      'general_contractor', 'developer', 'architect_designer', 'school_district',
      'property_management', 'hospitality', 'healthcare', 'government', 'facilities',
      'window_covering_partner', 'commercial_real_estate', 'other'
    )
  ),
  constraint crm_commercial_campaigns_audience_statuses_check check (
    audience_statuses <@ array[
      'new', 'researching', 'ready', 'contacted', 'replied', 'meeting',
      'bid_invited', 'bidding', 'won', 'nurture', 'not_fit', 'do_not_contact'
    ]::text[] and cardinality(audience_statuses) > 0
  ),
  constraint crm_commercial_campaigns_delay_check check (follow_up_delay_days between 1 and 30),
  constraint crm_commercial_campaigns_daily_limit_check check (daily_limit between 1 and 100)
);

create table if not exists public.crm_commercial_campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.crm_commercial_campaigns(id) on delete cascade,
  account_id uuid not null references public.crm_commercial_accounts(id) on delete cascade,
  status text not null default 'queued',
  started_at timestamptz,
  intro_sent_at timestamptz,
  follow_up_sent_at timestamptz,
  next_send_at timestamptz,
  completed_at timestamptz,
  last_error text,
  constraint crm_commercial_campaign_enrollments_status_check check (
    status in ('queued', 'sent', 'replied', 'opted_out', 'completed', 'skipped', 'failed')
  ),
  constraint crm_commercial_campaign_enrollments_campaign_account_uidx unique (campaign_id, account_id)
);

create index if not exists crm_commercial_campaigns_status_idx
on public.crm_commercial_campaigns (status, updated_at desc);

create index if not exists crm_commercial_campaign_enrollments_due_idx
on public.crm_commercial_campaign_enrollments (campaign_id, status, next_send_at)
where status in ('queued', 'sent');

create index if not exists crm_commercial_campaign_enrollments_account_idx
on public.crm_commercial_campaign_enrollments (account_id, status);

drop trigger if exists crm_commercial_campaigns_set_updated_at on public.crm_commercial_campaigns;
create trigger crm_commercial_campaigns_set_updated_at
before update on public.crm_commercial_campaigns
for each row
execute function public.set_updated_at();

drop trigger if exists crm_commercial_campaign_enrollments_set_updated_at on public.crm_commercial_campaign_enrollments;
create trigger crm_commercial_campaign_enrollments_set_updated_at
before update on public.crm_commercial_campaign_enrollments
for each row
execute function public.set_updated_at();

alter table public.crm_commercial_campaigns enable row level security;
alter table public.crm_commercial_campaign_enrollments enable row level security;

drop policy if exists "service role can manage commercial campaigns" on public.crm_commercial_campaigns;
create policy "service role can manage commercial campaigns"
on public.crm_commercial_campaigns
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage commercial campaign enrollments" on public.crm_commercial_campaign_enrollments;
create policy "service role can manage commercial campaign enrollments"
on public.crm_commercial_campaign_enrollments
for all
to service_role
using (true)
with check (true);
