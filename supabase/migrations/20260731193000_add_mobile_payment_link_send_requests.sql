-- Durable idempotency and truthful provider state for explicitly confirmed
-- mobile Square payment-link sends. This table records requests only; it does
-- not schedule work or permit unauthenticated writes.
create table if not exists public.crm_payment_link_send_requests (
  idempotency_key uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  job_id uuid not null references public.crm_jobs(id) on delete cascade,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  payment_type text not null check (payment_type in ('deposit', 'balance')),
  channel text not null check (channel in ('email', 'text')),
  recipient text not null,
  amount numeric(12,2),
  square_payment_link_id text,
  square_payment_link_url text,
  status text not null check (status in ('sending', 'accepted', 'failed', 'unknown')),
  provider_message_id text,
  provider_status text,
  error_message text
);

create index if not exists crm_payment_link_send_requests_quote_idx
on public.crm_payment_link_send_requests (quote_id, created_at desc);

alter table public.crm_payment_link_send_requests enable row level security;
revoke all on table public.crm_payment_link_send_requests from public, anon, authenticated;
grant select, insert, update on table public.crm_payment_link_send_requests to service_role;

drop policy if exists "service role can manage payment link send requests"
on public.crm_payment_link_send_requests;
create policy "service role can manage payment link send requests"
on public.crm_payment_link_send_requests
for all to service_role
using (true)
with check (true);
