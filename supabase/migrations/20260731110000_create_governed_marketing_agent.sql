-- Internal marketing-agent control room. This migration defines durable audit and
-- approval records only; it grants no permission to operate external systems or
-- to mutate leads, jobs, quotes, pricing, payments, or customer communications.
create table if not exists public.crm_marketing_agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  agent_id text not null,
  agent_version text not null,
  trigger_type text not null,
  status text not null default 'running',
  iteration_budget integer not null,
  iterations_used integer not null default 0,
  proposal_budget integer not null default 1,
  proposals_created integer not null default 0,
  runtime_budget_seconds integer not null,
  stop_reason text,
  source_snapshot jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  constraint crm_marketing_agent_runs_status_check check (status in ('running','completed','escalated','failed')),
  constraint crm_marketing_agent_runs_budget_check check (
    iteration_budget between 1 and 10 and iterations_used between 0 and iteration_budget
    and proposal_budget between 0 and 5 and proposals_created between 0 and proposal_budget
    and runtime_budget_seconds between 1 and 300
  )
);

create table if not exists public.crm_marketing_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  run_id uuid not null references public.crm_marketing_agent_runs(id) on delete restrict,
  proposal_type text not null,
  title text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  expected_metric text not null,
  status text not null default 'proposed',
  required_approvals text[] not null default '{}',
  expires_at timestamptz,
  execution_ref text,
  outcome jsonb not null default '{}'::jsonb,
  constraint crm_marketing_proposals_status_check check (status in ('proposed','approved','rejected','expired','executed','failed')),
  constraint crm_marketing_proposals_approvals_check check (
    required_approvals <@ array['spend_money','publish_content','modify_pricing','send_communication','write_crm','operate_external_account']::text[]
  )
);

create table if not exists public.crm_marketing_approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  proposal_id uuid not null references public.crm_marketing_proposals(id) on delete restrict,
  approval_kind text not null,
  decision text not null,
  decided_by_auth_user_id uuid references auth.users(id) on delete set null,
  decided_by_email text not null,
  rationale text,
  constraint crm_marketing_approvals_kind_check check (approval_kind in ('spend_money','publish_content','modify_pricing','send_communication','write_crm','operate_external_account')),
  constraint crm_marketing_approvals_decision_check check (decision in ('approved','rejected','revoked')),
  unique (proposal_id, approval_kind, created_at)
);

create table if not exists public.crm_marketing_agent_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run_id uuid references public.crm_marketing_agent_runs(id) on delete restrict,
  proposal_id uuid references public.crm_marketing_proposals(id) on delete restrict,
  event_type text not null,
  actor_type text not null,
  actor_email text,
  payload jsonb not null default '{}'::jsonb,
  previous_event_id bigint references public.crm_marketing_agent_events(id) on delete restrict
);

create index if not exists crm_marketing_agent_runs_created_idx on public.crm_marketing_agent_runs (created_at desc);
create index if not exists crm_marketing_proposals_status_idx on public.crm_marketing_proposals (status, created_at desc);
create index if not exists crm_marketing_events_run_idx on public.crm_marketing_agent_events (run_id, created_at);

drop trigger if exists crm_marketing_proposals_set_updated_at on public.crm_marketing_proposals;
create trigger crm_marketing_proposals_set_updated_at before update on public.crm_marketing_proposals
for each row execute function public.set_updated_at();

alter table public.crm_marketing_agent_runs enable row level security;
alter table public.crm_marketing_proposals enable row level security;
alter table public.crm_marketing_approvals enable row level security;
alter table public.crm_marketing_agent_events enable row level security;

create policy "service role can manage marketing runs" on public.crm_marketing_agent_runs for all to service_role using (true) with check (true);
create policy "service role can manage marketing proposals" on public.crm_marketing_proposals for all to service_role using (true) with check (true);
create policy "service role can manage marketing approvals" on public.crm_marketing_approvals for all to service_role using (true) with check (true);
create policy "service role can manage marketing events" on public.crm_marketing_agent_events for all to service_role using (true) with check (true);
