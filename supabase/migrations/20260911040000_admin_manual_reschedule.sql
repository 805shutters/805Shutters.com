-- Manual CRM rescheduling is staff-authoritative. Keep public route protections
-- and scope each approved exception to the exact resulting day's commitments.
create table public.booking_admin_schedule_overrides (
 event_id uuid primary key references public.crm_calendar_events(id) on delete cascade,
 schedule_signature jsonb not null,
 rescheduled_event_id uuid not null,
 actor_user_id uuid not null,
 actor_email text not null,
 created_at timestamptz not null default now()
);
alter table public.booking_admin_schedule_overrides enable row level security;
revoke all on public.booking_admin_schedule_overrides from public,anon,authenticated;
grant all on public.booking_admin_schedule_overrides to service_role;

create function booking_private.admin_day_signature(p_day date) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(booking_private.signature(c) order by c.id),'[]'::jsonb)
 from public.booking_commitments c
 where lower(trim(c.status)) not in ('canceled','cancelled')
 and (c.start_at is null or c.end_at is null or c.end_at<=c.start_at
   or (c.start_at < ((p_day+1)::timestamp at time zone 'America/Los_Angeles')
     and c.end_at > (p_day::timestamp at time zone 'America/Los_Angeles')))
$$;
revoke all on function booking_private.admin_day_signature(date) from public,anon,authenticated;
grant execute on function booking_private.admin_day_signature(date) to service_role;

create or replace function booking_private.validate_protections() returns void language plpgsql set search_path='' as $$
declare p record; e public.booking_commitments; neighbor public.booking_commitments; side text; leg jsonb; depart timestamptz; actual_arrive timestamptz; arrive timestamptz; deadline timestamptz; buffer_waived boolean;
begin
 if exists(select 1 from public.crm_calendar_events candidate left join public.crm_jobs j on j.id=candidate.job_id where candidate.created_at>=(select activated_at from public.booking_schedule_state where id) and lower(trim(candidate.status)) not in ('canceled','cancelled') and (j.source='self_booking' or candidate.meta->>'bookingSource'='website' or candidate.meta->>'bookingAuthority'='jessica_v1') and not exists(select 1 from public.booking_route_protections guard where guard.event_id=candidate.id)) then
  raise exception using errcode='P0001',message='BOOKING_UNGUARDED: public appointments require the atomic booking service.';
 end if;
 for p in select * from public.booking_route_protections loop
  select * into e from public.booking_commitments where id=p.event_id::text;
  if not found or lower(trim(e.status)) in ('canceled','cancelled') or e.end_at<now() then continue; end if;
  -- Only the exact itinerary saved by staff is exempt. A new public booking
  -- changes this signature and must pass the original checks below.
  if exists(select 1 from public.booking_admin_schedule_overrides o
    where o.event_id=p.event_id
      and o.schedule_signature=booking_private.admin_day_signature((e.start_at at time zone 'America/Los_Angeles')::date)) then continue; end if;
  if e.assigned_to is distinct from 'Jessica' then raise exception 'BOOKING_CONFLICT: protected public consultations belong to Jessica.'; end if;
  if (select count(*) from public.booking_commitments c where lower(trim(c.status)) not in ('canceled','cancelled') and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date)>4 then raise exception 'BOOKING_FULL: protected day exceeds four appointments.'; end if;
  if p.proof->'signature' is distinct from booking_private.signature(e) then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: appointment changed; use CRM scheduling to recheck driving time.'; end if;
  if exists(select 1 from public.booking_commitments c where c.id<>e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and (c.end_at is null or c.start_at is null or c.end_at<=c.start_at or (c.start_at<e.end_at and c.end_at>e.start_at))) then raise exception using errcode='P0001',message='BOOKING_CONFLICT: protected appointment overlaps a commitment or incomplete record.'; end if;
  foreach side in array array['previous','next'] loop
   if side='previous' then
    select * into neighbor from public.booking_commitments c where c.id<>e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date and c.end_at<=e.start_at order by c.end_at desc,c.id limit 1;
   else
    select * into neighbor from public.booking_commitments c where c.id<>e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date and c.start_at>=e.end_at order by c.start_at,c.id limit 1;
   end if;
   leg:=p.proof->side;
   if not found then
    if leg is distinct from 'null'::jsonb then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed.'; end if;
    continue;
   end if;
   if leg->'signature' is distinct from booking_private.signature(neighbor) or leg->>'id' is distinct from neighbor.id then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed; recheck driving time in CRM.'; end if;
   depart:=(leg->>'departureAt')::timestamptz;
   actual_arrive:=depart+make_interval(secs=>(leg->>'seconds')::double precision);
   deadline:=case when side='previous' then e.start_at else neighbor.start_at end;
   buffer_waived:=exists(
    select 1 from public.booking_travel_buffer_exceptions x
    where x.from_event_id=case when side='previous' then neighbor.id else e.id end
      and x.to_event_id=case when side='previous' then e.id else neighbor.id end
      and x.from_signature=booking_private.signature(case when side='previous' then neighbor else e end)
      and x.to_signature=booking_private.signature(case when side='previous' then e else neighbor end)
   );
   arrive:=actual_arrive+case when buffer_waived then interval '0' else interval '15 minutes' end;
   if depart is null or (leg->>'seconds')::numeric is null or (leg->>'seconds')::numeric<0 or depart<(case when side='previous' then neighbor.end_at else e.end_at end) or actual_arrive>deadline or arrive>deadline or trim(coalesce(e.location,''))='' or trim(coalesce(neighbor.location,''))='' then raise exception using errcode='P0001',message='BOOKING_TRAVEL: insufficient driving time.'; end if;
   if exists(select 1 from public.booking_commitments c where c.event_type='block' and lower(trim(c.status)) not in ('canceled','cancelled') and c.start_at<arrive and c.end_at>depart) then raise exception using errcode='P0001',message='BOOKING_TRAVEL: driving overlaps blocked time.'; end if;
  end loop;
 end loop;
