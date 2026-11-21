-- Staff may book through the normal consultation commit when the owner orders it.
-- The override skips only the 15-minute travel buffer and the route recheck.
-- Overlap, daily capacity, published hours, assignment, and unguarded public
-- writes stay in force. A flag stuffed into the booking JSON is not authority.

create table public.booking_manual_override_log (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.crm_calendar_events(id) on delete cascade,
 override_by text not null,
 override_reason text not null,
 created_at timestamptz not null default now(),
 constraint booking_manual_override_log_by_not_blank check (length(btrim(override_by)) > 0),
 constraint booking_manual_override_log_reason_not_blank check (length(btrim(override_reason)) > 0)
);
create index booking_manual_override_log_event_id_idx on public.booking_manual_override_log(event_id);

-- Exact-leg waiver so a later calendar write can revalidate the overridden visit
-- without the 15-minute buffer. A changed signature stops matching.
create table public.booking_manual_travel_waivers (
 from_event_id text not null,
 to_event_id text not null,
 from_signature jsonb not null,
 to_signature jsonb not null,
 event_id uuid not null references public.crm_calendar_events(id) on delete cascade,
 override_by text not null,
 override_reason text not null,
 created_at timestamptz not null default now(),
 primary key (from_event_id, to_event_id),
 constraint booking_manual_travel_waivers_by_not_blank check (length(btrim(override_by)) > 0),
 constraint booking_manual_travel_waivers_reason_not_blank check (length(btrim(override_reason)) > 0)
);
alter table public.booking_manual_travel_waivers enable row level security;
revoke all on public.booking_manual_travel_waivers from public, anon, authenticated;
grant select on public.booking_manual_travel_waivers to service_role;
alter table public.booking_manual_override_log enable row level security;
revoke all on public.booking_manual_override_log from public, anon, authenticated;
grant select on public.booking_manual_override_log to service_role;

-- Single-use authorization for this transaction. service_role cannot insert here;
-- only the staff function, running as its owner, can.
create table booking_private.override_grants (
 nonce uuid primary key,
 override_by text not null,
 override_reason text not null,
 txid bigint not null,
 created_at timestamptz not null default now(),
 constraint booking_override_grants_by_not_blank check (length(btrim(override_by)) > 0),
 constraint booking_override_grants_reason_not_blank check (length(btrim(override_reason)) > 0)
);
revoke all on booking_private.override_grants from public, anon, authenticated, service_role;

