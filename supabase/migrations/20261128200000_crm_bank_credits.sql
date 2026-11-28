-- Mercury check deposits. Additive only.
-- Not applied to any database by the pull request that adds this file.
-- No drops, no changes to existing tables, and no foreign keys (a new
-- reference would change delete behavior on quotes and payments).
-- The live crm_quote_bookkeeping_payments_cfo_ledger trigger already
-- enqueues a ledger event when a payment row is inserted.

create table public.crm_bank_credits (
  id uuid primary key default gen_random_uuid(),
  mercury_transaction_id text not null,
  account_id text,
  amount numeric(12, 2) not null,
  posted_at timestamptz,
  created_at_mercury timestamptz,
  status text,
  counterparty_name text,
  kind text,
  last_event_id text,
  raw jsonb not null default '{}'::jsonb,
  match_status text not null default 'unmatched',
  matched_quote_id uuid,
  matched_payment_id uuid,
  matched_at timestamptz,
  owner_alerted_for text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_bank_credits_transaction_id_present check (length(btrim(mercury_transaction_id)) > 0),
  constraint crm_bank_credits_amount_positive check (amount > 0),
  constraint crm_bank_credits_match_status_check check (
    match_status in ('unmatched', 'matched', 'needs_review', 'reversed')
  ),
  constraint crm_bank_credits_owner_alert_check check (
    owner_alerted_for is null or owner_alerted_for in ('needs_review', 'reversed')
  )
);

comment on table public.crm_bank_credits is
  'Incoming Mercury credits (amount > 0). Check deposits may match one open quote. Service role only.';

comment on column public.crm_bank_credits.raw is
  'Merged Mercury transaction mergePatch (JSON Merge Patch, RFC 7396).';

comment on column public.crm_bank_credits.owner_alerted_for is
  'Last match_status Mike was texted about, so a retry does not send a second owner text.';

create unique index crm_bank_credits_mercury_transaction_id_idx
  on public.crm_bank_credits (mercury_transaction_id);

create index crm_bank_credits_needs_review_idx
  on public.crm_bank_credits (created_at)
  where match_status = 'needs_review';

create trigger crm_bank_credits_set_updated_at
  before update on public.crm_bank_credits
  for each row execute function public.set_updated_at();

alter table public.crm_bank_credits enable row level security;
alter table public.crm_bank_credits force row level security;

create policy crm_bank_credits_service_role
  on public.crm_bank_credits
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.crm_bank_credits from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.crm_bank_credits to service_role;

-- Event ids Mercury has already applied. A second delivery of the same id
-- must not post another payment or send another owner text.
create table public.crm_mercury_events (
  id text primary key,
  event_type text not null,
  resource_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  lease_until timestamptz,
  constraint crm_mercury_events_id_present check (length(btrim(id)) > 0),
  constraint crm_mercury_events_type_present check (length(btrim(event_type)) > 0)
);

comment on table public.crm_mercury_events is
  'Mercury webhook event ids. processed_at set means the delivery had its one effect.';

alter table public.crm_mercury_events enable row level security;
alter table public.crm_mercury_events force row level security;

create policy crm_mercury_events_service_role
  on public.crm_mercury_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.crm_mercury_events from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.crm_mercury_events to service_role;

notify pgrst, 'reload schema';
