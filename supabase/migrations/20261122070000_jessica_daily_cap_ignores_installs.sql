-- Jessica's public daily cap counts only commitments that affect her.
-- Install events never consume a consultation slot, including an install
-- assigned to Jessica. Signature, grants, locking, and every other check stay
-- the same. This file is additive and was not applied to production here.

create or replace function booking_private.validate_protections() returns void language plpgsql set search_path='' as $$
declare p record; e public.booking_commitments; neighbor public.booking_commitments; side text; leg jsonb; depart timestamptz; actual_arrive timestamptz; arrive timestamptz; deadline timestamptz; buffer_waived boolean; route_override boolean;
begin
 route_override := booking_private.manual_override_active();
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
  if (select count(*) from public.booking_commitments c where lower(trim(c.status)) not in ('canceled','cancelled') and c.event_type<>'block' and c.event_type<>'install' and booking_private.affects_jessica(c) and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date)>4 then raise exception 'BOOKING_FULL: protected day exceeds four appointments.'; end if;
  if p.proof->'signature' is distinct from booking_private.signature(e) and not route_override then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: appointment changed; use CRM scheduling to recheck driving time.'; end if;
  if exists(select 1 from public.booking_commitments c where c.id<>e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and (c.end_at is null or c.start_at is null or c.end_at<=c.start_at or (c.start_at<e.end_at and c.end_at>e.start_at))) then raise exception using errcode='P0001',message='BOOKING_CONFLICT: protected appointment overlaps a commitment or incomplete record.'; end if;
  foreach side in array array['previous','next'] loop
   if side='previous' then
    select * into neighbor from public.booking_commitments c where c.id<>e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date and c.end_at<=e.start_at order by c.end_at desc,c.id limit 1;
   else
    select * into neighbor from public.booking_commitments c where c.id<>e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date and c.start_at>=e.end_at order by c.start_at,c.id limit 1;
   end if;
   leg:=p.proof->side;
   if not found then
    if leg is distinct from 'null'::jsonb and not route_override then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed.'; end if;
    continue;
   end if;
   if leg->'signature' is distinct from booking_private.signature(neighbor) or leg->>'id' is distinct from neighbor.id then
    if not route_override then raise exception using errcode='P0001',message='BOOKING_ROUTE_RECHECK: neighboring appointment changed; recheck driving time in CRM.'; end if;
    continue;
   end if;
   depart:=(leg->>'departureAt')::timestamptz;
   actual_arrive:=depart+make_interval(secs=>(leg->>'seconds')::double precision);
   deadline:=case when side='previous' then e.start_at else neighbor.start_at end;
   buffer_waived:=exists(
    select 1 from public.booking_travel_buffer_exceptions x
    where x.from_event_id=case when side='previous' then neighbor.id else e.id end
      and x.to_event_id=case when side='previous' then e.id else neighbor.id end
      and x.from_signature=booking_private.signature(case when side='previous' then neighbor else e end)
      and x.to_signature=booking_private.signature(case when side='previous' then e else neighbor end)
   ) or exists(
    select 1 from public.booking_manual_travel_waivers w
    where w.from_event_id=case when side='previous' then neighbor.id else e.id end
      and w.to_event_id=case when side='previous' then e.id else neighbor.id end
      and w.from_signature=booking_private.signature(case when side='previous' then neighbor else e end)
      and w.to_signature=booking_private.signature(case when side='previous' then e else neighbor end)
   );
   arrive:=actual_arrive+case when buffer_waived or route_override then interval '0' else interval '15 minutes' end;
   if depart is null or (leg->>'seconds')::numeric is null or (leg->>'seconds')::numeric<0 or depart<(case when side='previous' then neighbor.end_at else e.end_at end) or actual_arrive>deadline or arrive>deadline or trim(coalesce(e.location,''))='' or trim(coalesce(neighbor.location,''))='' then
    if not route_override then raise exception using errcode='P0001',message='BOOKING_TRAVEL: insufficient driving time.'; end if;
   end if;
   if exists(select 1 from public.booking_commitments c where c.event_type='block' and lower(trim(c.status)) not in ('canceled','cancelled') and c.start_at<arrive and c.end_at>depart) then
    if not route_override then raise exception using errcode='P0001',message='BOOKING_TRAVEL: driving overlaps blocked time.'; end if;
   end if;
  end loop;
 end loop;
end $$;

