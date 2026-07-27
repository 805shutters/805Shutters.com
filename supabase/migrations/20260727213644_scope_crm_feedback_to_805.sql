alter table public.crm_feedback_requests
  add column if not exists company_scope text not null default '805';
alter table public.crm_feedback_messages
  add column if not exists company_scope text not null default '805';
alter table public.crm_feedback_approvals
  add column if not exists company_scope text not null default '805';

alter table public.crm_feedback_requests
  drop constraint if exists crm_feedback_requests_company_scope_check;
alter table public.crm_feedback_requests
  add constraint crm_feedback_requests_company_scope_check check (company_scope = '805');
alter table public.crm_feedback_messages
  drop constraint if exists crm_feedback_messages_company_scope_check;
alter table public.crm_feedback_messages
  add constraint crm_feedback_messages_company_scope_check check (company_scope = '805');
alter table public.crm_feedback_approvals
  drop constraint if exists crm_feedback_approvals_company_scope_check;
alter table public.crm_feedback_approvals
  add constraint crm_feedback_approvals_company_scope_check check (company_scope = '805');

create index if not exists crm_feedback_requests_company_queue_idx
  on public.crm_feedback_requests (company_scope, status, updated_at);

drop function if exists public.claim_crm_feedback_request(uuid, integer, text);
create or replace function public.claim_crm_feedback_request(
  p_request_id uuid,
  p_revision integer,
  p_claimed_by text,
  p_company_scope text
)
returns setof public.crm_feedback_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_scope <> '805' then
    return;
  end if;

  return query
  update public.crm_feedback_requests as request
  set
    hermes_claim_token = case
      when request.hermes_claimed_by = p_claimed_by
        and request.hermes_claim_token is not null
      then request.hermes_claim_token
      else gen_random_uuid()
    end,
    hermes_claimed_at = now(),
    hermes_claimed_by = p_claimed_by
  where request.id = p_request_id
    and request.revision = p_revision
    and request.company_scope = p_company_scope
    and (
      (
        request.status in ('clarifying', 'implementation_approved', 'deployment_approved')
        and (
          request.hermes_claim_token is null
          or request.hermes_claimed_at is null
          or request.hermes_claimed_at <= now() - interval '10 minutes'
          or request.hermes_claimed_by = p_claimed_by
        )
      )
      or (
        request.status in ('implementing', 'deploying')
        and request.hermes_claim_token is not null
        and request.hermes_claimed_by = p_claimed_by
      )
    )
  returning request.*;
end;
$$;

revoke all on function public.claim_crm_feedback_request(uuid, integer, text, text) from public;
grant execute on function public.claim_crm_feedback_request(uuid, integer, text, text) to service_role;