create function booking_private.payload_forges_override(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(
  coalesce(p, '{}'::jsonb) ?| array['manual_override','manualOverride','p_manual_override','override_by','overrideBy','override_reason','overrideReason']
  or (jsonb_typeof(p->'meta') = 'object' and (p->'meta') ?| array['manual_override','manualOverride','p_manual_override','override_by','overrideBy','override_reason','overrideReason']),
 false)
$$;

create function booking_private.manual_override_active() returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare n uuid; found_grant boolean;
begin
 begin
  n := nullif(current_setting('booking.override_nonce', true), '')::uuid;
 exception when invalid_text_representation or data_exception then
  return false;
 end;
 if n is null then return false; end if;
 select true into found_grant from booking_private.override_grants g
  where g.nonce = n and g.txid = txid_current()
    and length(btrim(g.override_by)) > 0 and length(btrim(g.override_reason)) > 0;
 return coalesce(found_grant, false);
end $$;

create function booking_private.record_manual_override(p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare n uuid; g booking_private.override_grants;
begin
 begin
  n := nullif(current_setting('booking.override_nonce', true), '')::uuid;
 exception when invalid_text_representation or data_exception then
  n := null;
 end;
 select * into g from booking_private.override_grants where nonce = n and txid = txid_current();
 if not found or length(btrim(g.override_by)) = 0 or length(btrim(g.override_reason)) = 0 then
  raise exception using errcode='P0001', message='BOOKING_OVERRIDE: manual override was not authorized.';
 end if;
 insert into public.booking_manual_override_log(event_id, override_by, override_reason)
 values (p_event_id, btrim(g.override_by), btrim(g.override_reason));
end $$;

-- Rewrite protected proofs so the saved itinerary passes again after this
-- transaction. Legs that are tighter than 15 minutes keep an exact waiver.
create function booking_private.settle_override_routes() returns void
language plpgsql security definer set search_path='' as $$
declare p record; e public.booking_commitments; neighbor public.booking_commitments; side text; depart timestamptz; deadline timestamptz; gap_seconds numeric; fit_seconds integer; next_proof jsonb; who text; why text; from_event public.booking_commitments; to_event public.booking_commitments;
begin
 select g.override_by, g.override_reason into who, why
 from booking_private.override_grants g
 where g.nonce = nullif(current_setting('booking.override_nonce', true), '')::uuid
   and g.txid = txid_current();
 if who is null then return; end if;
 for p in select * from public.booking_route_protections loop
  select * into e from public.booking_commitments where id = p.event_id::text;
  if not found or lower(trim(e.status)) in ('canceled','cancelled') or e.end_at < now() then continue; end if;
  next_proof := jsonb_build_object('eventId', e.id, 'signature', booking_private.signature(e), 'checkedAt', clock_timestamp(), 'previous', 'null'::jsonb, 'next', 'null'::jsonb);
  foreach side in array array['previous','next'] loop
   if side = 'previous' then
    select * into neighbor from public.booking_commitments c where c.id <> e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type <> 'block' and (c.start_at at time zone 'America/Los_Angeles')::date = (e.start_at at time zone 'America/Los_Angeles')::date and c.end_at <= e.start_at order by c.end_at desc, c.id limit 1;
   else
    select * into neighbor from public.booking_commitments c where c.id <> e.id and lower(trim(c.status)) not in ('canceled','cancelled') and booking_private.affects_jessica(c) and c.event_type <> 'block' and (c.start_at at time zone 'America/Los_Angeles')::date = (e.start_at at time zone 'America/Los_Angeles')::date and c.start_at >= e.end_at order by c.start_at, c.id limit 1;
   end if;
   if not found then continue; end if;
   depart := case when side = 'previous' then neighbor.end_at else e.end_at end;
   deadline := case when side = 'previous' then e.start_at else neighbor.start_at end;
   gap_seconds := extract(epoch from (deadline - depart));
   if gap_seconds is null or gap_seconds < 0 then continue; end if;
   fit_seconds := greatest(0, floor(gap_seconds))::integer;
   if side = 'previous' then from_event := neighbor; to_event := e; else from_event := e; to_event := neighbor; end if;
   insert into public.booking_manual_travel_waivers(from_event_id, to_event_id, from_signature, to_signature, event_id, override_by, override_reason)
   values (from_event.id, to_event.id, booking_private.signature(from_event), booking_private.signature(to_event), p.event_id, btrim(who), btrim(why))
   on conflict (from_event_id, to_event_id) do update set from_signature = excluded.from_signature, to_signature = excluded.to_signature, event_id = excluded.event_id, override_by = excluded.override_by, override_reason = excluded.override_reason, created_at = now();
   next_proof := jsonb_set(next_proof, array[side], jsonb_build_object('id', neighbor.id, 'signature', booking_private.signature(neighbor), 'departureAt', depart, 'seconds', fit_seconds));
  end loop;
  update public.booking_route_protections as guard set proof = next_proof where guard.event_id = p.event_id;
 end loop;
end $$;

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
  if (select count(*) from public.booking_commitments c where lower(trim(c.status)) not in ('canceled','cancelled') and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=(e.start_at at time zone 'America/Los_Angeles')::date)>4 then raise exception 'BOOKING_FULL: protected day exceeds four appointments.'; end if;
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

create function public.booking_commit_manual_override(
 p_key uuid, p_hash text, p_revision text, p_lead jsonb, p_job jsonb, p_event jsonb, p_proofs jsonb, p_effects jsonb,
 p_manual_override boolean, p_override_by text, p_override_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare grant_nonce uuid := gen_random_uuid(); result jsonb;
begin
 if p_manual_override is not true then
  return public.booking_commit(p_key,p_hash,p_revision,p_lead,p_job,p_event,p_proofs,p_effects);
 end if;
 if length(btrim(coalesce(p_override_by,'')))=0 or length(btrim(coalesce(p_override_reason,'')))=0 then
  raise exception using errcode='P0001', message='BOOKING_OVERRIDE: override requires a non-blank who and why.';
 end if;
 if booking_private.payload_forges_override(p_lead) or booking_private.payload_forges_override(p_job) or booking_private.payload_forges_override(p_event) then
  raise exception using errcode='P0001', message='BOOKING_OVERRIDE: client-forged override is not authorized.';
 end if;
 -- The schedule guard is deferred until commit, so this grant has to still be
 -- visible then. It authorizes only this transaction id.
 delete from booking_private.override_grants where txid <> txid_current();
 insert into booking_private.override_grants(nonce, override_by, override_reason, txid)
 values (grant_nonce, btrim(p_override_by), btrim(p_override_reason), txid_current());
 perform set_config('booking.override_nonce', grant_nonce::text, true);
 result := public.booking_commit(p_key,p_hash,p_revision,p_lead,p_job,p_event,p_proofs,p_effects);
 return result;
end $$;

revoke all on function booking_private.payload_forges_override(jsonb), booking_private.manual_override_active(), booking_private.record_manual_override(uuid), booking_private.settle_override_routes() from public, anon, authenticated;
grant execute on function booking_private.payload_forges_override(jsonb), booking_private.manual_override_active(), booking_private.record_manual_override(uuid), booking_private.settle_override_routes() to service_role;
revoke all on function public.booking_commit_manual_override(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,text) from public, anon, authenticated;
grant execute on function public.booking_commit_manual_override(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,text) to service_role;
