-- 50/50 Mike & Jessica profit split support.
--
-- Profit rules implemented in src/lib/crm/bookkeeping.ts:
-- * Net profit = total - COGS - Ken cut - installation invoice - job expenses.
-- * Every sold job's net profit splits 50/50 between Mike and Jessica,
--   regardless of who sold it. The assigned salesperson is tracked for
--   accountability and for the Ken-cut exemption below.
-- * Ken cut defaults to 10% of the sale total. Jobs sold on or after
--   2026-06-10 that are assigned to Jessica are exempt. Older rows keep the
--   historical 10% so legacy sheet math is unchanged.
-- * ken_cut_override pins an explicit dollar amount for one row when the
--   default rule is wrong (set 0 to waive entirely).

alter table public.crm_quote_bookkeeping_entries
  add column if not exists ken_cut_override numeric(12, 2);

-- Per-job expense line items so profit can be computed after ALL expenses
-- (credit card fees, permits, extra materials, repairs, etc.). A row links to
-- a bookkeeping entry, a quote, or a job - whichever exists for the sale.
create table if not exists public.crm_job_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bookkeeping_entry_id uuid references public.crm_quote_bookkeeping_entries(id) on delete cascade,
  quote_id uuid references public.crm_quotes(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete set null,
  label text not null,
  category text not null default 'other',
  amount numeric(12, 2) not null default 0,
  incurred_on date,
  notes text,
  source text not null default 'manual',
  meta jsonb not null default '{}'::jsonb,
  constraint crm_job_expenses_category_check check (
    category in (
      'materials',
      'installation_extra',
      'processing_fee',
      'permit',
      'repair',
      'referral',
      'other'
    )
  ),
  constraint crm_job_expenses_source_check check (
    source in ('crm_quote', 'legacy_sheet', 'manual')
  ),
  constraint crm_job_expenses_target_check check (
    bookkeeping_entry_id is not null or quote_id is not null or job_id is not null
  )
);

create index if not exists crm_job_expenses_entry_idx
on public.crm_job_expenses (bookkeeping_entry_id);

create index if not exists crm_job_expenses_quote_idx
on public.crm_job_expenses (quote_id);

create index if not exists crm_job_expenses_job_idx
on public.crm_job_expenses (job_id);

drop trigger if exists crm_job_expenses_set_updated_at on public.crm_job_expenses;
create trigger crm_job_expenses_set_updated_at
before update on public.crm_job_expenses
for each row
execute function public.set_updated_at();

alter table public.crm_job_expenses enable row level security;

drop policy if exists "service role can manage crm job expenses" on public.crm_job_expenses;
create policy "service role can manage crm job expenses"
on public.crm_job_expenses
for all
to service_role
using (true)
with check (true);

-- Allow expense rows in the activity audit log.
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
      'session',
      'system'
    )
  );
