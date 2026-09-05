-- Extend the existing task list. Financial and quote authorities remain unchanged.
alter table public.crm_accountability_tasks add column if not exists blocker text;
alter table public.crm_accountability_tasks add column if not exists waiting_since timestamptz;
alter table public.crm_accountability_tasks add column if not exists due_on date;
alter table public.crm_accountability_tasks add column if not exists resolution text;
alter table public.crm_accountability_tasks add column if not exists order_reference text;
alter table public.crm_accountability_tasks add column if not exists revision integer not null default 1;
alter table public.crm_accountability_tasks drop constraint if exists crm_accountability_tasks_type_check;
alter table public.crm_accountability_tasks add constraint crm_accountability_tasks_type_check check (task_type in ('order_product','collect_deposit','collect_balance','enter_cogs','receive_product','schedule_install','bookkeeping_review','pay_commission','operational_action','service_issue','technical_measure','verify_scope'));
create unique index if not exists crm_accountability_source_idx on public.crm_accountability_tasks ((meta->>'source_key')) where meta->>'source_key' is not null;

create table if not exists public.crm_business_events (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(), occurred_at timestamptz not null default now(),
 source_table text not null, source_id uuid not null, source_revision integer not null,
 job_id uuid, quote_id uuid, bookkeeping_entry_id uuid,
 event_type text not null, actor text not null, date_precision text not null default 'timestamp',
 correlation_id text, correction_of uuid, request_id uuid unique,
 before_data jsonb not null default '{}'::jsonb, after_data jsonb not null default '{}'::jsonb,
 metadata jsonb not null default '{}'::jsonb,
 unique(source_table,source_id,source_revision,event_type),
 check (date_precision in ('date','timestamp','unknown'))
);
create index if not exists crm_business_events_job_idx on public.crm_business_events(job_id,occurred_at desc);
create table if not exists public.crm_installer_report_revisions (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 form_id uuid not null, revision integer not null, job_id uuid, quote_id uuid,
 outcome text not null, signer_name text, issues jsonb not null default '[]'::jsonb,
 reason_code text, notes text, occurred_at timestamptz not null, unique(form_id,revision)
);
alter table public.crm_business_events enable row level security;
alter table public.crm_installer_report_revisions enable row level security;
revoke all on public.crm_business_events,public.crm_installer_report_revisions from anon,authenticated;
grant select,insert on public.crm_business_events,public.crm_installer_report_revisions to service_role;
-- API uses service_role after CRM authentication. Event tables have no browser write route.
create or replace function public.crm_append_only_event() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Business history is append-only; record a correction'; end $$;
create trigger crm_business_events_immutable before update or delete on public.crm_business_events for each row execute function public.crm_append_only_event();
create trigger crm_installer_revisions_immutable before update or delete on public.crm_installer_report_revisions for each row execute function public.crm_append_only_event();

create or replace function public.crm_task_revision() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.revision := old.revision + 1; return new; end $$;
create trigger crm_task_revision before update on public.crm_accountability_tasks for each row execute function public.crm_task_revision();
create or replace function public.crm_task_business_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare request_id_value uuid; actor_value text;
begin
 if tg_op='INSERT' or new.meta->>'last_request_id' is distinct from old.meta->>'last_request_id' then request_id_value := nullif(new.meta->>'last_request_id','')::uuid; end if;
 actor_value := case when tg_op='INSERT' or new.meta is distinct from old.meta then coalesce(nullif(new.meta->>'actor',''),'system') else 'system' end;
 insert into public.crm_business_events(source_table,source_id,source_revision,job_id,quote_id,bookkeeping_entry_id,event_type,actor,request_id,before_data,after_data,metadata)
 values('crm_accountability_tasks',new.id,new.revision,new.job_id,new.quote_id,new.bookkeeping_entry_id,'task_changed',actor_value,request_id_value,case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end,to_jsonb(new),jsonb_build_object('request_hash',new.meta->>'request_hash','reason',new.meta->>'change_reason'));
 return new;
end $$;
create trigger crm_task_business_event after insert or update on public.crm_accountability_tasks for each row execute function public.crm_task_business_event();

