-- Queue only NEW manual appointments. No historical confirmation backfill.
-- Deployment does not authorize delivery: the application send gate defaults off.
create table public.appointment_customer_notifications (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.crm_calendar_events(id) on delete cascade,
 kind text not null check (kind in ('confirmation','reminder')),
 channel text not null check (channel in ('sms','email')),
 dedupe_key text not null,
 appointment_start timestamptz not null,
 status text not null default 'pending' check (status in ('pending','processing','accepted','skipped','failed','uncertain')),
 reason text,
 provider_id text,
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 completed_at timestamptz,
 unique(event_id,kind,channel,dedupe_key)
);
alter table public.appointment_customer_notifications enable row level security;
revoke all on public.appointment_customer_notifications from public,anon,authenticated;
grant all on public.appointment_customer_notifications to service_role;
create index appointment_customer_notifications_pending on public.appointment_customer_notifications(kind,created_at) where status='pending';

create function public.queue_manual_appointment_confirmation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.meta->'adminScheduleOverride'->>'reason'='staff_manual_create'
  and new.status in ('scheduled','rescheduled') and new.event_type not in ('block','measure') then
  insert into public.appointment_customer_notifications(event_id,kind,channel,dedupe_key,appointment_start)
   values(new.id,'confirmation','sms','new',new.start_at),(new.id,'confirmation','email','new',new.start_at)
   on conflict do nothing;
 end if;
 return new;
end $$;
create trigger queue_manual_appointment_confirmation after insert on public.crm_calendar_events
 for each row execute function public.queue_manual_appointment_confirmation();

-- Claim is atomic across overlapping workers. Never automatically replay an
-- interrupted provider call; acceptance may already have happened.
create function public.claim_appointment_notification(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare n public.appointment_customer_notifications;
begin
 update public.appointment_customer_notifications set status='processing',claimed_at=clock_timestamp()
  where id=p_id and status='pending' returning * into n;
 if not found then return null; end if;
 return to_jsonb(n);
end $$;

-- Activity rows appear in the CRM operational timeline, including missing
-- contacts and uncertain deliveries. State and audit commit together.
create function public.audit_appointment_notification() returns trigger
language plpgsql security invoker set search_path='' as $$
declare e public.crm_calendar_events; customer text;
begin
 if tg_op='UPDATE' and old.status=new.status then return new; end if;
 select * into e from public.crm_calendar_events where id=new.event_id;
 select customer_name into customer from public.crm_jobs where id=e.job_id;
 insert into public.crm_activity_events(actor_email,entity_type,entity_id,action,metadata)
 values('automation:805-appointment-notifications','calendar_event',new.event_id,
  'appointment_notification.'||new.status,jsonb_build_object(
   'customer_name',coalesce(customer,e.title),'jobId',e.job_id,'notificationId',new.id,
   'channel',new.channel,'kind',new.kind,'providerId',new.provider_id,
   'description','Customer '||new.kind||' '||upper(new.channel)||': '||new.status||coalesce(' — '||new.reason,'')));
 return new;
end $$;
create trigger audit_appointment_notification after insert or update on public.appointment_customer_notifications
 for each row execute function public.audit_appointment_notification();

revoke all on function public.queue_manual_appointment_confirmation(),public.claim_appointment_notification(uuid),public.audit_appointment_notification() from public,anon,authenticated;
grant execute on function public.queue_manual_appointment_confirmation(),public.claim_appointment_notification(uuid),public.audit_appointment_notification() to service_role;
