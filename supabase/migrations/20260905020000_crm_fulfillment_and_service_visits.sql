-- Child operational evidence linked to purchased quote scope; no financial columns.
create table public.crm_fulfillment_scopes(quote_id uuid primary key references public.crm_quotes(id),job_id uuid not null references public.crm_jobs(id),source_revision text not null,lines jsonb not null,revision integer not null default 1,verified_by text not null default 'system',verified_at timestamptz not null default now());
create table public.crm_fulfillment_lines(
 id uuid primary key,quote_id uuid not null references public.crm_quotes(id),job_id uuid not null references public.crm_jobs(id),source_line_id text not null,source_revision text not null,room text not null,quantity integer not null check(quantity>0),
 vendor_name text not null,vendor_order_ref text not null,state text not null check(state in ('unprepared','submitted','acknowledged','canceled')),
 original_promised_on date,promised_on date,hold_reason text,hold_since timestamptz,remake_of uuid references public.crm_fulfillment_lines(id),revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index crm_fulfillment_purchased_line on public.crm_fulfillment_lines(quote_id,source_line_id) where remake_of is null;
create index crm_fulfillment_quote_idx on public.crm_fulfillment_lines(quote_id);
create table public.crm_product_movements(
 id uuid primary key,line_id uuid not null references public.crm_fulfillment_lines(id),kind text not null check(kind in ('shipped','received','damaged','returned')),quantity integer not null check(quantity>=0),occurred_on date not null,evidence text not null,carrier_reference text,correction_of uuid unique references public.crm_product_movements(id),reason text not null,created_at timestamptz not null default now()
);
create index crm_product_movements_line_idx on public.crm_product_movements(line_id);
create trigger crm_product_movements_immutable before update or delete on public.crm_product_movements for each row execute function public.crm_append_only_event();
create table public.crm_service_visits(
 id uuid primary key,quote_id uuid not null references public.crm_quotes(id),job_id uuid not null references public.crm_jobs(id),task_id uuid references public.crm_accountability_tasks(id),calendar_event_id uuid references public.crm_calendar_events(id),installer_form_id uuid references public.crm_installer_forms(id),report_revision integer,affected_line_ids jsonb not null default '[]',original_visit_id uuid references public.crm_service_visits(id),reason text not null,owner text not null,outcome text not null check(outcome in ('planned','partial','complete','canceled')),resolution text,revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_service_visits_quote_idx on public.crm_service_visits(quote_id);
alter table public.crm_fulfillment_scopes enable row level security;
alter table public.crm_fulfillment_lines enable row level security;
alter table public.crm_product_movements enable row level security;
alter table public.crm_service_visits enable row level security;
revoke all on public.crm_fulfillment_scopes,public.crm_fulfillment_lines,public.crm_product_movements,public.crm_service_visits from anon,authenticated;
grant select,insert,update on public.crm_fulfillment_scopes,public.crm_fulfillment_lines,public.crm_service_visits to service_role;
grant select,insert on public.crm_product_movements to service_role;
create policy service_fulfillment_scope on public.crm_fulfillment_scopes for all to service_role using(true) with check(true);
create policy service_fulfillment_line on public.crm_fulfillment_lines for all to service_role using(true) with check(true);
create policy service_product_movement on public.crm_product_movements for all to service_role using(true) with check(true);
create policy service_service_visit on public.crm_service_visits for all to service_role using(true) with check(true);
-- Single transaction for evidence and its attributed business event. The authenticated API supplies verified purchased scope.
create function public.crm_save_fulfillment(p_kind text,p_id uuid,p_expected_revision integer,p_request_id uuid,p_payload jsonb,p_actor text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare old_data jsonb; saved jsonb; replay public.crm_business_events; rev integer; q uuid; j uuid; line public.crm_fulfillment_lines; prior public.crm_product_movements; record_table text; source_line jsonb; wf jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into replay from public.crm_business_events where request_id=p_request_id;
 if found then if replay.source_id<>p_id or replay.metadata->>'request_hash'<>(md5(p_payload::text)||':'||p_kind) then raise exception 'Request already used'; end if;return replay.after_data;end if;
 q:=(p_payload->>'quote_id')::uuid;j:=(p_payload->>'job_id')::uuid;
 if not exists(select 1 from crm_quotes where id=q and job_id=j) then raise exception 'Exact quote/job mismatch';end if;
 if coalesce(trim(p_payload->>'reason'),'')='' then raise exception 'Evidence change reason required';end if;
 if p_kind='line' then
  record_table:='crm_fulfillment_lines';select to_jsonb(l) into old_data from crm_fulfillment_lines l where id=p_id for update;
  if coalesce((old_data->>'revision')::integer,0)<>p_expected_revision then raise exception 'FULFILLMENT_CONFLICT';end if;
  select x into source_line from jsonb_array_elements(p_payload->'scope'->'lines') x where x->>'id'=p_payload->>'source_line_id';
  if source_line is null or (source_line->>'quantity')::integer < (p_payload->>'quantity')::integer then raise exception 'Purchased opening required';end if;
  if old_data is not null and (old_data->>'quote_id'<>q::text or old_data->>'source_line_id'<>p_payload->>'source_line_id') then raise exception 'Purchased opening linkage cannot be rewritten';end if;
  if nullif(p_payload->>'remake_of','') is not null and not exists(select 1 from crm_fulfillment_lines where id=(p_payload->>'remake_of')::uuid and quote_id=q and source_line_id=p_payload->>'source_line_id') then raise exception 'Remake must link the original purchased opening';end if;
  insert into crm_fulfillment_scopes(quote_id,job_id,source_revision,lines,verified_by) values(q,j,p_payload->'scope'->>'source_revision',p_payload->'scope'->'lines',p_actor) on conflict(quote_id) do update set source_revision=excluded.source_revision,lines=excluded.lines,verified_by=excluded.verified_by,revision=crm_fulfillment_scopes.revision+1,verified_at=now();
  insert into crm_fulfillment_lines(id,quote_id,job_id,source_line_id,source_revision,room,quantity,vendor_name,vendor_order_ref,state,original_promised_on,promised_on,hold_reason,hold_since,remake_of)
  values(p_id,q,j,p_payload->>'source_line_id',p_payload->'scope'->>'source_revision',source_line->>'room',(p_payload->>'quantity')::integer,p_payload->>'vendor_name',p_payload->>'vendor_order_ref',p_payload->>'state',nullif(p_payload->>'promised_on','')::date,nullif(p_payload->>'promised_on','')::date,nullif(p_payload->>'hold_reason',''),case when nullif(p_payload->>'hold_reason','') is not null then now() end,nullif(p_payload->>'remake_of','')::uuid)
  on conflict(id) do update set source_revision=excluded.source_revision,room=excluded.room,quantity=excluded.quantity,vendor_name=excluded.vendor_name,vendor_order_ref=excluded.vendor_order_ref,state=excluded.state,promised_on=excluded.promised_on,hold_reason=excluded.hold_reason,hold_since=case when excluded.hold_reason is null then null else coalesce(crm_fulfillment_lines.hold_since,now()) end,revision=crm_fulfillment_lines.revision+1,updated_at=now() returning to_jsonb(crm_fulfillment_lines.*) into saved;
 elsif p_kind='movement' then
  record_table:='crm_product_movements';select * into line from crm_fulfillment_lines where id=(p_payload->>'line_id')::uuid for update;
  if line.id is null or line.quote_id<>q or line.job_id<>j then raise exception 'Movement opening mismatch';end if;
  if nullif(p_payload->>'correction_of','') is not null then
   select * into prior from crm_product_movements where id=(p_payload->>'correction_of')::uuid;
   if prior.id is null or prior.line_id<>line.id or prior.kind<>p_payload->>'kind' or exists(select 1 from crm_product_movements where correction_of=prior.id) then raise exception 'Correction must reference current evidence of the same kind';end if;
  elsif (p_payload->>'quantity')::integer<=0 then raise exception 'Positive quantity required';end if;
  if coalesce(trim(p_payload->>'evidence'),'')='' then raise exception 'Receipt or shipment evidence required';end if;
  insert into crm_product_movements(id,line_id,kind,quantity,occurred_on,evidence,carrier_reference,correction_of,reason) values(p_id,line.id,p_payload->>'kind',(p_payload->>'quantity')::integer,(p_payload->>'occurred_on')::date,p_payload->>'evidence',nullif(p_payload->>'carrier_reference',''),nullif(p_payload->>'correction_of','')::uuid,p_payload->>'reason') returning to_jsonb(crm_product_movements.*) into saved;
 elsif p_kind='visit' then
  record_table:='crm_service_visits';select to_jsonb(v) into old_data from crm_service_visits v where id=p_id for update;
  if coalesce((old_data->>'revision')::integer,0)<>p_expected_revision then raise exception 'FULFILLMENT_CONFLICT';end if;
  if old_data is not null and old_data->>'quote_id'<>q::text then raise exception 'Visit linkage cannot change';end if;
  if coalesce(trim(p_payload->>'owner'),'')='' then raise exception 'Visit owner required';end if;
  if nullif(old_data->>'original_visit_id','') is not null and old_data->>'original_visit_id' is distinct from p_payload->>'original_visit_id' then raise exception 'Original visit linkage is immutable';end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'affected_line_ids') x where not exists(select 1 from crm_fulfillment_lines where id=x::uuid and quote_id=q)) then raise exception 'Affected opening mismatch';end if;
  if nullif(p_payload->>'task_id','') is not null and not exists(select 1 from crm_accountability_tasks where id=(p_payload->>'task_id')::uuid and quote_id=q) then raise exception 'Service task mismatch';end if;
  if nullif(p_payload->>'calendar_event_id','') is not null and not exists(select 1 from crm_calendar_events where id=(p_payload->>'calendar_event_id')::uuid and job_id=j and event_type='install') then raise exception 'Installation appointment mismatch';end if;
  if nullif(p_payload->>'original_visit_id','') is not null and not exists(select 1 from crm_service_visits where id=(p_payload->>'original_visit_id')::uuid and quote_id=q and id<>p_id) then raise exception 'Original visit mismatch';end if;
  if nullif(p_payload->>'installer_form_id','') is not null then
   select meta->'workflow' into wf from crm_installer_forms where id=(p_payload->>'installer_form_id')::uuid and quote_id=q;
   if wf is null or (wf->>'revision')::integer is distinct from (p_payload->>'report_revision')::integer then raise exception 'Report revision mismatch';end if;
  end if;
  if p_payload->>'outcome'='complete' and (wf is null or wf->>'outcome'<>'completed' or coalesce(trim(p_payload->>'resolution'),'')='') then raise exception 'Completed report and office resolution required';end if;
  if p_payload->>'outcome'='complete' and exists(select 1 from crm_installer_forms where id=(p_payload->>'installer_form_id')::uuid and jsonb_array_length(coalesce(issues,'[]'))>0) then raise exception 'Resolve reported issues before clean visit completion';end if;
  if p_payload->>'outcome'='complete' and nullif(p_payload->>'original_visit_id','') is not null and exists(select 1 from crm_service_visits where id=(p_payload->>'original_visit_id')::uuid and installer_form_id=(p_payload->>'installer_form_id')::uuid and report_revision >= (p_payload->>'report_revision')::integer) then raise exception 'Return visit requires a newer installer report';end if;
  insert into crm_service_visits(id,quote_id,job_id,task_id,calendar_event_id,installer_form_id,report_revision,affected_line_ids,original_visit_id,reason,owner,outcome,resolution)
  values(p_id,q,j,nullif(p_payload->>'task_id','')::uuid,nullif(p_payload->>'calendar_event_id','')::uuid,nullif(p_payload->>'installer_form_id','')::uuid,nullif(p_payload->>'report_revision','')::integer,coalesce(p_payload->'affected_line_ids','[]'),nullif(p_payload->>'original_visit_id','')::uuid,p_payload->>'reason',p_payload->>'owner',p_payload->>'outcome',nullif(p_payload->>'resolution',''))
  on conflict(id) do update set original_visit_id=coalesce(crm_service_visits.original_visit_id,excluded.original_visit_id),task_id=excluded.task_id,calendar_event_id=excluded.calendar_event_id,installer_form_id=excluded.installer_form_id,report_revision=excluded.report_revision,affected_line_ids=excluded.affected_line_ids,reason=excluded.reason,owner=excluded.owner,outcome=excluded.outcome,resolution=excluded.resolution,revision=crm_service_visits.revision+1,updated_at=now() returning to_jsonb(crm_service_visits.*) into saved;
 else raise exception 'Unsupported fulfillment record';end if;
 rev:=coalesce((saved->>'revision')::integer,1);
 insert into crm_business_events(source_table,source_id,source_revision,job_id,quote_id,event_type,actor,request_id,before_data,after_data,metadata) values(record_table,p_id,rev,j,q,'fulfillment_'||p_kind,p_actor,p_request_id,coalesce(old_data,'{}'),saved,jsonb_build_object('reason',p_payload->>'reason','request_hash',md5(p_payload::text)||':'||p_kind));
 return saved;
end $$;
revoke all on function public.crm_save_fulfillment(text,uuid,integer,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_save_fulfillment(text,uuid,integer,uuid,jsonb,text) to service_role;

create function public.crm_fulfillment_scope_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into crm_business_events(source_table,source_id,source_revision,job_id,quote_id,event_type,actor,before_data,after_data)
 values('crm_fulfillment_scopes',new.quote_id,new.revision,new.job_id,new.quote_id,'purchased_scope_verified',new.verified_by,case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
create trigger crm_fulfillment_scope_event after insert or update on public.crm_fulfillment_scopes for each row execute function public.crm_fulfillment_scope_event();
