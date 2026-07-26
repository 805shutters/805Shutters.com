create table if not exists public.visitor_alert_events (
  id uuid primary key default gen_random_uuid(),
  viewed_at timestamptz not null default now(),
  referrer text,
  location text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists visitor_alert_events_pending_idx
  on public.visitor_alert_events (viewed_at asc)
  where sent_at is null;

alter table public.visitor_alert_events enable row level security;