end $$;

create function public.booking_admin_reschedule(
 p_event_id uuid, p_previous jsonb, p_start_at timestamptz, p_end_at timestamptz,
 p_meta jsonb, p_actor_id uuid, p_actor_email text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.crm_calendar_events; before_days jsonb; affected record; after_signature jsonb;
begin
 if p_actor_id is null or trim(coalesce(p_actor_email,''))='' or p_actor_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
  raise exception 'BOOKING_ACTOR: authenticated staff attribution is required.';
 end if;
 if p_start_at is null or p_end_at is null or p_end_at<=p_start_at then raise exception 'Invalid appointment time range'; end if;
 -- Same lock order as all public/legacy calendar writes; reject stale edits.
 perform 1 from public.booking_schedule_state where id for update;
 select * into e from public.crm_calendar_events where id=p_event_id for update;
 if not found then raise exception 'Appointment missing'; end if;
 if to_jsonb(e) is distinct from p_previous then raise exception 'BOOKING_STALE: appointment changed; reload and retry.'; end if;
 if e.status not in ('scheduled','rescheduled') then raise exception 'Only scheduled appointments can be rescheduled'; end if;
 select coalesce(jsonb_object_agg(p.event_id::text,booking_private.admin_day_signature((c.start_at at time zone 'America/Los_Angeles')::date)),'{}'::jsonb)
 into before_days from public.booking_route_protections p join public.booking_commitments c on c.id=p.event_id::text;
 update public.crm_calendar_events set start_at=p_start_at,end_at=p_end_at,status='rescheduled',
  meta=coalesce(p_meta,'{}'::jsonb)||jsonb_build_object('adminScheduleOverride',jsonb_build_object(
   'actorUserId',p_actor_id,'actorEmail',lower(trim(p_actor_email)),'reason','staff_manual_reschedule',
   'affectedStartAt',p_start_at,'affectedEndAt',p_end_at,'requestedAt',now()))
 where id=p_event_id returning * into e;
 -- Include protected neighbors on both the old and new days, even when moving
 -- an unprotected staff visit or a block. Metadata-only writes remain possible.
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
revoke all on function public.booking_admin_reschedule(uuid,jsonb,timestamptz,timestamptz,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.booking_admin_reschedule(uuid,jsonb,timestamptz,timestamptz,jsonb,uuid,text) to service_role;
