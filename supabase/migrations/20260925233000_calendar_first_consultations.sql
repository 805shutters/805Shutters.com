-- Residential consultations reserve one hour independently of optional project details.
-- Server-only booking_commit keeps its existing signature, grants, atomicity, and route protections.
-- Unmarked legacy/commercial requests continue to use window-count duration validation.
create or replace function public.booking_commit(p_key uuid,p_hash text,p_revision text,p_lead jsonb,p_job jsonb,p_event jsonb,p_proofs jsonb,p_effects jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
