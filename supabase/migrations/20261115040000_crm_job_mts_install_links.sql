-- Additive only. New 1:1 table and upsert function. Does not alter crm_jobs.
--
-- 805 Shutters may store only this linked MTS install summary. The table has no
-- columns for MTS customer info, installer or contractor pay, payroll, MTS
-- internal labor cost, or MTS company financials. A match is an identifier
-- (job ref, contract number, work order, or purchase order), plus a flag when
-- that match is ambiguous.

create table public.crm_job_mts_install_links (
  job_id uuid primary key references public.crm_jobs(id) on delete cascade,
  mts_job_id text,
  mts_job_number text,
  scheduled_install_date date,
  install_status text,
  verified_completion_date date,
  open_issues jsonb not null default '[]'::jsonb,
  charge_amount numeric(12, 2),
  charge_basis text,
  record_references jsonb not null default '{}'::jsonb,
  match_basis text not null,
  match_status text not null,
  last_verified_at timestamptz not null,
  verified_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_job_mts_install_links_charge_basis_check
    check (charge_basis is null or charge_basis in ('estimated', 'invoiced')),
  constraint crm_job_mts_install_links_charge_pair_check
    check ((charge_amount is null) = (charge_basis is null)),
  constraint crm_job_mts_install_links_match_basis_check
    check (match_basis in ('job_ref', 'contract_number', 'work_order', 'purchase_order')),
  constraint crm_job_mts_install_links_match_status_check
    check (match_status in ('verified', 'ambiguous')),
  constraint crm_job_mts_install_links_open_issues_check
    check (jsonb_typeof(open_issues) = 'array'),
  constraint crm_job_mts_install_links_references_check
    check (
      jsonb_typeof(record_references) = 'object'
      and (
        record_references - array[
          'mts_job_ref',
          'mts_invoice_number',
          'bill_805_ref',
          'contract_number',
          'work_order',
          'purchase_order'
        ]::text[]
      ) = '{}'::jsonb
    ),
  constraint crm_job_mts_install_links_match_identifier_check
    check (
      case match_basis
        when 'job_ref' then coalesce(record_references->>'mts_job_ref', '') <> ''
        when 'contract_number' then coalesce(record_references->>'contract_number', '') <> ''
        when 'work_order' then coalesce(record_references->>'work_order', '') <> ''
        when 'purchase_order' then coalesce(record_references->>'purchase_order', '') <> ''
        else false
      end
    ),
  constraint crm_job_mts_install_links_verified_by_check
    check (length(trim(verified_by)) > 0)
);

create index crm_job_mts_install_links_verified_idx
  on public.crm_job_mts_install_links (last_verified_at desc);

comment on table public.crm_job_mts_install_links is
  '805-side summary of a linked MTS install. One row per crm_jobs id. No MTS customer, payroll, contractor pay, or MTS labor cost.';

alter table public.crm_job_mts_install_links enable row level security;

revoke all on public.crm_job_mts_install_links from public, anon, authenticated;
grant select, insert, update on public.crm_job_mts_install_links to service_role;

create policy "service role can manage crm job mts install links"
  on public.crm_job_mts_install_links
  for all
  to service_role
  using (true)
  with check (true);

