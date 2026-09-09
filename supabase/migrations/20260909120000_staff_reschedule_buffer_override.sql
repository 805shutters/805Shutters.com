-- Staff may explicitly waive only the extra 15-minute travel buffer on an
-- authenticated reschedule. The exception remains bound to exact adjacent
-- signatures; actual route time and every other calendar protection remain.
create table public.booking_travel_buffer_exceptions(
 id uuid primary key default gen_random_uuid(),
 from_event_id text not null,
 to_event_id text not null,
 from_signature jsonb not null,
 to_signature jsonb not null,
 rescheduled_event_id uuid not null references public.crm_calendar_events(id) on delete cascade,
 actor_user_id uuid not null,
 actor_email text not null,
 reason text not null check(reason='staff_reschedule_extra_buffer_override'),
 from_end_at timestamptz not null,
 to_start_at timestamptz not null,
 drive_seconds integer not null check(drive_seconds>=0),
 created_at timestamptz not null default now(),
 unique(from_event_id,to_event_id)
);
alter table public.booking_travel_buffer_exceptions enable row level security;
revoke all on public.booking_travel_buffer_exceptions from public,anon,authenticated;
grant all on public.booking_travel_buffer_exceptions to service_role;

create function booking_private.invalidate_buffer_exceptions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.start_at is distinct from old.start_at
    or new.end_at is distinct from old.end_at
    or new.assigned_to is distinct from old.assigned_to
    or new.event_type is distinct from old.event_type
    or new.location is distinct from old.location
    or new.status is distinct from old.status then
  delete from public.booking_travel_buffer_exceptions
  where rescheduled_event_id=old.id or from_event_id=old.id::text or to_event_id=old.id::text;
 end if;
 return null;
end $$;
create trigger booking_buffer_exception_invalidation
 after update of start_at,end_at,assigned_to,event_type,location,status on public.crm_calendar_events
 for each row execute function booking_private.invalidate_buffer_exceptions();

create function booking_private.invalidate_sales_buffer_exceptions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.appointment_date is distinct from old.appointment_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.assigned_to is distinct from old.assigned_to
    or new.customer_address is distinct from old.customer_address
    or new.status is distinct from old.status then
  delete from public.booking_travel_buffer_exceptions
  where from_event_id='sales:'||old.id::text or to_event_id='sales:'||old.id::text;
 end if;
 return null;
end $$;
create trigger booking_sales_buffer_exception_invalidation
 after update of appointment_date,start_time,end_time,assigned_to,customer_address,status on public.sales_805_appointments
 for each row execute function booking_private.invalidate_sales_buffer_exceptions();

create or replace function booking_private.validate_protections() returns void language plpgsql set search_path='' as $$
declare p record; e public.booking_commitments; neighbor public.booking_commitments; side text; leg jsonb; depart timestamptz; actual_arrive timestamptz; arrive timestamptz; deadline timestamptz; buffer_waived boolean;
begin
 if exists(select 1 from public.crm_calendar_events candidate left join public.crm_jobs j on j.id=candidate.job_id where candidate.created_at>=(select activated_at from public.booking_schedule_state where id) and lower(trim(candidate.status)) not in ('canceled','cancelled') and (j.source='self_booking' or candidate.meta->>'bookingSource'='website' or candidate.meta->>'bookingAuthority'='jessica_v1') and not exists(select 1 from public.booking_route_protections guard where guard.event_id=candidate.id)) then
  raise exception using errcode='P0001',message='BOOKING_UNGUARDED: public appointments require the atomic booking service.';
 end if;
 for p in select * from public.booking_route_protections loop
  select * into e from public.booking_commitments where id=p.event_id::text;
  if not found or lower(trim(e.status)) in ('canceled','cancelled') or e.end_at<now() then continue; end if;
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

