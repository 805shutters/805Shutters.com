-- Fail-closed rollout: existing click-based hours require explicit review/publication.
alter table public.crm_availability_slots drop constraint crm_availability_slots_status_check;
alter table public.crm_availability_slots add constraint crm_availability_slots_status_check check(status in ('available','canceled','draft'));
update public.crm_availability_slots set status='draft' where status='available';
do $$begin
 if to_regclass('public.crm_activity_events') is not null then
  execute $import$
   insert into public.crm_availability_slots(owner,start_at,end_at,status,source,created_by_email,meta)
   select record->>'owner',(record->>'start_at')::timestamptz,(record->>'end_at')::timestamptz,'draft','crm_activity_events_fallback',actor_email,jsonb_build_object('requiresReview',true)
   from (select distinct on ((coalesce(metadata,'{}'::jsonb)||coalesce(after_data,'{}'::jsonb))->>'owner',(coalesce(metadata,'{}'::jsonb)||coalesce(after_data,'{}'::jsonb))->>'start_at') (coalesce(metadata,'{}'::jsonb)||coalesce(after_data,'{}'::jsonb)) record,action,actor_email from public.crm_activity_events where entity_type='system' and action in ('availability_slot_open','availability_slot_closed') order by (coalesce(metadata,'{}'::jsonb)||coalesce(after_data,'{}'::jsonb))->>'owner',(coalesce(metadata,'{}'::jsonb)||coalesce(after_data,'{}'::jsonb))->>'start_at',created_at desc,id desc) latest
   where action='availability_slot_open' and record->>'owner'='Jessica' and record->>'start_at' is not null and record->>'end_at' is not null
   on conflict(owner,start_at,end_at) do nothing
  $import$;
 end if;
end$$;


create schema if not exists booking_private;
revoke all on schema booking_private from public, anon, authenticated;
grant usage on schema booking_private to service_role;
create table public.booking_schedule_state(id boolean primary key default true check(id), revision bigint not null default 1, activated_at timestamptz not null default now());
insert into public.booking_schedule_state(id) values(true);
create table public.booking_requests(key uuid primary key, request_hash text not null, response jsonb not null, created_at timestamptz not null default now());
create table public.booking_route_protections(event_id uuid primary key references public.crm_calendar_events(id) on delete cascade, proof jsonb not null);
create table public.booking_outbox(id uuid primary key default gen_random_uuid(), booking_key uuid not null references public.booking_requests(key), kind text not null, payload jsonb not null, status text not null default 'pending' check(status in ('pending','processing','sent','skipped','failed','uncertain')), claimed_at timestamptz, completed_at timestamptz, last_error text, unique(booking_key,kind));
alter table public.booking_schedule_state enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_route_protections enable row level security;
alter table public.booking_outbox enable row level security;
revoke all on public.booking_schedule_state,public.booking_requests,public.booking_route_protections,public.booking_outbox from public,anon,authenticated;
grant all on public.booking_schedule_state,public.booking_requests,public.booking_route_protections,public.booking_outbox to service_role;

-- Canonical commitments include legacy rows only when their provenance mirror is
-- absent. Never merge by customer name, phone, or coincident start time.
create view public.booking_commitments with(security_invoker=true) as
select e.id::text id,e.start_at,
 case when s.id is not null and (s.end_time is null or s.end_time<=s.start_time) then null else e.end_at end end_at,
 e.status,e.assigned_to,e.event_type,e.location,e.meta
from public.crm_calendar_events e left join public.sales_805_appointments s on s.id::text=e.meta->>'sales_805_appointment_id'
union all
select 'sales:'||s.id::text,
 public.sales_805_appointment_calendar_start(s.appointment_date,s.start_time),
 case when s.end_time>s.start_time then public.sales_805_appointment_calendar_end(s.appointment_date,s.start_time,s.end_time) else null end,
 case when lower(s.status)='cancelled' then 'canceled' else s.status end,
 s.assigned_to,'sales_consult',s.customer_address,coalesce(s.metadata,'{}'::jsonb)
from public.sales_805_appointments s where not exists(select 1 from public.crm_calendar_events e where e.meta->>'sales_805_appointment_id'=s.id::text);
revoke all on public.booking_commitments from public,anon,authenticated;
grant select on public.booking_commitments to service_role;