create or replace function public.crm_save_owned_action(p_id uuid,p_expected_revision integer,p_request_id uuid,p_payload jsonb,p_actor text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.crm_accountability_tasks; saved public.crm_accountability_tasks; replay public.crm_business_events; linked_job uuid; linked_quote uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into replay from public.crm_business_events where request_id=p_request_id;
 if found then
  if replay.source_id<>p_id or replay.metadata->>'request_hash'<>md5(p_payload::text) then raise exception 'Request identifier already used for a different change'; end if;
  return replay.after_data;
 end if;
 select * into previous from public.crm_accountability_tasks where id=p_id for update;
 if found and previous.revision<>p_expected_revision then raise exception 'ACTION_CONFLICT'; end if;
 if not found and p_expected_revision<>0 then raise exception 'ACTION_CONFLICT'; end if;
 if coalesce(trim(p_payload->>'title'),'')='' or coalesce(trim(p_payload->>'owner'),'')='' then raise exception 'Title and owner required'; end if;
 if p_payload->>'status' in ('done','canceled') and coalesce(trim(p_payload->>'resolution'),'')='' then raise exception 'Resolution required'; end if;
 if p_payload->>'status'='blocked' and coalesce(trim(p_payload->>'blocker'),'')='' then raise exception 'Blocker required'; end if;
 linked_job := nullif(p_payload->>'job_id','')::uuid; linked_quote := nullif(p_payload->>'quote_id','')::uuid;
 if linked_quote is not null then
  if not exists(select 1 from public.crm_quotes where id=linked_quote and (linked_job is null or job_id=linked_job)) then raise exception 'Quote and job linkage mismatch'; end if;
 end if;
 if nullif(p_payload->>'bookkeeping_entry_id','') is not null then
  if not exists(select 1 from public.crm_quote_bookkeeping_entries where id=(p_payload->>'bookkeeping_entry_id')::uuid and (linked_job is null or job_id=linked_job) and (linked_quote is null or quote_id=linked_quote)) then raise exception 'Bookkeeping linkage mismatch'; end if;
 end if;
 if linked_job is null and linked_quote is null and nullif(p_payload->>'bookkeeping_entry_id','') is null then raise exception 'Exact record linkage required'; end if;
 if previous.id is not null and (previous.job_id is distinct from linked_job or previous.quote_id is distinct from linked_quote or previous.bookkeeping_entry_id is distinct from nullif(p_payload->>'bookkeeping_entry_id','')::uuid) then raise exception 'Existing action linkage cannot be changed'; end if;
 insert into public.crm_accountability_tasks(id,job_id,quote_id,bookkeeping_entry_id,task_type,title,owner,status,due_on,blocker,waiting_since,resolution,order_reference,notes,completed_at,meta)
 values(p_id,linked_job,linked_quote,nullif(p_payload->>'bookkeeping_entry_id','')::uuid,coalesce(p_payload->>'task_type','operational_action'),p_payload->>'title',p_payload->>'owner',p_payload->>'status',nullif(p_payload->>'due_on','')::date,nullif(p_payload->>'blocker',''),coalesce(previous.waiting_since,now()),nullif(p_payload->>'resolution',''),nullif(p_payload->>'order_reference',''),nullif(p_payload->>'notes',''),case when p_payload->>'status'='done' then now() end,coalesce(previous.meta,'{}'::jsonb)||jsonb_build_object('actor',p_actor,'last_request_id',p_request_id,'request_hash',md5(p_payload::text),'change_reason',p_payload->>'change_reason'))
 on conflict(id) do update set title=excluded.title,owner=excluded.owner,status=excluded.status,due_on=excluded.due_on,blocker=excluded.blocker,waiting_since=excluded.waiting_since,resolution=excluded.resolution,order_reference=excluded.order_reference,notes=excluded.notes,completed_at=excluded.completed_at,meta=excluded.meta
 returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.crm_save_owned_action(uuid,integer,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_save_owned_action(uuid,integer,uuid,jsonb,text) to service_role;

create or replace function public.crm_capture_installer_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rev integer; old_rev integer; wf jsonb; open_issue boolean;
begin
 wf := coalesce(new.meta->'workflow','{}'::jsonb); rev := coalesce((wf->>'revision')::integer,0); old_rev := coalesce((old.meta->'workflow'->>'revision')::integer,0);
 if rev=old_rev and new.issues is not distinct from old.issues and wf is not distinct from coalesce(old.meta->'workflow','{}'::jsonb) then return new; end if;
 if rev<=old_rev then raise exception 'REPORT_CONFLICT'; end if;
 insert into public.crm_installer_report_revisions(form_id,revision,job_id,quote_id,outcome,signer_name,issues,reason_code,notes,occurred_at)
 values(new.id,rev,new.job_id,new.quote_id,coalesce(wf->>'outcome',new.status),new.signer_name,coalesce(new.issues,'[]'::jsonb),wf->>'reasonCode',wf->>'notes',coalesce(new.signed_at,now()));
 insert into public.crm_business_events(source_table,source_id,source_revision,job_id,quote_id,event_type,actor,occurred_at,before_data,after_data)
 values('crm_installer_forms',new.id,rev,new.job_id,new.quote_id,'installation_report',coalesce(new.signer_name,'Installer'),coalesce(new.signed_at,now()),jsonb_build_object('workflow',old.meta->'workflow','issues',old.issues),jsonb_build_object('workflow',wf,'issues',new.issues));
 open_issue := coalesce(wf->>'outcome','') in ('partially_completed','incomplete') or jsonb_array_length(coalesce(new.issues,'[]'::jsonb))>0;
 if open_issue then
  insert into public.crm_accountability_tasks(job_id,quote_id,task_type,status,title,owner,blocker,waiting_since,meta)
  values(new.job_id,new.quote_id,'service_issue','open','Review installer issues and arrange return visit','Mike','Installer reported unfinished work or an issue',now(),jsonb_build_object('source_key','installer:'||new.id,'actor',coalesce(new.signer_name,'Installer'),'form_id',new.id,'report_revision',rev))
  on conflict ((meta->>'source_key')) where meta->>'source_key' is not null do update set status='open',completed_at=null,resolution=null,blocker=excluded.blocker,meta=crm_accountability_tasks.meta||excluded.meta;
 end if;
 -- A subsequent completed report never silently resolves the office service task.
 return new;
end $$;
create trigger crm_capture_installer_revision after update on public.crm_installer_forms for each row execute function public.crm_capture_installer_revision();