create or replace function public.booking_schedule_snapshot(p_month text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; a timestamptz; b timestamptz;
begin
 if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month'; end if;
 a:=(p_month||'-01')::timestamp at time zone 'America/Los_Angeles'; b:=((p_month||'-01')::date+interval '1 month')::timestamp at time zone 'America/Los_Angeles';
 select revision into v from public.booking_schedule_state where id for share;
 return jsonb_build_object(
  'revision',v::text,
  'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.booking_commitments e where lower(trim(e.status)) not in ('canceled','cancelled') and (e.start_at is null or e.end_at is null or (e.start_at<b and e.end_at>a))),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(s)) from public.crm_availability_slots s where s.start_at<b and s.end_at>a),'[]'::jsonb),
  'protectedIds',coalesce((select jsonb_agg(event_id::text) from public.booking_route_protections),'[]'::jsonb),
  'bufferExceptions',coalesce((
   select jsonb_agg(jsonb_build_object('fromSignature',x.from_signature,'toSignature',x.to_signature))
   from public.booking_travel_buffer_exceptions x
   join public.booking_commitments f on f.id=x.from_event_id
   join public.booking_commitments t on t.id=x.to_event_id
   where x.from_signature=booking_private.signature(f)
     and x.to_signature=booking_private.signature(t)
     and lower(trim(f.status)) not in ('canceled','cancelled')
     and lower(trim(t.status)) not in ('canceled','cancelled')
     and (f.start_at<b and t.end_at>a)
  ),'[]'::jsonb)
 );
end $$;

create function public.booking_calendar_reschedule(
 p_revision text,
 p_event jsonb,
 p_proofs jsonb,
 p_allow_buffer_override boolean,
 p_actor_id uuid,
 p_actor_email text,
 p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; e public.crm_calendar_events; old_event public.crm_calendar_events; cursor_at timestamptz; w record; proof jsonb; moved_proof jsonb; protected_proofs jsonb; side text; leg jsonb; proof_event public.booking_commitments; neighbor public.booking_commitments; from_event public.booking_commitments; to_event public.booking_commitments; depart timestamptz; actual_arrive timestamptz; deadline timestamptz;
begin
 if p_allow_buffer_override is not true then raise exception using errcode='P0001',message='BOOKING_OVERRIDE: explicit buffer authorization is required.'; end if;
 if p_actor_id is null or trim(coalesce(p_actor_email,''))='' or p_actor_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or p_reason is distinct from 'staff_reschedule_extra_buffer_override' then raise exception using errcode='P0001',message='BOOKING_ACTOR: trusted staff attribution is required.'; end if;
 if jsonb_typeof(p_event)<>'object' or jsonb_typeof(p_proofs)<>'array' then raise exception 'Invalid reschedule payload'; end if;
 select revision into v from public.booking_schedule_state where id for update;
 if v::text<>p_revision then raise exception using errcode='P0001',message='BOOKING_STALE: calendar changed; reload and retry.'; end if;
 select * into e from public.crm_calendar_events where id=(p_event->>'id')::uuid;
 if not found then raise exception 'Appointment missing'; end if;
 old_event:=e;
 if lower(trim(old_event.status)) not in ('scheduled','rescheduled') then raise exception using errcode='P0001',message='BOOKING_CONFLICT: only scheduled appointments can be rescheduled.'; end if;
 if old_event.assigned_to is distinct from 'Jessica' or old_event.event_type='block' then raise exception using errcode='P0001',message='BOOKING_OVERRIDE: buffer override is limited to Jessica visits.'; end if;
 e.start_at:=(p_event->>'start_at')::timestamptz;
 e.end_at:=(p_event->>'end_at')::timestamptz;
 e.status:=p_event->>'status';
 e.meta:=coalesce(p_event->'meta',e.meta,'{}'::jsonb);
 if e.start_at is null or e.end_at is null or e.end_at<=e.start_at or e.status is distinct from 'rescheduled' then raise exception 'Invalid reschedule payload'; end if;
 if exists(select 1 from public.booking_commitments c where c.id<>e.id::text and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and (c.end_at is null or c.start_at is null or c.end_at<=c.start_at or (c.start_at<e.end_at and c.end_at>e.start_at))) then raise exception using errcode='P0001',message='BOOKING_CONFLICT: rescheduled appointment overlaps a commitment or incomplete record.'; end if;
 if exists(select 1 from public.booking_route_protections where event_id=e.id) then
  cursor_at:=e.start_at;
  for w in select start_at,end_at from public.crm_availability_slots where lower(trim(owner))='jessica' and status='available' and source='crm_working_ranges' and start_at<e.end_at and end_at>e.start_at order by start_at loop
   if w.start_at>cursor_at then exit; end if;
   cursor_at:=greatest(cursor_at,w.end_at);
  end loop;
  if cursor_at<e.end_at then raise exception 'BOOKING_CLOSED: publish working hours before moving this public consultation.'; end if;
 end if;
 update public.crm_calendar_events set start_at=e.start_at,end_at=e.end_at,status=e.status,meta=e.meta where id=e.id returning * into e;
 select value into moved_proof from jsonb_array_elements(p_proofs) where value->>'eventId'=e.id::text limit 1;
 if moved_proof is null or (select count(*) from jsonb_array_elements(p_proofs) where value->>'eventId'=e.id::text)<>1 then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: moved appointment requires one fresh route proof.'; end if;
 foreach side in array array['previous','next'] loop
  if side='previous' then
   select * into neighbor from public.booking_commitments c where c.id<>e.id::text and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date and c.end_at<=e.start_at order by c.end_at desc,c.id limit 1;
  else
   select * into neighbor from public.booking_commitments c where c.id<>e.id::text and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date and c.start_at>=e.end_at order by c.start_at,c.id limit 1;
  end if;
  leg:=moved_proof->side;
  if not found then
   if leg is distinct from 'null'::jsonb then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed.'; end if;
   continue;
  end if;
  if leg->>'id' is distinct from neighbor.id or leg->'signature' is distinct from booking_private.signature(neighbor) then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed; recheck driving time in CRM.'; end if;
 end loop;
 for proof in select value from jsonb_array_elements(p_proofs) loop
  if (proof->>'checkedAt')::timestamptz is null or (proof->>'checkedAt')::timestamptz<clock_timestamp()-interval '2 minutes' or (proof->>'checkedAt')::timestamptz>clock_timestamp()+interval '5 seconds' then raise exception using errcode='P0001',message='BOOKING_STALE: route evidence expired.'; end if;
 end loop;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into protected_proofs
 from jsonb_array_elements(p_proofs)
 where exists(select 1 from public.booking_route_protections guard where guard.event_id=(value->>'eventId')::uuid);
 perform booking_private.save_proofs(protected_proofs);
 delete from public.booking_travel_buffer_exceptions x where x.rescheduled_event_id=e.id or x.from_event_id=e.id::text or x.to_event_id=e.id::text;
 for proof in select value from jsonb_array_elements(p_proofs) loop
  select * into proof_event from public.booking_commitments where id=proof->>'eventId';
  if not found or proof->'signature' is distinct from booking_private.signature(proof_event) then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: route proof signature changed.'; end if;
  foreach side in array array['previous','next'] loop
   leg:=proof->side;
   if leg is null or leg='null'::jsonb then continue; end if;
   select * into neighbor from public.booking_commitments where id=leg->>'id';
   if not found or leg->'signature' is distinct from booking_private.signature(neighbor) then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed.'; end if;
   if side='previous' then from_event:=neighbor; to_event:=proof_event; else from_event:=proof_event; to_event:=neighbor; end if;
   if from_event.id<>e.id::text and to_event.id<>e.id::text then continue; end if;
   depart:=(leg->>'departureAt')::timestamptz;
   actual_arrive:=depart+make_interval(secs=>(leg->>'seconds')::double precision);
   deadline:=to_event.start_at;
   if depart is null or (leg->>'seconds')::numeric is null or (leg->>'seconds')::numeric<0 or depart<from_event.end_at or actual_arrive>deadline or trim(coalesce(from_event.location,''))='' or trim(coalesce(to_event.location,''))='' then raise exception using errcode='P0001',message='BOOKING_TRAVEL: actual driving time does not fit.'; end if;
   if exists(select 1 from public.booking_commitments c where c.event_type='block' and lower(trim(c.status)) not in ('canceled','cancelled') and c.start_at<actual_arrive and c.end_at>depart) then raise exception using errcode='P0001',message='BOOKING_TRAVEL: actual driving overlaps blocked time.'; end if;
   if actual_arrive+interval '15 minutes'>deadline then
    insert into public.booking_travel_buffer_exceptions(from_event_id,to_event_id,from_signature,to_signature,rescheduled_event_id,actor_user_id,actor_email,reason,from_end_at,to_start_at,drive_seconds)
    values(from_event.id,to_event.id,booking_private.signature(from_event),booking_private.signature(to_event),e.id,p_actor_id,lower(trim(p_actor_email)),p_reason,from_event.end_at,to_event.start_at,(leg->>'seconds')::integer)
    on conflict(from_event_id,to_event_id) do update set from_signature=excluded.from_signature,to_signature=excluded.to_signature,rescheduled_event_id=excluded.rescheduled_event_id,actor_user_id=excluded.actor_user_id,actor_email=excluded.actor_email,reason=excluded.reason,from_end_at=excluded.from_end_at,to_start_at=excluded.to_start_at,drive_seconds=excluded.drive_seconds,created_at=now();
   end if;
  end loop;
 end loop;
 perform booking_private.validate_protections();
 return to_jsonb(e);
end $$;

revoke all on function public.booking_calendar_reschedule(text,jsonb,jsonb,boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.booking_calendar_reschedule(text,jsonb,jsonb,boolean,uuid,text,text) to service_role;
revoke all on function booking_private.invalidate_buffer_exceptions(),booking_private.invalidate_sales_buffer_exceptions() from public,anon,authenticated;
grant execute on function booking_private.invalidate_buffer_exceptions(),booking_private.invalidate_sales_buffer_exceptions() to service_role;
