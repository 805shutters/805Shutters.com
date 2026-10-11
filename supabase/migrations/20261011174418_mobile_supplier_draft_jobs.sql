-- A separate costing queue. Never feeds signed-contract/purchase/send queues.
create table public.crm_mobile_supplier_draft_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null check(account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'),
  owner_id uuid not null references public.crm_profiles(id),
  draft_id uuid not null,
  submission_version integer not null check(submission_version>0),
  request_id text not null check(length(request_id) between 1 and 200),
  spec_hash text not null check(spec_hash ~ '^[0-9a-f]{64}$'),
  specification jsonb not null check(jsonb_typeof(specification)='object'),
  state jsonb not null check(jsonb_typeof(state)='object'),
  revision bigint not null default 1 check(revision>0),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,request_id),
  unique(owner_id,draft_id,submission_version),
  check((lease_token is null)=(lease_until is null))
);
alter table public.crm_mobile_supplier_draft_jobs enable row level security;
revoke all on public.crm_mobile_supplier_draft_jobs from public, anon, authenticated;
grant select,insert,update on public.crm_mobile_supplier_draft_jobs to service_role;
-- Existing server authentication is required; no direct browser access or public RPC.
create function public.protect_mobile_supplier_draft_spec() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if (new.id,new.account_id,new.owner_id,new.draft_id,new.submission_version,new.request_id,new.spec_hash,new.specification,new.created_at)
    is distinct from (old.id,old.account_id,old.owner_id,old.draft_id,old.submission_version,old.request_id,old.spec_hash,old.specification,old.created_at) then
    raise exception 'Submitted supplier specification is immutable; create a new version.';
  end if;
  if old.state->>'phase'='complete' and new.state is distinct from old.state then
    raise exception 'Completed draft job is immutable.';
  end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function public.protect_mobile_supplier_draft_spec() from public,anon,authenticated;
create trigger immutable_mobile_supplier_spec before update on public.crm_mobile_supplier_draft_jobs
for each row execute function public.protect_mobile_supplier_draft_spec();
create index mobile_supplier_draft_job_owner on public.crm_mobile_supplier_draft_jobs(owner_id,created_at desc);
comment on table public.crm_mobile_supplier_draft_jobs is
  'Versioned submitted mobile specifications and resumable supplier-cost/customer DRAFT jobs. No purchase, send or payment authorization.';
