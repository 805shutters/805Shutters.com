-- Extend staff-authoritative scheduling to New Appointment. Public RPCs and
-- validators remain unchanged; exceptions apply only to the resulting itinerary.
create function public.booking_admin_create(
 p_event jsonb, p_actor_id uuid, p_actor_email text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.crm_calendar_events; before_days jsonb; affected record; after_signature jsonb;
begin
 if p_actor_id is null or trim(coalesce(p_actor_email,''))='' or p_actor_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
  raise exception 'BOOKING_ACTOR: authenticated staff attribution is required.';
 end if;
 e:=jsonb_populate_record(null::public.crm_calendar_events,p_event);
 if e.start_at is null or e.end_at is null or not isfinite(e.start_at) or not isfinite(e.end_at) or e.end_at<=e.start_at then
  raise exception 'Invalid appointment time range';
 end if;
 if trim(coalesce(e.title,''))='' then raise exception 'Appointment title is required'; end if;
 perform 1 from public.booking_schedule_state where id for update;
 select coalesce(jsonb_object_agg(p.event_id::text,booking_private.admin_day_signature((c.start_at at time zone 'America/Los_Angeles')::date)),'{}'::jsonb)
 into before_days from public.booking_route_protections p join public.booking_commitments c on c.id=p.event_id::text;
 insert into public.crm_calendar_events(job_id,title,event_type,status,assigned_to,start_at,end_at,location,notes,meta)
 values(e.job_id,e.title,coalesce(e.event_type,'sales_consult'),coalesce(e.status,'scheduled'),coalesce(e.assigned_to,'Unassigned'),e.start_at,e.end_at,e.location,e.notes,
  coalesce(e.meta,'{}'::jsonb)||jsonb_build_object('adminScheduleOverride',jsonb_build_object(
   'actorUserId',p_actor_id,'actorEmail',lower(trim(p_actor_email)),'reason','staff_manual_create',
   'affectedStartAt',e.start_at,'affectedEndAt',e.end_at,'requestedAt',now()))) returning * into e;
 -- Staff may add a visit to a job originally received through public booking.
 -- Keep that event protected, with a staff exception for this exact itinerary.
 if exists(select 1 from public.crm_jobs j where j.id=e.job_id and j.source='self_booking')
   or e.meta->>'bookingSource'='website' or e.meta->>'bookingAuthority'='jessica_v1' then
  insert into public.booking_route_protections(event_id,proof) values(e.id,'{}'::jsonb);
 end if;
 for affected in select p.event_id,c.start_at from public.booking_route_protections p
  join public.booking_commitments c on c.id=p.event_id::text loop
  after_signature:=booking_private.admin_day_signature((affected.start_at at time zone 'America/Los_Angeles')::date);
  if before_days->affected.event_id::text is distinct from after_signature then
   insert into public.booking_admin_schedule_overrides(event_id,schedule_signature,rescheduled_event_id,actor_user_id,actor_email)
   values(affected.event_id,after_signature,e.id,p_actor_id,lower(trim(p_actor_email)))
   on conflict(event_id) do update set schedule_signature=excluded.schedule_signature,
    rescheduled_event_id=excluded.rescheduled_event_id,actor_user_id=excluded.actor_user_id,
    actor_email=excluded.actor_email,created_at=now();
  end if;
 end loop;
 perform booking_private.validate_protections();
 return to_jsonb(e);
end $$;
revoke all on function public.booking_admin_create(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.booking_admin_create(jsonb,uuid,text) to service_role;