create or replace function public.booking_commit(p_key uuid,p_hash text,p_revision text,p_lead jsonb,p_job jsonb,p_event jsonb,p_proofs jsonb,p_effects jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; prior public.booking_requests; e public.crm_calendar_events; l uuid; j uuid; result jsonb; cursor_at timestamptz; w record; wc integer; d date; effect jsonb;
begin
 if booking_private.payload_forges_override(p_lead) or booking_private.payload_forges_override(p_job) or booking_private.payload_forges_override(p_event) then
  raise exception using errcode='P0001', message='BOOKING_OVERRIDE: client-forged override is not authorized.';
 end if;
 select revision into v from public.booking_schedule_state where id for update;
 select * into prior from public.booking_requests where key=p_key;
 if found then
  if prior.request_hash<>p_hash then raise exception using errcode='P0001',message='BOOKING_KEY_REUSED: request changed.'; end if;
  return prior.response||jsonb_build_object('replayed',true);
 end if;
 if public.booking_recent_duplicate(p_lead->>'name',p_lead->>'phone',p_lead->'meta'->>'address') then raise exception using errcode='P0001',message='BOOKING_DUPLICATE: consultation already booked within 24 hours.'; end if;
 if v::text<>p_revision then raise exception using errcode='P0001',message='BOOKING_STALE: calendar changed.'; end if;
 e:=jsonb_populate_record(null::public.crm_calendar_events,p_event);
 wc:=(p_event->'meta'->>'windowCount')::integer;
 if e.assigned_to is distinct from 'Jessica' or e.status is distinct from 'scheduled' or e.event_type is distinct from 'sales_consult' or trim(coalesce(e.location,''))='' then raise exception 'Invalid public booking'; end if;
 if p_event->'meta'->>'bookingDurationPolicy' = 'residential_fixed_60_v1' then
  if (wc is not null and (wc<1 or wc>10000)) or e.end_at is distinct from e.start_at+interval '60 minutes' then raise exception 'Invalid public booking'; end if;
 else
  if wc is null or wc<1 or e.end_at is distinct from e.start_at+make_interval(mins=>case when wc<=5 then 60 when wc<=20 then 120 else 180 end) then raise exception 'Invalid public booking'; end if;
 end if;
 d:=(e.start_at at time zone 'America/Los_Angeles')::date;
 if e.start_at is null or d<(now() at time zone 'America/Los_Angeles')::date or (d=(now() at time zone 'America/Los_Angeles')::date and e.start_at<date_trunc('minute',now())+interval '4 hours') or extract(minute from e.start_at at time zone 'America/Los_Angeles')::int not in (0,30) or extract(second from e.start_at)<>0 or (e.start_at at time zone 'America/Los_Angeles')::time<'08:00' or (e.start_at at time zone 'America/Los_Angeles')::time>'16:00' then raise exception using errcode='P0001',message='BOOKING_CONFLICT: time is not bookable.'; end if;
 cursor_at:=e.start_at;
 for w in select start_at,end_at from public.crm_availability_slots where lower(owner)='jessica' and status='available' and source='crm_working_ranges' and start_at<e.end_at and end_at>e.start_at order by start_at loop
  if w.start_at>cursor_at then exit; end if;
  cursor_at:=greatest(cursor_at,w.end_at);
 end loop;
 if cursor_at<e.end_at then raise exception using errcode='P0001',message='BOOKING_CLOSED: Jessica has not published this time.'; end if;
 if (select count(*) from public.booking_commitments c where lower(trim(c.status)) not in ('canceled','cancelled') and c.event_type<>'block' and c.event_type<>'install' and booking_private.affects_jessica(c) and (c.start_at at time zone 'America/Los_Angeles')::date=d)>=4 then raise exception using errcode='P0001',message='BOOKING_FULL: daily capacity reached.'; end if;
 insert into public.leads(source,status,name,phone,email,interest,notes,page_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,meta) values(p_lead->>'source',p_lead->>'status',p_lead->>'name',p_lead->>'phone',p_lead->>'email',p_lead->>'interest',p_lead->>'notes',p_lead->>'page_path',p_lead->>'utm_source',p_lead->>'utm_medium',p_lead->>'utm_campaign',p_lead->>'utm_content',p_lead->>'utm_term',p_lead->'meta') returning id into l;
 insert into public.crm_jobs(lead_id,source,status,priority,customer_name,phone,email,address,product_interest,sales_owner,next_action,next_action_due,appointment_start,appointment_end,notes,meta)
 values(l,'self_booking','scheduled','high',p_job->>'customer_name',p_job->>'phone',p_job->>'email',p_job->>'address',p_job->>'product_interest','Jessica',p_job->>'next_action',d,e.start_at,e.end_at,p_job->>'notes',p_job->'meta') returning id into j;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='lead_source') then
  execute 'update public.leads set lead_source=$1 where id=$2' using p_lead->>'lead_source',l;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_jobs' and column_name='lead_source') then
  execute 'update public.crm_jobs set lead_source=$1 where id=$2' using p_job->>'lead_source',j;
 end if;
 insert into public.crm_calendar_events(id,job_id,title,event_type,status,assigned_to,start_at,end_at,location,notes,meta) values(e.id,j,e.title,e.event_type,e.status,'Jessica',e.start_at,e.end_at,e.location,e.notes,e.meta);
 insert into public.crm_quotes(job_id,status,meta) values(j,'draft','{"createdVia":"self_booking"}');
 perform booking_private.save_proofs(p_proofs);
 if not exists(select 1 from public.booking_route_protections where event_id=e.id) then raise exception 'Missing booking route protection'; end if;
 if booking_private.manual_override_active() then
  perform booking_private.record_manual_override(e.id);
  perform booking_private.settle_override_routes();
 end if;
 perform booking_private.validate_protections();
 result:=jsonb_build_object('message','Appointment booked.','leadId',l,'eventId',l,'jobId',j,'calendarEventId',e.id,'assignedTo','Jessica','notificationsQueued',true);
 insert into public.booking_requests(key,request_hash,response) values(p_key,p_hash,result);
 for effect in select value from jsonb_array_elements(p_effects) loop
  insert into public.booking_outbox(booking_key,kind,payload) values(p_key,effect->>'kind',(effect->'payload')||result);
 end loop;
 return result;
