-- Dedicated 805 project only. No public/client read or execute permissions.
create table public.voice_805_state (
  id text primary key check (id in ('pilot','production')),
  revision bigint not null default 0,
  body jsonb not null default '{"entities":{},"events":{},"inbound":{}}',
  updated_at timestamptz not null default now(),
  constraint voice_805_state_size check (octet_length(body::text) <= 16777216)
);
alter table public.voice_805_state enable row level security;
revoke all on public.voice_805_state from public, anon, authenticated;
grant select, insert, update on public.voice_805_state to service_role;
insert into public.voice_805_state(id) values ('pilot'),('production');
create function public.voice_805_commit(p_id text, p_revision bigint, p_body jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.voice_805_state set body=p_body, revision=revision+1, updated_at=now()
  where id=p_id and revision=p_revision;
  return found;
end;
$$;
revoke all on function public.voice_805_commit(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.voice_805_commit(text,bigint,jsonb) to service_role;

create function public.voice_805_normalize_phone(p_phone text)
returns text language sql immutable strict security invoker set search_path='' as $$
 select case
 when p_phone !~ '^[+0-9().[:space:]-]+$' then null
 when trim(p_phone) like '+%' and regexp_replace(p_phone,'[^0-9]','','g') ~ '^[1-9][0-9]{7,14}$'
 then '+' || regexp_replace(p_phone,'[^0-9]','','g')
 when length(regexp_replace(p_phone,'[^0-9]','','g'))=10 then '+1' || regexp_replace(p_phone,'[^0-9]','','g')
 when regexp_replace(p_phone,'[^0-9]','','g') ~ '^1[0-9]{10}$' then '+' || regexp_replace(p_phone,'[^0-9]','','g')
 else null end
$$;
revoke all on function public.voice_805_normalize_phone(text) from public,anon,authenticated;
grant execute on function public.voice_805_normalize_phone(text) to service_role;
create index voice_805_customers_phone_idx on public.crm_customers(public.voice_805_normalize_phone(phone)) where (meta->>'deleted_at') is null;
create index voice_805_jobs_phone_idx on public.crm_jobs(public.voice_805_normalize_phone(phone)) where (meta->>'deleted_at') is null;

create function public.voice_805_caller_context(p_phone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare matches uuid[]; customer_record record; stages jsonb;
begin
 if public.voice_805_normalize_phone(p_phone) is null then return jsonb_build_object('match','unmatched'); end if;
 select array_agg(id) into matches from public.crm_customers
 where public.voice_805_normalize_phone(phone)=public.voice_805_normalize_phone(p_phone) and (meta->>'deleted_at') is null;
 if coalesce(cardinality(matches),0)=0 then return jsonb_build_object('match','unmatched'); end if;
 if cardinality(matches)<>1 then return jsonb_build_object('match','ambiguous'); end if;
 select id,display_name into customer_record from public.crm_customers where id=matches[1];
 -- Never select finance, address, notes or appointment data for the voice agent.
 -- Conflicting/multiple current stages remain a clarification, not a guessed latest job.
 select coalesce(jsonb_agg(distinct case when q.stage_count > 1 then 'ambiguous' else coalesce(q.stage,j.status) end),'[]'::jsonb) into stages from public.crm_jobs j
 left join lateral (
   select count(distinct status) stage_count, case when count(distinct status)=1 then min(status) else null end stage
   from public.crm_quotes where job_id=j.id and status not in ('draft','archived','lost')
 ) q on j.status not in ('closed','lost')
 where public.voice_805_normalize_phone(j.phone)=public.voice_805_normalize_phone(p_phone) and (j.meta->>'deleted_at') is null;
 return jsonb_build_object('match','matched','customer_id',customer_record.id,
 'customer_name',customer_record.display_name,'first_name',split_part(trim(customer_record.display_name),' ',1),'statuses',stages);
end;
$$;
revoke all on function public.voice_805_caller_context(text) from public,anon,authenticated;
grant execute on function public.voice_805_caller_context(text) to service_role;
