-- Ken's-cut payments + business payoff tracking.
--
-- Business is being purchased from Ken for a fixed payoff (default $500,000).
-- Ken is paid 10% of completed jobs (owner rule June 2026: "completed" = the
-- customer has paid in full). Every dollar paid to Ken counts toward the payoff.
--
-- crm_settings holds the payoff target and the opening balance (amount already
-- paid to Ken before this system existed). crm_ken_payments records each check
-- cut to Ken from here on. Payoff remaining = target - (opening + payments).

create table if not exists public.crm_settings (
  key text primary key,
  value numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.crm_settings (key, value) values
  ('payoff_target', 500000),
  ('ken_opening_balance', 0)
on conflict (key) do nothing;

create table if not exists public.crm_ken_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_on date,
  period_month date,
  amount numeric(12, 2) not null default 0,
  note text,
  created_by_email text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists crm_ken_payments_paid_on_idx
on public.crm_ken_payments (paid_on desc);

drop trigger if exists crm_settings_set_updated_at on public.crm_settings;
create trigger crm_settings_set_updated_at
before update on public.crm_settings
for each row
execute function public.set_updated_at();

drop trigger if exists crm_ken_payments_set_updated_at on public.crm_ken_payments;
create trigger crm_ken_payments_set_updated_at
before update on public.crm_ken_payments
for each row
execute function public.set_updated_at();

alter table public.crm_settings enable row level security;
alter table public.crm_ken_payments enable row level security;

drop policy if exists "service role can manage crm settings" on public.crm_settings;
create policy "service role can manage crm settings"
on public.crm_settings
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage crm ken payments" on public.crm_ken_payments;
create policy "service role can manage crm ken payments"
on public.crm_ken_payments
for all
to service_role
using (true)
with check (true);

-- Allow ken_payment + settings rows in the activity audit log.
alter table public.crm_activity_events drop constraint if exists crm_activity_events_entity_type_check;
alter table public.crm_activity_events
  add constraint crm_activity_events_entity_type_check check (
    entity_type in (
      'job',
      'quote',
      'bookkeeping_entry',
      'bookkeeping_payment',
      'expense',
      'calendar_event',
      'customer',
      'ken_payment',
      'settings',
      'session',
      'system'
    )
  );
