-- Additive, service-only pending requests. Does not create appointments, modify
-- published working hours, or weaken booking_commit / route protections.
create function public.booking_request_time(
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
    and c.event_type<>'block' and (c.start_at at time zone 'America/Los_Angeles')::date=d)>=4 then
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
revoke all on function public.booking_request_time(uuid,text,text,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.booking_request_time(uuid,text,text,timestamptz,jsonb,jsonb) to service_role;