create function booking_private.signature(e public.booking_commitments) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_array(e.id,extract(epoch from e.start_at)*1000,extract(epoch from e.end_at)*1000,lower(trim(e.assigned_to)),e.event_type,trim(coalesce(e.location,'')))
$$;
create function booking_private.affects_jessica(e public.booking_commitments) returns boolean language sql immutable set search_path='' as $$
 select e.event_type='block' or lower(trim(coalesce(e.assigned_to,''))) in ('','jessica','unassigned')
$$;

-- Statement-level lock is deliberately global: protects cross-day moves, legacy
-- mirrors, bulk writes and availability publication using a single lock order.
create function booking_private.schedule_lock() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.booking_schedule_state set revision=revision+1 where id;
 return null;
end $$;
create trigger booking_schedule_lock before insert or update or delete on public.crm_calendar_events for each statement execute function booking_private.schedule_lock();
create trigger booking_schedule_lock before insert or update or delete on public.sales_805_appointments for each statement execute function booking_private.schedule_lock();
create trigger booking_schedule_lock before insert or update or delete on public.crm_availability_slots for each statement execute function booking_private.schedule_lock();

create function booking_private.validate_protections() returns void language plpgsql set search_path='' as $$
declare p record; e public.booking_commitments; neighbor public.booking_commitments; side text; leg jsonb; depart timestamptz; arrive timestamptz; deadline timestamptz;
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
   arrive:=depart+make_interval(secs=>(leg->>'seconds')::double precision)+interval '15 minutes';
   deadline:=case when side='previous' then e.start_at else neighbor.start_at end;
   if depart is null or (leg->>'seconds')::numeric is null or (leg->>'seconds')::numeric<0 or depart<(case when side='previous' then neighbor.end_at else e.end_at end) or arrive>deadline or trim(coalesce(e.location,''))='' or trim(coalesce(neighbor.location,''))='' then raise exception using errcode='P0001',message='BOOKING_TRAVEL: insufficient driving time.'; end if;
   if exists(select 1 from public.booking_commitments c where c.event_type='block' and lower(trim(c.status)) not in ('canceled','cancelled') and c.start_at<arrive and c.end_at>depart) then raise exception using errcode='P0001',message='BOOKING_TRAVEL: driving overlaps blocked time.'; end if;
  end loop;
 end loop;
end $$;
create function booking_private.schedule_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin perform booking_private.validate_protections(); return null; end $$;
-- Deferred until all rows and replacement route proofs have been saved.
create constraint trigger booking_schedule_guard after insert or update or delete on public.crm_calendar_events deferrable initially deferred for each row execute function booking_private.schedule_guard();
create constraint trigger booking_schedule_guard after insert or update or delete on public.sales_805_appointments deferrable initially deferred for each row execute function booking_private.schedule_guard();

