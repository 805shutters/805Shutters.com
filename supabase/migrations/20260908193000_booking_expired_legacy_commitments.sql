-- Legacy appointments are assigned to one local calendar date. An invalid
-- end time on an expired date must not reserve Jessica forever. Keep original
-- records untouched and continue blocking malformed appointments today/future.
create or replace view public.booking_commitments with(security_invoker=true) as
select e.id::text id,e.start_at,
 case when s.id is not null and (s.end_time is null or s.end_time<=s.start_time) then null else e.end_at end end_at,
 e.status,e.assigned_to,e.event_type,e.location,e.meta
from public.crm_calendar_events e left join public.sales_805_appointments s on s.id::text=e.meta->>'sales_805_appointment_id'
where s.id is null or s.appointment_date >= (now() at time zone 'America/Los_Angeles')::date or s.end_time > s.start_time
union all
select 'sales:'||s.id::text,
 public.sales_805_appointment_calendar_start(s.appointment_date,s.start_time),
 case when s.end_time>s.start_time then public.sales_805_appointment_calendar_end(s.appointment_date,s.start_time,s.end_time) else null end,
 case when lower(s.status)='cancelled' then 'canceled' else s.status end,
 s.assigned_to,'sales_consult',s.customer_address,coalesce(s.metadata,'{}'::jsonb)
from public.sales_805_appointments s where not exists(select 1 from public.crm_calendar_events e where e.meta->>'sales_805_appointment_id'=s.id::text)
 and (s.appointment_date >= (now() at time zone 'America/Los_Angeles')::date or s.end_time > s.start_time);

notify pgrst, 'reload schema';
