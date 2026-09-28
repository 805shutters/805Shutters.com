-- Staff cancellation must never depend on Google or public booking availability.
-- Save related scheduling state in the same transaction as the calendar event.
create function booking_private.staff_calendar_change(
 p_event_id uuid, p_previous jsonb, p_action text, p_start_at timestamptz,
 p_end_at timestamptz, p_meta jsonb, p_actor_id uuid, p_actor_email text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 e public.crm_calendar_events; previous_event public.crm_calendar_events;
 before_days jsonb; affected record; after_signature jsonb;
 linked_job public.crm_jobs; form_row record; scheduling jsonb;
 canceling boolean := p_action='cancel'; legacy_id text;
begin
 if p_actor_id is null or trim(coalesce(p_actor_email,''))='' or p_actor_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
  raise exception 'BOOKING_ACTOR: authenticated staff attribution is required.';
 end if;
 if p_action not in ('cancel','reschedule') or p_action is null then raise exception 'Invalid calendar action'; end if;
 if not canceling and (p_start_at is null or p_end_at is null or p_end_at<=p_start_at or not isfinite(p_start_at) or not isfinite(p_end_at)) then
  raise exception 'Invalid appointment time range';
 end if;
 perform 1 from public.booking_schedule_state where id for update;
 select * into e from public.crm_calendar_events where id=p_event_id for update;
 if not found then raise exception 'BOOKING_MISSING: appointment missing'; end if;
 if to_jsonb(e) is distinct from p_previous then raise exception 'BOOKING_STALE: appointment changed; reload and retry.'; end if;
 if canceling and e.status='canceled' then return to_jsonb(e); end if;
 if e.status not in ('scheduled','rescheduled') then raise exception 'BOOKING_STATUS: only scheduled appointments can be changed'; end if;
 previous_event := e;
 select coalesce(jsonb_object_agg(p.event_id::text,booking_private.admin_day_signature((c.start_at at time zone 'America/Los_Angeles')::date)),'{}'::jsonb)
 into before_days from public.booking_route_protections p join public.booking_commitments c on c.id=p.event_id::text;

 -- Update the legacy source as well, or a later quote-dashboard edit resurrects
 -- the canceled visit / restores its old time. Its existing trigger mirrors here.
 legacy_id := e.meta->>'sales_805_appointment_id';
 if legacy_id is not null then
  if not canceling and (p_start_at at time zone 'America/Los_Angeles')::date <> (p_end_at at time zone 'America/Los_Angeles')::date then
   raise exception 'BOOKING_RANGE: legacy appointments must start and end on the same day';
  end if;
  update public.sales_805_appointments set
   status=case when canceling then 'cancelled' else 'scheduled' end,
   appointment_date=case when canceling then appointment_date else (p_start_at at time zone 'America/Los_Angeles')::date end,
   start_time=case when canceling then start_time else (p_start_at at time zone 'America/Los_Angeles')::time end,
   end_time=case when canceling then end_time else (p_end_at at time zone 'America/Los_Angeles')::time end,
   metadata=coalesce(metadata,'{}'::jsonb)||coalesce(e.meta,'{}'::jsonb)||coalesce(p_meta,'{}'::jsonb)
  where id::text=legacy_id;
 end if;
 update public.crm_calendar_events set
  start_at=case when canceling then previous_event.start_at else p_start_at end,
  end_at=case when canceling then previous_event.end_at else p_end_at end,
  status=case when canceling then 'canceled' else 'rescheduled' end,
  meta=coalesce(meta,'{}'::jsonb)||coalesce(p_meta,'{}'::jsonb)||case when canceling then '{}'::jsonb else jsonb_build_object('appointmentDurationMinutes',extract(epoch from (p_end_at-p_start_at))/60) end||jsonb_build_object(
   case when canceling then 'canceledBy' else 'rescheduledBy' end,lower(trim(p_actor_email)),
   'adminScheduleOverride',jsonb_build_object('actorUserId',p_actor_id,'actorEmail',lower(trim(p_actor_email)),
    'reason',case when canceling then 'staff_manual_cancel' else 'staff_manual_reschedule' end,
    'affectedStartAt',case when canceling then previous_event.start_at else p_start_at end,
    'affectedEndAt',case when canceling then previous_event.end_at else p_end_at end,'requestedAt',now()))
 where id=p_event_id returning * into e;

 if e.event_type='measure' and nullif(e.meta->>'technical_measure_form_id','') is not null then
  select * into form_row from public.crm_technical_measure_forms where id::text=e.meta->>'technical_measure_form_id' for update;
  if not found then raise exception 'BOOKING_LINK: technical measure form missing'; end if;
  -- An older visit must not reset a newer technical measure appointment.
  if coalesce(form_row.meta->'measure_scheduling'->>'calendar_event_id',e.id::text)=e.id::text then
   scheduling := coalesce(form_row.meta->'measure_scheduling','{}'::jsonb)||jsonb_build_object(
    'status',case when canceling then 'unscheduled' else 'scheduled' end,
    'scheduled_at',case when canceling then null else now() end,
    'scheduled_by',case when canceling then null else p_actor_email end,
    'scheduled_start_at',case when canceling then null else e.start_at end,
    'scheduled_end_at',case when canceling then null else e.end_at end,'calendar_event_id',e.id);
   update public.crm_technical_measure_forms set meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('measure_scheduling',scheduling) where id=form_row.id;
   update public.crm_jobs set meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('measure_needed',
    coalesce(meta->'measure_needed','{}'::jsonb)||(scheduling-'status')||jsonb_build_object('schedule_status',scheduling->>'status'))
   where id=form_row.job_id;
   if not found then raise exception 'BOOKING_LINK: technical measure job missing'; end if;
  end if;
 elsif e.job_id is not null and e.event_type<>'measure' and coalesce(e.meta->>'returnVisit','false')<>'true' then
  select * into linked_job from public.crm_jobs where id=e.job_id for update;
  -- Only this appointment owns these dates. Preserve other visits and sold state.
  if found and linked_job.appointment_start=previous_event.start_at and linked_job.appointment_end=previous_event.end_at then
   update public.crm_jobs set
    appointment_start=case when canceling then null else e.start_at end,
    appointment_end=case when canceling then null else e.end_at end,
    status=case when canceling and status='scheduled' then 'follow_up' else status end,
    next_action=case when canceling and status='scheduled' then 'Follow up after canceled appointment' else next_action end,
    next_action_due=case when canceling and status='scheduled' then null
     when not canceling and status='scheduled' and next_action_due=(previous_event.start_at at time zone 'America/Los_Angeles')::date
      then (e.start_at at time zone 'America/Los_Angeles')::date else next_action_due end
   where id=e.job_id;
  end if;
 end if;
 -- The exception covers only the exact itinerary resulting from this staff
 -- action. Public bookings still invalidate it and must pass all protections.
 for affected in select p.event_id,c.start_at from public.booking_route_protections p
  join public.booking_commitments c on c.id=p.event_id::text loop
  after_signature:=booking_private.admin_day_signature((affected.start_at at time zone 'America/Los_Angeles')::date);
  if affected.event_id=p_event_id or before_days->affected.event_id::text is distinct from after_signature then
   insert into public.booking_admin_schedule_overrides(event_id,schedule_signature,rescheduled_event_id,actor_user_id,actor_email)
   values(affected.event_id,after_signature,p_event_id,p_actor_id,lower(trim(p_actor_email)))
   on conflict(event_id) do update set schedule_signature=excluded.schedule_signature,
    rescheduled_event_id=excluded.rescheduled_event_id,actor_user_id=excluded.actor_user_id,
    actor_email=excluded.actor_email,created_at=now();
  end if;
 end loop;
 perform booking_private.validate_protections();
 return to_jsonb(e);
end $$;
revoke all on function booking_private.staff_calendar_change(uuid,jsonb,text,timestamptz,timestamptz,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function booking_private.staff_calendar_change(uuid,jsonb,text,timestamptz,timestamptz,jsonb,uuid,text) to service_role;

create or replace function public.booking_admin_reschedule(
 p_event_id uuid, p_previous jsonb, p_start_at timestamptz, p_end_at timestamptz,
 p_meta jsonb, p_actor_id uuid, p_actor_email text
) returns jsonb language sql security invoker set search_path='' as $$
 select booking_private.staff_calendar_change(p_event_id,p_previous,'reschedule',p_start_at,p_end_at,p_meta,p_actor_id,p_actor_email)
$$;
create function public.booking_admin_cancel(
 p_event_id uuid, p_previous jsonb, p_meta jsonb, p_actor_id uuid, p_actor_email text
) returns jsonb language sql security invoker set search_path='' as $$
 select booking_private.staff_calendar_change(p_event_id,p_previous,'cancel',null,null,p_meta,p_actor_id,p_actor_email)
$$;
revoke all on function public.booking_admin_cancel(uuid,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.booking_admin_cancel(uuid,jsonb,jsonb,uuid,text) to service_role;