create function public.booking_schedule_snapshot(p_month text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; a timestamptz; b timestamptz;
begin
 if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month'; end if;
 a:=(p_month||'-01')::timestamp at time zone 'America/Los_Angeles'; b:=((p_month||'-01')::date+interval '1 month')::timestamp at time zone 'America/Los_Angeles';
 select revision into v from public.booking_schedule_state where id for share;
 return jsonb_build_object('revision',v::text,'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.booking_commitments e where lower(trim(e.status)) not in ('canceled','cancelled') and (e.start_at is null or e.end_at is null or (e.start_at<b and e.end_at>a))),'[]'::jsonb),'slots',coalesce((select jsonb_agg(to_jsonb(s)) from public.crm_availability_slots s where s.start_at<b and s.end_at>a),'[]'::jsonb),'protectedIds',coalesce((select jsonb_agg(event_id::text) from public.booking_route_protections),'[]'::jsonb));
end $$;

create function booking_private.save_proofs(p_proofs jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb;
begin
 for p in select value from jsonb_array_elements(p_proofs) loop
  if (p->>'checkedAt')::timestamptz is null or (p->>'checkedAt')::timestamptz<clock_timestamp()-interval '2 minutes' or (p->>'checkedAt')::timestamptz>clock_timestamp()+interval '5 seconds' then raise exception using errcode='P0001',message='BOOKING_STALE: route evidence expired.'; end if;
  insert into public.booking_route_protections(event_id,proof) values((p->>'eventId')::uuid,p) on conflict(event_id) do update set proof=excluded.proof;
 end loop;
end $$;

create function public.booking_publish_ranges(p_month text,p_revision text,p_ranges jsonb,p_actor text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; r jsonb; a timestamptz; b timestamptz;
begin
 select revision into v from public.booking_schedule_state where id for update;
 if v::text<>p_revision then raise exception using errcode='P0001',message='BOOKING_STALE: calendar changed; reload before publishing.'; end if;
 if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or jsonb_array_length(p_ranges)>124 then raise exception 'Invalid working ranges'; end if;
 for r in select value from jsonb_array_elements(p_ranges) loop
  a:=(r->>'start_at')::timestamptz; b:=(r->>'end_at')::timestamptz;
  if a is null or b is null or b<=a or to_char(a at time zone 'America/Los_Angeles','YYYY-MM')<>p_month or (a at time zone 'America/Los_Angeles')::date<>((b-interval '1 second') at time zone 'America/Los_Angeles')::date then raise exception 'Invalid working range'; end if;
 end loop;
 delete from public.crm_availability_slots where lower(owner)='jessica' and to_char(start_at at time zone 'America/Los_Angeles','YYYY-MM')=p_month;
 insert into public.crm_availability_slots(owner,start_at,end_at,status,source,created_by_email)
 select 'Jessica',(value->>'start_at')::timestamptz,(value->>'end_at')::timestamptz,'available','crm_working_ranges',p_actor from jsonb_array_elements(p_ranges);
 return public.booking_schedule_snapshot(p_month);
end $$;

-- One RPC commits all booking records and durable, per-effect outbox entries.
create function public.booking_commit(p_key uuid,p_hash text,p_revision text,p_lead jsonb,p_job jsonb,p_event jsonb,p_proofs jsonb,p_effects jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; prior public.booking_requests; e public.crm_calendar_events; l uuid; j uuid; result jsonb; cursor_at timestamptz; w record; wc integer; d date; effect jsonb;
begin
 select revision into v from public.booking_schedule_state where id for update;
 select * into prior from public.booking_requests where key=p_key;
 if found then
  if prior.request_hash<>p_hash then raise exception using errcode='P0001',message='BOOKING_KEY_REUSED: request changed.'; end if;
  return prior.response||jsonb_build_object('replayed',true);
 end if;
 if v::text<>p_revision then raise exception using errcode='P0001',message='BOOKING_STALE: calendar changed.'; end if;
 e:=jsonb_populate_record(null::public.crm_calendar_events,p_event);
 wc:=(p_event->'meta'->>'windowCount')::integer;
 if wc is null or wc<1 or e.assigned_to is distinct from 'Jessica' or e.status is distinct from 'scheduled' or e.event_type is distinct from 'sales_consult' or e.end_at is distinct from e.start_at+make_interval(mins=>case when wc<=5 then 60 when wc<=20 then 120 else 180 end) or trim(coalesce(e.location,''))='' then raise exception 'Invalid public booking'; end if;
 d:=(e.start_at at time zone 'America/Los_Angeles')::date;
 if e.start_at is null or d<(now() at time zone 'America/Los_Angeles')::date or (d=(now() at time zone 'America/Los_Angeles')::date and e.start_at<date_trunc('minute',now())+interval '4 hours') or extract(minute from e.start_at at time zone 'America/Los_Angeles')::int not in (0,30) or extract(second from e.start_at)<>0 or (e.start_at at time zone 'America/Los_Angeles')::time<'08:00' or (e.start_at at time zone 'America/Los_Angeles')::time>'16:00' then raise exception using errcode='P0001',message='BOOKING_CONFLICT: time is not bookable.'; end if;
 cursor_at:=e.start_at;
 for w in select start_at,end_at from public.crm_availability_slots where lower(owner)='jessica' and status='available' and source='crm_working_ranges' and start_at<e.end_at and end_at>e.start_at order by start_at loop
  if w.start_at>cursor_at then exit; end if;
  cursor_at:=greatest(cursor_at,w.end_at);
 end loop;
 if cursor_at<e.end_at then raise exception using errcode='P0001',message='BOOKING_CLOSED: Jessica has not published this time.'; end if;
 if (select count(*) from public.booking_commitments c where lower(trim(c.status)) not in ('canceled','cancelled') and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=d)>=4 then raise exception using errcode='P0001',message='BOOKING_FULL: daily capacity reached.'; end if;
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
 perform booking_private.validate_protections();
 result:=jsonb_build_object('message','Appointment booked.','leadId',l,'jobId',j,'calendarEventId',e.id,'assignedTo','Jessica','notificationsQueued',true);
 insert into public.booking_requests(key,request_hash,response) values(p_key,p_hash,result);
 for effect in select value from jsonb_array_elements(p_effects) loop
  insert into public.booking_outbox(booking_key,kind,payload) values(p_key,effect->>'kind',(effect->'payload')||result);
 end loop;
 return result;
end $$;

-- Staff edits revalidate protected visits in the same transaction. Direct legacy
-- writes remain guarded; a changed itinerary without fresh proofs is rejected.
create function public.booking_calendar_write(p_revision text,p_operation text,p_event jsonb,p_proofs jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v bigint; e public.crm_calendar_events; old_event public.crm_calendar_events; cursor_at timestamptz; w record;
begin
 select revision into v from public.booking_schedule_state where id for update;
 if v::text<>p_revision then raise exception using errcode='P0001',message='BOOKING_STALE: calendar changed; reload and retry.'; end if;
 if p_operation='insert' then
  e:=jsonb_populate_record(null::public.crm_calendar_events,p_event);
  insert into public.crm_calendar_events(id,job_id,title,event_type,status,assigned_to,start_at,end_at,location,notes,meta) values(e.id,e.job_id,e.title,e.event_type,e.status,e.assigned_to,e.start_at,e.end_at,e.location,e.notes,coalesce(e.meta,'{}'::jsonb)) returning * into e;
 elsif p_operation='update' then
  select * into e from public.crm_calendar_events where id=(p_event->>'id')::uuid;
  if not found then raise exception 'Appointment missing'; end if;
  old_event:=e;
  e:=jsonb_populate_record(e,p_event);
  if lower(trim(e.status)) not in ('canceled','cancelled') and (e.start_at is distinct from old_event.start_at or e.end_at is distinct from old_event.end_at) and exists(select 1 from public.booking_route_protections where event_id=e.id) then
   cursor_at:=e.start_at;
   for w in select start_at,end_at from public.crm_availability_slots where lower(trim(owner))='jessica' and status='available' and source='crm_working_ranges' and start_at<e.end_at and end_at>e.start_at order by start_at loop
    if w.start_at>cursor_at then exit; end if;
    cursor_at:=greatest(cursor_at,w.end_at);
   end loop;
   if cursor_at<e.end_at then raise exception 'BOOKING_CLOSED: publish working hours before moving this public consultation.'; end if;
  end if;
  update public.crm_calendar_events set job_id=e.job_id,title=e.title,event_type=e.event_type,status=e.status,assigned_to=e.assigned_to,start_at=e.start_at,end_at=e.end_at,location=e.location,notes=e.notes,meta=e.meta where id=e.id returning * into e;
 else raise exception 'Invalid calendar operation'; end if;
 perform booking_private.save_proofs(p_proofs);
 perform booking_private.validate_protections();
 return to_jsonb(e);
end $$;

create function public.booking_claim_effect(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.booking_outbox;
begin
 update public.booking_outbox set status='processing',claimed_at=now() where id=p_id and status='pending' returning * into row;
 if not found then return null; end if;
 return to_jsonb(row);
end $$;

revoke all on all functions in schema booking_private from public,anon,authenticated;
grant execute on all functions in schema booking_private to service_role;
revoke all on function public.booking_schedule_snapshot(text),public.booking_publish_ranges(text,text,jsonb,text),public.booking_commit(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb),public.booking_calendar_write(text,text,jsonb,jsonb),public.booking_claim_effect(uuid) from public,anon,authenticated;
grant execute on function public.booking_schedule_snapshot(text),public.booking_publish_ranges(text,text,jsonb,text),public.booking_commit(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb),public.booking_calendar_write(text,text,jsonb,jsonb),public.booking_claim_effect(uuid) to service_role;

create function public.booking_merge_event_metadata(p_id uuid,p_metadata jsonb) returns void language sql security invoker set search_path='' as $$
 update public.crm_calendar_events set meta=coalesce(meta,'{}'::jsonb)||p_metadata where id=p_id;
$$;
revoke all on function public.booking_merge_event_metadata(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.booking_merge_event_metadata(uuid,jsonb) to service_role;