create function public.crm_upsert_job_mts_install_link(
  p_job_id uuid,
  p_payload jsonb,
  p_actor text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  allowed text[] := array[
    'mts_job_id', 'mts_job_number', 'scheduled_install_date', 'install_status',
    'verified_completion_date', 'open_issues', 'charge_amount', 'charge_basis',
    'record_references', 'match_basis', 'match_status'
  ];
  reference_keys text[] := array[
    'mts_job_ref', 'mts_invoice_number', 'bill_805_ref',
    'contract_number', 'work_order', 'purchase_order'
  ];
  extra text;
  v_mts_job_id text;
  v_mts_job_number text;
  v_scheduled text;
  v_scheduled_date date;
  v_completed text;
  v_completed_date date;
  v_status text;
  v_amount numeric;
  v_basis text;
  v_refs jsonb := '{}'::jsonb;
  v_match_basis text;
  v_match_status text;
  v_match_value text;
  v_issues jsonb := '[]'::jsonb;
  v_raw jsonb;
  v_item jsonb;
  old_data jsonb;
  saved jsonb;
begin
  if p_job_id is null then
    raise exception 'CRM job was not found';
  end if;
  if coalesce(trim(p_actor), '') = '' then
    raise exception 'MTS install link verifier is required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'MTS install link payload must be an object';
  end if;
  if octet_length(p_payload::text) > 12000 then
    raise exception 'MTS install link payload is too large';
  end if;

  select string_agg(key, ', ' order by key) into extra
  from jsonb_object_keys(p_payload) as key
  where not (key = any (allowed));
  if extra is not null then
    raise exception 'MTS install link field is not allowed: %', extra;
  end if;

  if p_payload ? 'mts_job_id' and jsonb_typeof(p_payload->'mts_job_id') not in ('string', 'null') then
    raise exception 'mts_job_id must be short text';
  end if;
  v_mts_job_id := nullif(trim(p_payload->>'mts_job_id'), '');
  if v_mts_job_id is not null and length(v_mts_job_id) > 80 then
    raise exception 'mts_job_id is too long';
  end if;

  if p_payload ? 'mts_job_number' and jsonb_typeof(p_payload->'mts_job_number') not in ('string', 'null') then
    raise exception 'mts_job_number must be short text';
  end if;
  v_mts_job_number := nullif(trim(p_payload->>'mts_job_number'), '');
  if v_mts_job_number is not null and length(v_mts_job_number) > 80 then
    raise exception 'mts_job_number is too long';
  end if;

  if p_payload ? 'install_status' and jsonb_typeof(p_payload->'install_status') not in ('string', 'null') then
    raise exception 'install_status must be short text';
  end if;
  v_status := nullif(trim(p_payload->>'install_status'), '');
  if v_status is not null and length(v_status) > 200 then
    raise exception 'install_status is too long';
  end if;

  v_scheduled := nullif(trim(p_payload->>'scheduled_install_date'), '');
  if v_scheduled is not null then
    if v_scheduled !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'scheduled_install_date must be a calendar date';
    end if;
    begin
      v_scheduled_date := v_scheduled::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'scheduled_install_date must be a calendar date';
    end;
  end if;

  v_completed := nullif(trim(p_payload->>'verified_completion_date'), '');
  if v_completed is not null then
    if v_completed !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'verified_completion_date must be a calendar date';
    end if;
    begin
      v_completed_date := v_completed::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'verified_completion_date must be a calendar date';
    end;
  end if;

  if p_payload ? 'charge_amount' and jsonb_typeof(p_payload->'charge_amount') not in ('number', 'null') then
    raise exception 'charge_amount must be a number';
  end if;
  if p_payload ? 'charge_amount' and jsonb_typeof(p_payload->'charge_amount') = 'number' then
    v_amount := round((p_payload->>'charge_amount')::numeric, 2);
    if v_amount < 0 or v_amount > 9999999999.99 then
      raise exception 'charge_amount is out of range';
    end if;
  end if;
  if p_payload ? 'charge_basis' and jsonb_typeof(p_payload->'charge_basis') not in ('string', 'null') then
    raise exception 'charge_basis must be estimated or invoiced when an install charge amount is set';
  end if;
  v_basis := nullif(trim(p_payload->>'charge_basis'), '');
  if v_amount is not null and coalesce(v_basis, '') not in ('estimated', 'invoiced') then
    raise exception 'charge_basis must be estimated or invoiced when an install charge amount is set';
  end if;
  if v_amount is null and v_basis is not null then
    raise exception 'charge_basis requires an install charge amount';
  end if;

  if not (p_payload ? 'open_issues') or jsonb_typeof(p_payload->'open_issues') = 'null' then
    v_raw := '[]'::jsonb;
  elsif jsonb_typeof(p_payload->'open_issues') = 'string' then
    v_raw := jsonb_build_array(p_payload->'open_issues');
  elsif jsonb_typeof(p_payload->'open_issues') = 'array' then
    v_raw := p_payload->'open_issues';
  else
    raise exception 'open_issues must be short text or a list of short text';
  end if;
  if jsonb_array_length(v_raw) > 40 then
    raise exception 'open_issues list is too long';
  end if;
  for v_item in select value from jsonb_array_elements(v_raw)
  loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'open_issues must be short text or a list of short text';
    end if;
    if length(trim(v_item->>0)) = 0 then
      continue;
    end if;
    if length(trim(v_item->>0)) > 240 then
      raise exception 'open_issues text is too long';
    end if;
    v_issues := v_issues || jsonb_build_array(trim(v_item->>0));
  end loop;

  if p_payload ? 'record_references' and jsonb_typeof(p_payload->'record_references') <> 'null' then
    if jsonb_typeof(p_payload->'record_references') <> 'object' then
      raise exception 'record_references must be an object';
    end if;
    select string_agg(key, ', ' order by key) into extra
    from jsonb_object_keys(p_payload->'record_references') as key
    where not (key = any (reference_keys));
    if extra is not null then
      raise exception 'MTS install link field is not allowed: %', extra;
    end if;
    if exists (
      select 1 from jsonb_each(p_payload->'record_references') item
      where jsonb_typeof(item.value) <> 'string'
    ) then
      raise exception 'record_references values must be short text';
    end if;
    select coalesce(jsonb_object_agg(item.key, to_jsonb(trim(item.value->>0))), '{}'::jsonb)
      into v_refs
    from jsonb_each(p_payload->'record_references') item
    where length(trim(item.value->>0)) > 0 and length(trim(item.value->>0)) <= 120;
    if exists (
      select 1 from jsonb_each(p_payload->'record_references') item
      where length(trim(item.value->>0)) > 120
    ) then
      raise exception 'record_references values must be short text';
    end if;
  end if;

  v_match_basis := nullif(trim(p_payload->>'match_basis'), '');
  if coalesce(v_match_basis, '') not in ('job_ref', 'contract_number', 'work_order', 'purchase_order') then
    raise exception 'match_basis must be job_ref, contract_number, work_order, or purchase_order';
  end if;
  v_match_status := nullif(trim(p_payload->>'match_status'), '');
  if coalesce(v_match_status, '') not in ('verified', 'ambiguous') then
    raise exception 'match_status must be verified or ambiguous';
  end if;
  v_match_value := case v_match_basis
    when 'job_ref' then v_refs->>'mts_job_ref'
    when 'contract_number' then v_refs->>'contract_number'
    when 'work_order' then v_refs->>'work_order'
    when 'purchase_order' then v_refs->>'purchase_order'
  end;
  if coalesce(v_match_value, '') = '' then
    raise exception 'match_basis requires the verified identifier in record_references';
  end if;

  perform 1 from public.crm_jobs where id = p_job_id for update;
  if not found then
    raise exception 'CRM job was not found';
  end if;

  select to_jsonb(existing.*) into old_data
  from public.crm_job_mts_install_links existing
  where existing.job_id = p_job_id
  for update;

  insert into public.crm_job_mts_install_links (
    job_id, mts_job_id, mts_job_number, scheduled_install_date, install_status,
    verified_completion_date, open_issues, charge_amount, charge_basis,
    record_references, match_basis, match_status, last_verified_at, verified_by
  ) values (
    p_job_id, v_mts_job_id, v_mts_job_number, v_scheduled_date, v_status,
    v_completed_date, v_issues, v_amount, v_basis,
    v_refs, v_match_basis, v_match_status, now(), trim(p_actor)
  )
  on conflict (job_id) do update set
    mts_job_id = excluded.mts_job_id,
    mts_job_number = excluded.mts_job_number,
    scheduled_install_date = excluded.scheduled_install_date,
    install_status = excluded.install_status,
    verified_completion_date = excluded.verified_completion_date,
    open_issues = excluded.open_issues,
    charge_amount = excluded.charge_amount,
    charge_basis = excluded.charge_basis,
    record_references = excluded.record_references,
    match_basis = excluded.match_basis,
    match_status = excluded.match_status,
    last_verified_at = now(),
    verified_by = excluded.verified_by,
    updated_at = now()
  returning to_jsonb(crm_job_mts_install_links.*) into saved;

  insert into public.crm_activity_events (
    actor_auth_user_id, actor_email, entity_type, entity_id, action,
    before_data, after_data, metadata
  ) values (
    p_actor_user_id, trim(p_actor), 'job', p_job_id, 'mts_install_link.upsert',
    old_data, saved, jsonb_build_object('source', 'mts_install_link')
  );

  return saved;
end;
$function$;

revoke all on function public.crm_upsert_job_mts_install_link(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.crm_upsert_job_mts_install_link(uuid, jsonb, text, uuid) to service_role;

comment on function public.crm_upsert_job_mts_install_link(uuid, jsonb, text, uuid) is
  'Idempotent upsert of the 805 linked MTS install summary. Stamps last_verified_at and verified_by. Rejects every field outside the allowed summary.';