end $$;

create or replace function public.booking_request_time(
  p_key uuid, p_hash text, p_revision text, p_start timestamptz,
  p_lead jsonb, p_details jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v bigint; prior public.booking_requests; l uuid; j uuid; result jsonb;
  d date := (p_start at time zone 'America/Los_Angeles')::date;
  t time := (p_start at time zone 'America/Los_Angeles')::time;
  today date := (now() at time zone 'America/Los_Angeles')::date;
  metadata jsonb;
begin
  select revision into v from public.booking_schedule_state where id for update;
  select * into prior from public.booking_requests where key=p_key;
  if found then
    if prior.request_hash is distinct from p_hash then raise exception 'BOOKING_KEY_REUSED'; end if;
    return prior.response;
  end if;
  if p_key is null or p_hash is null or length(p_hash)<>64 or
    nullif(trim(p_details->>'name'),'') is null or nullif(trim(p_details->>'phone'),'') is null or
    nullif(trim(p_details->>'address'),'') is null then raise exception 'BOOKING_INVALID_REQUEST'; end if;
  if p_revision is distinct from v::text then raise exception 'BOOKING_STALE'; end if;
  if p_start is null or d<today or t<'08:00' or t>'18:00' or
    extract(minute from t) not in (0,30) or extract(second from t)<>0 or
    (d=today and p_start<date_trunc('minute',now())+interval '4 hours') then
    raise exception 'BOOKING_INVALID_TIME';
  end if;
  if exists(select 1 from public.booking_commitments c
    where lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c)
    and (c.start_at is null or c.end_at is null or c.end_at<=c.start_at or
      (c.start_at<p_start+interval '1 hour' and c.end_at>p_start))) then
    raise exception 'BOOKING_CONFLICT';
  end if;
  if (select count(*) from public.booking_commitments c where lower(trim(c.status)) not in ('canceled','cancelled')
    and c.event_type<>'block' and c.event_type<>'install' and booking_private.affects_jessica(c) and (c.start_at at time zone 'America/Los_Angeles')::date=d)>=4 then
    raise exception 'BOOKING_FULL';
  end if;
  -- Bound repeated notifications for the same customer; identical retries above
  -- are free. This never holds or reserves a requested time.
  if (select count(*) from public.crm_jobs where source='consultation_time_request'
    and phone=p_details->>'phone' and created_at>now()-interval '1 hour')>=3 then
    raise exception 'BOOKING_REQUEST_LIMIT';
  end if;
  metadata := coalesce(p_lead->'meta','{}'::jsonb) || jsonb_build_object(
    'requestStatus','pending','requestedStartAt',p_start,'requestedEndAt',p_start+interval '1 hour',
    'appointmentDurationMinutes',60,'requestKey',p_key,'ownerReviewRequired',true);
  insert into public.leads(source,status,name,phone,email,interest,notes,page_path,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,meta)
  values('consultation_time_request','new',p_details->>'name',p_details->>'phone',nullif(p_details->>'email',''),
    p_details->>'productInterest',p_details->>'bookingNotes',p_lead->>'page_path',
    p_lead->>'utm_source',p_lead->>'utm_medium',p_lead->>'utm_campaign',p_lead->>'utm_content',p_lead->>'utm_term',metadata)
  returning id into l;
  insert into public.crm_jobs(lead_id,source,status,priority,customer_name,phone,email,address,product_interest,
    sales_owner,next_action,next_action_due,notes,meta)
  values(l,'consultation_time_request','follow_up','high',p_details->>'name',p_details->>'phone',nullif(p_details->>'email',''),
    p_details->>'address',p_details->>'productInterest','Mike','Contact customer to confirm requested consultation time',today,
    p_details->>'bookingNotes',metadata) returning id into j;
  result := jsonb_build_object('requestId',p_key,'leadId',l,'jobId',j,'status','pending');
  insert into public.booking_requests(key,request_hash,response) values(p_key,p_hash,result);
  insert into public.booking_outbox(booking_key,kind,payload) values(p_key,'owner_time_request_sms',
    p_details || jsonb_build_object('leadId',l,'jobId',j,'startAt',p_start,'endAt',p_start+interval '1 hour'));
  return result;
end $$;
