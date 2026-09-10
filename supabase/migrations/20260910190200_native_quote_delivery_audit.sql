-- Preserve each claim/outcome even when a definite failed attempt is retried.
create table public.sales_quote_v2_delivery_events (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references public.sales_quote_v2_delivery_attempts(id),
 created_at timestamptz not null default now(),
 previous_state text,
 receipt jsonb not null
);
alter table public.sales_quote_v2_delivery_events enable row level security;
revoke all on public.sales_quote_v2_delivery_events from public,anon,authenticated;
grant select,insert on public.sales_quote_v2_delivery_events to service_role;
create trigger native_delivery_event_append_only before update or delete on public.sales_quote_v2_delivery_events for each row execute function public.reject_v2_audit_mutation();
create function public.audit_native_quote_delivery_attempt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.sales_quote_v2_delivery_events(attempt_id,previous_state,receipt)
 values(new.id,case when tg_op='UPDATE' then old.state else null end,to_jsonb(new));
 return new;
end; $$;
create trigger native_delivery_attempt_audit after insert or update on public.sales_quote_v2_delivery_attempts for each row execute function public.audit_native_quote_delivery_attempt();
revoke all on function public.audit_native_quote_delivery_attempt() from public,anon,authenticated;

-- Restricted support operation: record independently verified provider evidence.
-- It never sends a message. Unknown/crashed sends remain unclaimable until this
-- explicit reconciliation; every before/after receipt is retained above.
create function public.reconcile_native_quote_delivery_attempt(
 p_attempt_id uuid,p_actor_id uuid,p_provider_id text,p_provider_accepted boolean,p_evidence_reference text
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare a public.sales_quote_v2_delivery_attempts%rowtype;
begin
 perform public.require_native_quote_actor(p_actor_id);
 if p_provider_accepted is null or nullif(btrim(p_provider_id),'') is null or length(btrim(p_evidence_reference))<8 or p_evidence_reference is null then
  raise exception 'Verified provider identity and evidence are required.' using errcode='22023'; end if;
 select * into a from public.sales_quote_v2_delivery_attempts where id=p_attempt_id for update;
 if not found or a.state not in ('sending','uncertain') then raise exception 'Only an unresolved attempt can be reconciled.' using errcode='40001'; end if;
 update public.sales_quote_v2_delivery_attempts set state='sending' where id=a.id;
 return public.finish_native_quote_delivery_attempt(a.id,p_actor_id,a.claim_token,
  jsonb_build_object('sent',p_provider_accepted,'providerId',p_provider_id,'uncertain',false,'reconciledBy',p_actor_id,'evidenceReference',p_evidence_reference));
end; $$;
revoke all on function public.reconcile_native_quote_delivery_attempt(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.reconcile_native_quote_delivery_attempt(uuid,uuid,text,boolean,text) to service_role;
