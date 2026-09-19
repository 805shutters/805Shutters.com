-- Forward-only evidence. Never infer historical closure from updated_at.
-- Financial projection flags older jobs without a closure date for review.
create or replace function public.crm_capture_payable_job_closure_time()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.meta := coalesce(new.meta, '{}'::jsonb) || jsonb_build_object('closedAt', clock_timestamp());
  end if;
  return new;
end;
$$;
drop trigger if exists crm_payable_job_closure_time on public.crm_jobs;
create trigger crm_payable_job_closure_time before insert or update of status
on public.crm_jobs for each row execute function public.crm_capture_payable_job_closure_time();
