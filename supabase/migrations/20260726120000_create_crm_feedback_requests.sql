-- Durable, supervised Jessica -> Hermes -> Michael CRM feedback workflow.

create table if not exists public.crm_feedback_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_profiles(id) on delete set null,
  created_by_email text not null,
  title text not null,
  description text not null,
  status text not null default 'clarifying',
  revision integer not null default 1,
  hermes_assessment jsonb,
  proposed_work jsonb,
  verification_evidence jsonb,
  implementation_approved_at timestamptz,
  implementation_approved_by text,
  implementation_completed_at timestamptz,
  deployment_approved_at timestamptz,
  deployment_approved_by text,
  completed_at timestamptz,
  willie_message_id bigint,
  willie_notification_error text,
  constraint crm_feedback_requests_title_length check (char_length(btrim(title)) between 3 and 160),
  constraint crm_feedback_requests_description_length check (char_length(btrim(description)) between 10 and 10000),
  constraint crm_feedback_requests_status_check check (
    status in (
      'clarifying',
      'ready_for_implementation_approval',
      'implementation_approved',
      'implementing',
      'ready_for_deployment_approval',
      'deployment_approved',
      'deploying',
      'completed',
      'rejected'
    )
  )
);

create table if not exists public.crm_feedback_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references public.crm_feedback_requests(id) on delete cascade,
  author_type text not null,
  author_email text,
  body text not null,
  revision integer not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint crm_feedback_messages_author_check check (author_type in ('jessica', 'hermes', 'michael', 'system')),
  constraint crm_feedback_messages_body_length check (char_length(btrim(body)) between 1 and 10000)
);

create table if not exists public.crm_feedback_approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references public.crm_feedback_requests(id) on delete cascade,
  request_revision integer not null,
  approval_type text not null,
  approved_by text not null,
  telegram_chat_id text,
  telegram_callback_query_id text unique,
  telegram_message_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  constraint crm_feedback_approvals_type_check check (approval_type in ('implementation', 'deployment')),
  unique (request_id, request_revision, approval_type)
);

create index if not exists crm_feedback_requests_active_idx
  on public.crm_feedback_requests (status, updated_at desc);
create index if not exists crm_feedback_messages_request_idx
  on public.crm_feedback_messages (request_id, created_at asc);
create index if not exists crm_feedback_approvals_request_idx
  on public.crm_feedback_approvals (request_id, created_at asc);

drop trigger if exists crm_feedback_requests_set_updated_at on public.crm_feedback_requests;
create trigger crm_feedback_requests_set_updated_at
before update on public.crm_feedback_requests
for each row execute function public.set_updated_at();

alter table public.crm_feedback_requests enable row level security;
alter table public.crm_feedback_messages enable row level security;
alter table public.crm_feedback_approvals enable row level security;

drop policy if exists "service role can manage feedback requests" on public.crm_feedback_requests;
create policy "service role can manage feedback requests"
on public.crm_feedback_requests for all to service_role using (true) with check (true);

drop policy if exists "service role can manage feedback messages" on public.crm_feedback_messages;
create policy "service role can manage feedback messages"
on public.crm_feedback_messages for all to service_role using (true) with check (true);

drop policy if exists "service role can manage feedback approvals" on public.crm_feedback_approvals;
create policy "service role can manage feedback approvals"
on public.crm_feedback_approvals for all to service_role using (true) with check (true);
