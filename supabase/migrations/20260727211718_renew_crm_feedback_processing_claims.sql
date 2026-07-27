-- Allow the current worker to renew an exact claim while approved work is running.
-- New claims remain limited to queue-eligible approval states.
create or replace function public.claim_crm_feedback_request(
  p_request_id uuid,
  p_revision integer,
  p_claimed_by text
)
returns setof public.crm_feedback_requests
language plpgsql
security definer
set search_path = public
as $$
begin
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

revoke all on function public.claim_crm_feedback_request(uuid, integer, text) from public;
grant execute on function public.claim_crm_feedback_request(uuid, integer, text) to service_role;
