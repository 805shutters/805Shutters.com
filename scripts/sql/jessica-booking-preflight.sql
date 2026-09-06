-- READ ONLY. Run against 805 project evuxqsaucmvgyuvjpqlo before migration.
-- No names, phone numbers or customer addresses are returned. Resolve listed IDs
-- inside the authenticated CRM. This does not repair or publish anything.
begin transaction read only;
select current_database(), current_setting('server_version') as postgres_version;
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('leads','crm_jobs','crm_quotes','crm_calendar_events','sales_805_appointments','crm_availability_slots','crm_activity_events')
order by table_name,ordinal_position;
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
and tablename in ('crm_calendar_events','crm_availability_slots');
select migration.version,migration.name from supabase_migrations.schema_migrations migration
where migration.version in ('20260602000000','20260603000000','20260605013000','20260624093000','20260720143000','20260906145749') order by migration.version;
with commitments as (
 select e.id::text id,e.start_at,
  case when s.id is not null and (s.end_time is null or s.end_time<=s.start_time) then null else e.end_at end end_at,
  lower(trim(e.status)) status,lower(trim(coalesce(e.assigned_to,''))) owner,e.event_type,
  nullif(trim(e.location),'') is null missing_address
 from public.crm_calendar_events e left join public.sales_805_appointments s on s.id::text=e.meta->>'sales_805_appointment_id'
 union all
 select 'sales:'||s.id::text,public.sales_805_appointment_calendar_start(s.appointment_date,s.start_time),
  case when s.end_time>s.start_time then public.sales_805_appointment_calendar_end(s.appointment_date,s.start_time,s.end_time) else null end,
  lower(trim(s.status)),lower(trim(coalesce(s.assigned_to,''))),'sales_consult',nullif(trim(s.customer_address),'') is null
 from public.sales_805_appointments s where not exists(select 1 from public.crm_calendar_events e where e.meta->>'sales_805_appointment_id'=s.id::text)
), active as (
 select *, event_type='block' or owner in ('','jessica','unassigned') affects_jessica
 from commitments where status not in ('canceled','cancelled') and (end_at is null or end_at>=now())
), findings as (
 select 'incomplete_commitment' issue,id, null::text related_id,start_at
 from active where affects_jessica and (start_at is null or end_at is null or end_at<=start_at or (missing_address and event_type<>'block'))
 union all
 select 'unassigned_owner',id,null,start_at from active where owner in ('','unassigned') and event_type<>'block'
 union all
 select 'appointment_overlap',a.id,b.id,a.start_at from active a join active b on a.id<b.id and a.start_at<b.end_at and b.start_at<a.end_at
 where a.affects_jessica and b.affects_jessica and (a.event_type<>'block' or b.event_type<>'block')
 union all
 select 'over_daily_capacity',string_agg(id,',' order by id),null,min(start_at)
 from active where event_type<>'block' group by (start_at at time zone 'America/Los_Angeles')::date having count(*)>4
)
select issue,id,related_id,start_at at time zone 'America/Los_Angeles' as starts_pacific from findings order by start_at,issue,id;
-- Road-travel feasibility also requires the authenticated CRM preview with a
-- validated address and live Google configuration; SQL cannot verify forecasts.
rollback;
