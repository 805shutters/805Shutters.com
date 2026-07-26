-- Atomic, idempotent CRM -> Quote V2 structural import.
--
-- The customer-facing CRM quote remains unchanged. This function creates one
-- separate server-owned V2 draft, copies the exact stored line/design identity
-- and configuration with every price invalidated, and only then records the
-- internal typed target link on crm_quotes.meta.

create table if not exists public.sales_quote_v2_import_requests (
  crm_quote_id uuid primary key references public.crm_quotes(id) on delete restrict,
  sales_quote_id uuid not null unique references public.sales_quotes(id) on delete restrict,
  source_updated_at timestamptz not null,
  request_hash text not null,
  actor_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_import_requests_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$')
);

alter table public.sales_quote_v2_import_requests enable row level security;
revoke all on public.sales_quote_v2_import_requests from public, anon, authenticated;
grant all on public.sales_quote_v2_import_requests to service_role;

drop trigger if exists sales_quote_v2_import_requests_append_only
  on public.sales_quote_v2_import_requests;
create trigger sales_quote_v2_import_requests_append_only
before update or delete
on public.sales_quote_v2_import_requests
for each row
execute function public.reject_v2_audit_mutation();

create or replace function public.import_crm_quote_to_v2(
  p_crm_quote_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_source_updated_at timestamptz,
  p_structure jsonb,
  p_target_sales_quote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_crm_quote public.crm_quotes%rowtype;
  v_job public.crm_jobs%rowtype;
  v_target_quote public.sales_quotes%rowtype;
  v_existing public.sales_quote_v2_import_requests%rowtype;
  v_actor_email text;
  v_request_hash text;
  v_quote_id uuid := gen_random_uuid();
  v_quote_revision bigint := 1;
  v_quote_status text := 'draft';
  v_reused_target boolean := false;
  v_quote_number text;
  v_customer_name text;
  v_sales_owner text;
  v_line jsonb;
  v_design jsonb;
  v_line_id uuid;
  v_design_id uuid;
  v_selected_design_id uuid;
  v_line_count integer;
  v_design_count integer;
  v_reselection_line_count integer := 0;
  v_source_line_count integer;
  v_source_design_count integer;
  v_fraction text;
  v_options jsonb;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CRM Quote V2 import requires the service role.'
      using errcode = '42501';
  end if;
  if p_crm_quote_id is null or p_actor_id is null then
    raise exception 'A CRM quote ID and authenticated actor ID are required.'
      using errcode = '22023';
  end if;
  select lower(profiles.email)
    into v_actor_email
    from public.crm_profiles profiles
   where profiles.id = p_actor_id
     and profiles.active = true
     and lower(profiles.email) in (
       '805shutters@gmail.com',
       'jessica@805shutters.com'
     );
  if not found then
    raise exception 'The Quote V2 actor is not authorized to import CRM quotes.'
      using errcode = '42501';
  end if;
  if p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
  then
    raise exception 'A non-empty import idempotency key of at most 200 characters is required.'
      using errcode = '22023';
  end if;
  if p_source_updated_at is null
    or jsonb_typeof(p_structure) is distinct from 'object'
    or jsonb_typeof(p_structure -> 'lines') is distinct from 'array'
  then
    raise exception 'The CRM Quote V2 import structure is malformed.'
      using errcode = '22023';
  end if;
  if octet_length(p_structure::text) > 2000000 then
    raise exception 'The CRM Quote V2 import structure is too large.'
      using errcode = '22023';
  end if;

  v_request_hash := encode(
    digest(convert_to(
      p_crm_quote_id::text || ':' || p_source_updated_at::text || ':' ||
      coalesce(p_target_sales_quote_id::text, 'new') || ':' ||
      p_structure::text,
      'UTF8'
    ), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('quote-v2-crm-import:' || p_crm_quote_id::text, 0)
  );
  select requests.*
    into v_existing
    from public.sales_quote_v2_import_requests requests
   where requests.crm_quote_id = p_crm_quote_id;
  if found then
    return v_existing.result;
  end if;

  select quotes.*
    into v_crm_quote
    from public.crm_quotes quotes
   where quotes.id = p_crm_quote_id
   for update;
  if not found then
    raise exception 'CRM quote % does not exist.', p_crm_quote_id
      using errcode = 'P0002';
  end if;
  if v_crm_quote.updated_at is distinct from p_source_updated_at then
    raise exception 'The CRM quote changed while its V2 import was being prepared.'
      using errcode = '40001';
  end if;

  select jobs.*
    into v_job
    from public.crm_jobs jobs
   where jobs.id = v_crm_quote.job_id;
  if not found then
    raise exception 'The CRM quote customer/job identity is unavailable.'
      using errcode = '23503';
  end if;

  v_quote_number := nullif(btrim(v_crm_quote.quote_number), '');
  if v_quote_number is null then
    raise exception 'The CRM quote has no recorded quote number.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.sales_quotes quotes
     where quotes.quote_number = v_quote_number
       and (
         p_target_sales_quote_id is null
         or quotes.id <> p_target_sales_quote_id
       )
  ) then
    raise exception 'Quote number % already belongs to a different sales quote.',
      v_quote_number
      using errcode = '23505';
  end if;
  v_customer_name := nullif(btrim(v_job.customer_name), '');
  if v_customer_name is null then
    raise exception 'The CRM quote has no recorded customer identity.'
      using errcode = '22023';
  end if;

  v_line_count := jsonb_array_length(p_structure -> 'lines');
  if v_line_count < 1 or v_line_count > 40 then
    raise exception 'CRM Quote V2 import requires between 1 and 40 lines.'
      using errcode = '23514';
  end if;
  select count(*)::integer
    into v_source_line_count
    from public.crm_quote_line_items lines
   where lines.quote_id = p_crm_quote_id;
  select count(*)::integer
    into v_source_design_count
    from public.crm_quote_designs designs
    join public.crm_quote_line_items lines
      on lines.id = designs.line_item_id
   where lines.quote_id = p_crm_quote_id;
  select coalesce(sum(jsonb_array_length(line -> 'designs')), 0)::integer
    into v_design_count
    from jsonb_array_elements(p_structure -> 'lines') line;
  if v_source_line_count <> v_line_count
    or v_source_design_count <> v_design_count
    or v_design_count < 1
  then
    raise exception 'The prepared V2 structure does not exactly match the stored CRM quote.'
      using errcode = '40001';
  end if;
  if (
    select count(distinct line ->> 'sourceLineItemId')
    from jsonb_array_elements(p_structure -> 'lines') line
  ) <> v_line_count then
    raise exception 'The prepared V2 structure contains duplicate line identities.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_structure -> 'lines') line
     where not exists (
       select 1 from public.crm_quote_line_items source_lines
        where source_lines.id = (line ->> 'sourceLineItemId')::uuid
          and source_lines.quote_id = p_crm_quote_id
     )
       or jsonb_typeof(line -> 'designs') is distinct from 'array'
       or jsonb_array_length(line -> 'designs') < 1
  ) then
    raise exception 'The prepared V2 structure contains an invalid source line.'
      using errcode = '40001';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_structure -> 'lines') line
      cross join lateral jsonb_array_elements(line -> 'designs') design
     where not exists (
       select 1
         from public.crm_quote_designs source_designs
        where source_designs.id = (design ->> 'sourceDesignId')::uuid
          and source_designs.line_item_id =
            (line ->> 'sourceLineItemId')::uuid
     )
  ) then
    raise exception 'The prepared V2 structure contains an invalid source design.'
      using errcode = '40001';
  end if;
  if (
    select count(distinct design ->> 'sourceDesignId')
      from jsonb_array_elements(p_structure -> 'lines') line
      cross join lateral jsonb_array_elements(line -> 'designs') design
  ) <> v_design_count then
    raise exception 'The prepared V2 structure contains duplicate design identities.'
      using errcode = '22023';
  end if;

  v_sales_owner := case
    when lower(coalesce(v_crm_quote.sold_by, '')) like '%jessica%'
      then 'jessica'
    when lower(coalesce(v_crm_quote.sold_by, '')) like '%mike%'
      then 'mike'
    when v_actor_email = 'jessica@805shutters.com'
      then 'jessica'
    else 'mike'
  end;

  if p_target_sales_quote_id is not null then
    select quotes.*
      into v_target_quote
      from public.sales_quotes quotes
     where quotes.id = p_target_sales_quote_id
     for update;
    if not found then
      raise exception 'The linked sales quote target no longer exists.'
        using errcode = '40001';
    end if;
    if v_target_quote.quote_number <> v_quote_number then
      raise exception 'The linked sales quote has a conflicting quote number.'
        using errcode = '23505';
    end if;
    if exists (
      select 1 from public.sales_quote_line_items lines
       where lines.quote_id = p_target_sales_quote_id
    ) or exists (
      select 1
        from public.sales_quote_designs designs
        join public.sales_quote_line_items lines
          on lines.id = designs.line_item_id
       where lines.quote_id = p_target_sales_quote_id
    ) then
      raise exception 'The linked sales quote is no longer structurally empty.'
        using errcode = '40001';
    end if;
    if exists (
      select 1 from public.sales_quote_v2_events events
       where events.quote_id = p_target_sales_quote_id
    ) or exists (
      select 1 from public.sales_quote_v2_price_snapshots snapshots
       where snapshots.quote_id = p_target_sales_quote_id
    ) then
      raise exception 'The linked sales quote already has authoritative V2 history.'
        using errcode = '40001';
    end if;

    v_quote_id := p_target_sales_quote_id;
    v_quote_revision := greatest(
      coalesce(v_target_quote.quote_v2_revision, 0) + 1,
      1
    );
    v_quote_status := v_target_quote.status;
    v_reused_target := true;

    update public.sales_quotes
       set customer_name = case
             when btrim(customer_name) = '' then v_customer_name
             else customer_name
           end,
           customer_email = coalesce(customer_email, v_crm_quote.customer_email, v_job.email),
           customer_phone = coalesce(customer_phone, v_crm_quote.customer_phone, v_job.phone),
           customer_address = coalesce(customer_address, v_crm_quote.customer_address, v_job.address),
           appointment_date = coalesce(appointment_date, v_job.appointment_start::date),
           installer_notes = coalesce(installer_notes, v_crm_quote.notes),
           quote_group_id = coalesce(quote_group_id, v_crm_quote.quote_group_id),
           sales_owner = coalesce(sales_owner, v_sales_owner),
           sales_owner_auth_user_id = coalesce(sales_owner_auth_user_id, p_actor_id),
           sales_owner_set_at = coalesce(sales_owner_set_at, now()),
           quote_v2_backend = true,
           quote_v2_status = 'stale',
           quote_v2_catalog_version = null,
           quote_v2_revision = v_quote_revision,
           quote_v2_last_priced_at = null
     where id = v_quote_id;
  else
    insert into public.sales_quotes (
    id,
    quote_number,
    account_id,
    status,
    customer_name,
    customer_email,
    customer_phone,
    customer_address,
    appointment_date,
    installer_notes,
    product_cost,
    total_amount,
    profit_amount,
    deposit_paid,
    balance_paid,
    manufacturer_cost,
    created_by,
    quote_group_id,
    quote_letter,
    sales_owner,
    sales_owner_auth_user_id,
    sales_owner_set_at,
    quote_v2_backend,
    quote_v2_status,
    quote_v2_catalog_version,
    quote_v2_revision,
    quote_v2_last_priced_at
  ) values (
    v_quote_id,
    v_quote_number,
    '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid,
    'draft',
    v_customer_name,
    coalesce(v_crm_quote.customer_email, v_job.email),
    coalesce(v_crm_quote.customer_phone, v_job.phone),
    coalesce(v_crm_quote.customer_address, v_job.address),
    v_job.appointment_start::date,
    v_crm_quote.notes,
    0,
    0,
    0,
    0,
    0,
    0,
    p_actor_id,
    v_crm_quote.quote_group_id,
    case
      when upper(coalesce(v_crm_quote.quote_label, 'A')) ~ '^[A-Z]$'
        then upper(coalesce(v_crm_quote.quote_label, 'A'))
      else 'A'
    end,
    v_sales_owner,
    p_actor_id,
    now(),
    true,
    'stale',
    null,
    v_quote_revision,
    null
  );
  end if;

  for v_line in
    select value
      from jsonb_array_elements(p_structure -> 'lines')
     order by coalesce((value ->> 'sortOrder')::integer, 0),
       value ->> 'sourceLineItemId'
  loop
    begin
      v_line_id := (v_line ->> 'sourceLineItemId')::uuid;
      v_selected_design_id :=
        nullif(v_line ->> 'selectedDesignId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'The prepared V2 line or selected-design identity is invalid.'
        using errcode = '22023';
    end;
    if btrim(coalesce(v_line ->> 'roomName', '')) = ''
      or length(btrim(v_line ->> 'roomName')) > 200
      or btrim(coalesce(v_line ->> 'productType', '')) = ''
      or length(btrim(v_line ->> 'productType')) > 200
      or coalesce((v_line ->> 'widthWhole')::integer, 0) < 0
      or coalesce((v_line ->> 'widthWhole')::integer, 0) > 1000
      or coalesce((v_line ->> 'heightWhole')::integer, 0) < 0
      or coalesce((v_line ->> 'heightWhole')::integer, 0) > 1000
      or coalesce((v_line ->> 'quantity')::integer, 1) < 1
      or coalesce((v_line ->> 'quantity')::integer, 1) > 1000
      or coalesce((v_line ->> 'sortOrder')::integer, 0) < 0
      or coalesce((v_line ->> 'sortOrder')::integer, 0) > 10000
    then
      raise exception 'The prepared V2 line values are invalid.'
        using errcode = '22023';
    end if;
    v_fraction := coalesce(nullif(v_line ->> 'widthFraction', ''), '0');
    if v_fraction <> all(array[
      '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
      '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'
    ]) then
      raise exception 'The prepared V2 width fraction is unsupported.'
        using errcode = '22023';
    end if;
    v_fraction := coalesce(nullif(v_line ->> 'heightFraction', ''), '0');
    if v_fraction <> all(array[
      '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
      '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'
    ]) then
      raise exception 'The prepared V2 height fraction is unsupported.'
        using errcode = '22023';
    end if;
    if v_selected_design_id is not null
      and not exists (
        select 1
          from jsonb_array_elements(v_line -> 'designs') candidate
         where candidate ->> 'sourceDesignId' = v_selected_design_id::text
           and coalesce((candidate ->> 'selectDesign')::boolean, false)
      )
    then
      raise exception 'The prepared V2 selected design is not an exact source selection.'
        using errcode = '22023';
    end if;
    if v_selected_design_id is null then
      if exists (
        select 1
          from jsonb_array_elements(v_line -> 'designs') candidate
         where coalesce(
           (candidate -> 'patch' -> 'optionsJson' ->>
             'v2_import_reselection_required')::boolean,
           false
         ) = false
      ) then
        raise exception 'An unselected imported line must explicitly require catalog re-selection.'
          using errcode = '23514';
      end if;
      v_reselection_line_count := v_reselection_line_count + 1;
    end if;

    insert into public.sales_quote_line_items (
      id, quote_id, room_name, product_type,
      width_whole, width_fraction, height_whole, height_fraction,
      quantity, sort_order, selected_design_id
    ) values (
      v_line_id,
      v_quote_id,
      btrim(v_line ->> 'roomName'),
      btrim(v_line ->> 'productType'),
      coalesce((v_line ->> 'widthWhole')::integer, 0),
      coalesce(nullif(v_line ->> 'widthFraction', ''), '0'),
      coalesce((v_line ->> 'heightWhole')::integer, 0),
      coalesce(nullif(v_line ->> 'heightFraction', ''), '0'),
      coalesce((v_line ->> 'quantity')::integer, 1),
      coalesce((v_line ->> 'sortOrder')::integer, 0),
      null
    );

    for v_design in
      select value
        from jsonb_array_elements(v_line -> 'designs')
       order by value ->> 'variant', value ->> 'sourceDesignId'
    loop
      begin
        v_design_id := (v_design ->> 'sourceDesignId')::uuid;
      exception when invalid_text_representation then
        raise exception 'The prepared V2 design identity is invalid.'
          using errcode = '22023';
      end;
      if btrim(coalesce(v_design ->> 'variant', '')) = ''
        or length(btrim(v_design ->> 'variant')) > 80
        or jsonb_typeof(v_design -> 'selectDesign') is distinct from 'boolean'
        or jsonb_typeof(v_design -> 'patch') is distinct from 'object'
      then
        raise exception 'The prepared V2 design is malformed.'
          using errcode = '22023';
      end if;
      v_options := coalesce(v_design -> 'patch' -> 'optionsJson', '{}'::jsonb);
      if jsonb_typeof(v_options) is distinct from 'object'
        or octet_length(v_options::text) > 200000
        or public.quote_v2_structure_json_has_protected_key(v_options)
      then
        raise exception 'The prepared V2 design options are unsafe.'
          using errcode = '22023';
      end if;

      insert into public.sales_quote_designs (
        id, line_item_id, variant, product_type, supplier, material,
        louver_size, tilt_type, hinge_color, panel_config, mount_type,
        shade_type, lift_system, valance, fabric, motor_type, remote_type,
        hard_surface_install, ladder_over_15ft, requires_takedown,
        unit_price, notes, options_json, quote_v2_selection,
        quote_v2_price_status, quote_v2_selection_fingerprint,
        quote_v2_priced_catalog_version, quote_v2_priced_at,
        current_v2_snapshot_id
      ) values (
        v_design_id,
        v_line_id,
        btrim(v_design ->> 'variant'),
        nullif(btrim(v_design -> 'patch' ->> 'productType'), ''),
        nullif(btrim(v_design -> 'patch' ->> 'supplier'), ''),
        nullif(v_design -> 'patch' ->> 'material', ''),
        nullif(v_design -> 'patch' ->> 'louverSize', ''),
        nullif(v_design -> 'patch' ->> 'tiltType', ''),
        nullif(v_design -> 'patch' ->> 'hingeColor', ''),
        nullif(v_design -> 'patch' ->> 'panelConfig', ''),
        nullif(v_design -> 'patch' ->> 'mountType', ''),
        nullif(v_design -> 'patch' ->> 'shadeType', ''),
        nullif(v_design -> 'patch' ->> 'liftSystem', ''),
        nullif(v_design -> 'patch' ->> 'valance', ''),
        nullif(v_design -> 'patch' ->> 'fabric', ''),
        nullif(v_design -> 'patch' ->> 'motorType', ''),
        nullif(v_design -> 'patch' ->> 'remoteType', ''),
        coalesce((v_design -> 'patch' ->> 'hardSurfaceInstall')::boolean, false),
        coalesce((v_design -> 'patch' ->> 'ladderOver15ft')::boolean, false),
        coalesce((v_design -> 'patch' ->> 'requiresTakedown')::boolean, false),
        0,
        nullif(v_design -> 'patch' ->> 'notes', ''),
        v_options,
        '{}'::jsonb,
        'stale',
        null,
        null,
        null,
        null
      );
    end loop;

    update public.sales_quote_line_items
       set selected_design_id = v_selected_design_id
     where id = v_line_id;
  end loop;

  if exists (
    select 1
      from public.sales_quote_line_items lines
      left join public.sales_quote_designs designs
        on designs.id = lines.selected_design_id
       and designs.line_item_id = lines.id
     where lines.quote_id = v_quote_id
       and lines.selected_design_id is not null
       and designs.id is null
  ) then
    raise exception 'The imported V2 selection does not belong to its line.'
      using errcode = '23503';
  end if;

  v_result := jsonb_build_object(
    'backend', 'authoritative_v2',
    'crmQuoteId', p_crm_quote_id,
    'quoteId', v_quote_id,
    'quoteNumber', v_quote_number,
    'revision', v_quote_revision,
    'status', v_quote_status,
    'quoteV2Status', 'stale',
    'lineCount', v_line_count,
    'designCount', v_design_count,
    'reselectionLineCount', v_reselection_line_count,
    'reusedTarget', v_reused_target
  );

  insert into public.sales_quote_v2_events (
    quote_id,
    event_type,
    previous_revision,
    new_revision,
    actor_id,
    idempotency_key,
    event_payload
  ) values (
    v_quote_id,
    'crm_quote_imported',
    null,
    v_quote_revision,
    p_actor_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'crmQuoteId', p_crm_quote_id,
      'requestHash', v_request_hash,
      'lineCount', v_line_count,
      'designCount', v_design_count,
      'reselectionLineCount', v_reselection_line_count,
      'result', v_result
    )
  );

  insert into public.sales_quote_v2_import_requests (
    crm_quote_id,
    sales_quote_id,
    source_updated_at,
    request_hash,
    actor_id,
    result
  ) values (
    p_crm_quote_id,
    v_quote_id,
    p_source_updated_at,
    v_request_hash,
    p_actor_id,
    v_result
  );

  update public.crm_quotes
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
       'target_sales_quote_id', v_quote_id,
       'quote_v2_import', jsonb_build_object(
         'status', 'complete',
         'sales_quote_id', v_quote_id,
         'line_count', v_line_count,
         'design_count', v_design_count,
         'reselection_line_count', v_reselection_line_count,
         'imported_at', now()
       )
     )
   where id = p_crm_quote_id;

  return v_result;
end;
$$;

revoke all on function public.import_crm_quote_to_v2(
  uuid, uuid, text, timestamptz, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.import_crm_quote_to_v2(
  uuid, uuid, text, timestamptz, jsonb, uuid
) to service_role;

comment on function public.import_crm_quote_to_v2(
  uuid, uuid, text, timestamptz, jsonb, uuid
) is
  'Atomically imports one exact CRM quote structure into a stale server-owned V2 draft without changing customer-facing quote data.';
