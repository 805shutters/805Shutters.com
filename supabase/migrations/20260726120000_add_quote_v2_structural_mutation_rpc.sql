-- Server-owned structural mutations for authoritative Quote V2 drafts.
--
-- This migration is intentionally additive. It does not convert, backfill, or
-- mutate any existing quote. Browser-authenticated clients remain unable to
-- mutate Quote V2 rows directly; trusted server routes call these service-role
-- functions after authenticating an active 805 CRM actor.

create or replace function public.quote_v2_structure_is_protected_key(
  p_key text
)
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select
    regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g')
      ~ '(dealer|wholesale|internal|landed|margin|markup|multiplier|cost)'
    or regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g') in (
      'price',
      'amount',
      'subtotal',
      'total',
      'unitprice',
      'retail',
      'retailtotal',
      'totalamount',
      'productcost',
      'manufacturercost',
      'profitamount',
      'baseprice',
      'surchargetotal',
      'pricingmethod',
      'pricinggridkey',
      'pricinggridprice',
      'pricinggridwidth',
      'pricinggridheight',
      'pricingbuiltinadjustment',
      'discountsourceprice',
      'discountamount',
      'manualpriceoverride',
      'processingfee',
      'processingfeeallocated',
      'freight',
      'freightallocated',
      'oversizecharge',
      'oversizeallocated',
      'authoritativeprice',
      'authoritativepricebreakdown',
      'authoritativecostbreakdown',
      'authoritativeoncetotal',
      'authoritativev2snapshot',
      'authoritativepricestatus',
      'pricedselectionfingerprint',
      'pricedcatalogversion',
      'quotev2backend',
      'quotev2catalogversion',
      'quotev2catalogasof',
      'quotev2selection',
      'quotev2pricestatus',
      'quotev2selectionfingerprint',
      'quotev2pricedcatalogversion',
      'quotev2pricedat',
      'currentv2snapshotid',
      'dealerportalsnapshot',
      'provenance',
      'provenancesnapshot',
      'validationsnapshot',
      'sourceid',
      'sourcehash',
      'sourcefilename',
      'sourcerevision',
      'sourcepage',
      'sourcesheet',
      'effectivedate',
      'guideversion',
      'catalogversion',
      'catalogasof'
    )
    or regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g')
      ~ '^(authoritative|priced)'
    or regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g')
      ~ '(snapshot|fingerprint)$'
    or regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g')
      ~ 'retail'
    or regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g')
      ~ '(price|amount|subtotal)(cents|dollars|persqft)?$'
    or regexp_replace(lower(p_key), '[^a-z0-9]', '', 'g')
      ~ '^total(cents|dollars)?$';
$$;

create or replace function public.quote_v2_structure_json_has_protected_key(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value from jsonb_each(p_value)
    loop
      if public.quote_v2_structure_is_protected_key(v_key)
        or public.quote_v2_structure_json_has_protected_key(v_child)
      then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if public.quote_v2_structure_json_has_protected_key(v_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

create or replace function public.quote_v2_structure_sanitize_options(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_child jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_child in
      select key, value from jsonb_each(p_value)
    loop
      if not public.quote_v2_structure_is_protected_key(v_key) then
        v_result := v_result || jsonb_build_object(
          v_key,
          public.quote_v2_structure_sanitize_options(v_child)
        );
      end if;
    end loop;
    return v_result;
  elsif jsonb_typeof(p_value) = 'array' then
    select coalesce(
      jsonb_agg(public.quote_v2_structure_sanitize_options(value)),
      '[]'::jsonb
    )
      into v_result
      from jsonb_array_elements(p_value);
    return v_result;
  end if;
  return p_value;
end;
$$;

revoke all on function public.quote_v2_structure_is_protected_key(text)
  from public, anon, authenticated;
revoke all on function public.quote_v2_structure_json_has_protected_key(jsonb)
  from public, anon, authenticated;
revoke all on function public.quote_v2_structure_sanitize_options(jsonb)
  from public, anon, authenticated;
grant execute on function public.quote_v2_structure_is_protected_key(text)
  to service_role;
grant execute on function public.quote_v2_structure_json_has_protected_key(jsonb)
  to service_role;
grant execute on function public.quote_v2_structure_sanitize_options(jsonb)
  to service_role;

create table if not exists public.sales_quote_v2_draft_requests (
  idempotency_key text primary key,
  request_hash text not null,
  actor_id uuid not null,
  quote_id uuid not null unique
    references public.sales_quotes(id) on delete restrict,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_draft_requests_key_check
    check (btrim(idempotency_key) <> '' and length(idempotency_key) <= 200),
  constraint sales_quote_v2_draft_requests_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$')
);

alter table public.sales_quote_v2_draft_requests enable row level security;
revoke all on public.sales_quote_v2_draft_requests from public, anon, authenticated;
grant all on public.sales_quote_v2_draft_requests to service_role;

drop trigger if exists sales_quote_v2_draft_requests_append_only
  on public.sales_quote_v2_draft_requests;
create trigger sales_quote_v2_draft_requests_append_only
before update or delete
on public.sales_quote_v2_draft_requests
for each row
execute function public.reject_v2_audit_mutation();

create or replace function public.create_quote_v2_draft(
  p_idempotency_key text,
  p_actor_id uuid,
  p_quote_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_existing public.sales_quote_v2_draft_requests%rowtype;
  v_actor_email text;
  v_request_hash text;
  v_quote_id uuid := gen_random_uuid();
  v_quote_number text;
  v_next_number integer;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_customer_address text;
  v_installer_notes text;
  v_appointment_date date;
  v_quote_group_id uuid;
  v_quote_letter text;
  v_sales_owner text;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 draft creation requires the service role.'
      using errcode = '42501';
  end if;

  if p_actor_id is null then
    raise exception 'An authenticated Quote V2 actor is required.'
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
    raise exception 'The Quote V2 actor is not authorized to create drafts.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
  then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_quote_patch) is distinct from 'object' then
    raise exception 'Quote V2 draft details must be a JSON object.'
      using errcode = '22023';
  end if;
  if public.quote_v2_structure_json_has_protected_key(p_quote_patch) then
    raise exception 'Quote V2 draft details contain protected pricing or cost fields.'
      using errcode = '22023';
  end if;
  if octet_length(p_quote_patch::text) > 50000 then
    raise exception 'Quote V2 draft details are too large.'
      using errcode = '22023';
  end if;

  v_request_hash := encode(
    digest(convert_to(p_quote_patch::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize the global idempotency identity before checking for a retry.
  perform pg_advisory_xact_lock(
    hashtextextended('quote-v2-create:' || btrim(p_idempotency_key), 0)
  );
  select requests.*
    into v_existing
    from public.sales_quote_v2_draft_requests requests
   where requests.idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.actor_id is distinct from p_actor_id
      or v_existing.request_hash is distinct from v_request_hash
    then
      raise exception 'The Quote V2 draft idempotency key was already used for different inputs.'
        using errcode = '23505';
    end if;
    return v_existing.result;
  end if;

  v_customer_name := btrim(coalesce(p_quote_patch ->> 'customerName', ''));
  if v_customer_name = '' or length(v_customer_name) > 200 then
    raise exception 'A customer name of at most 200 characters is required.'
      using errcode = '22023';
  end if;
  v_customer_phone := nullif(btrim(p_quote_patch ->> 'customerPhone'), '');
  v_customer_email := nullif(btrim(p_quote_patch ->> 'customerEmail'), '');
  v_customer_address := nullif(btrim(p_quote_patch ->> 'customerAddress'), '');
  v_installer_notes := nullif(p_quote_patch ->> 'installerNotes', '');
  if coalesce(length(v_customer_phone), 0) > 100
    or coalesce(length(v_customer_email), 0) > 320
    or coalesce(length(v_customer_address), 0) > 1000
    or coalesce(length(v_installer_notes), 0) > 20000
  then
    raise exception 'Quote V2 draft contact or note text is too long.'
      using errcode = '22023';
  end if;

  begin
    v_appointment_date := nullif(p_quote_patch ->> 'appointmentDate', '')::date;
    v_quote_group_id := nullif(p_quote_patch ->> 'quoteGroupId', '')::uuid;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception 'Quote V2 appointmentDate or quoteGroupId is invalid.'
        using errcode = '22023';
  end;
  v_quote_letter := upper(coalesce(nullif(btrim(p_quote_patch ->> 'quoteLetter'), ''), 'A'));
  if v_quote_letter !~ '^[A-Z]$' then
    raise exception 'Quote V2 quoteLetter must be one letter from A through Z.'
      using errcode = '22023';
  end if;

  -- The legacy browser number allocator relies on auth.uid(), which is
  -- unavailable to the service-role client. Allocate the number here while
  -- holding one dedicated transaction lock so concurrent drafts cannot collide.
  perform pg_advisory_xact_lock(
    hashtextextended('quote-v2-number-allocation:805', 0)
  );
  select coalesce(
    max(
      nullif(
        regexp_replace(split_part(quotes.quote_number, '-', 2), '[^0-9]', '', 'g'),
        ''
      )::integer
    ),
    0
  ) + 1
    into v_next_number
    from public.sales_quotes quotes
   where quotes.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
     and quotes.quote_number like '805-%';
  v_quote_number := '805-' || lpad(v_next_number::text, 4, '0');
  v_sales_owner := case
    when v_actor_email = 'jessica@805shutters.com' then 'jessica'
    else 'mike'
  end;

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
    v_customer_email,
    v_customer_phone,
    v_customer_address,
    v_appointment_date,
    v_installer_notes,
    0,
    0,
    0,
    0,
    p_actor_id,
    v_quote_group_id,
    v_quote_letter,
    v_sales_owner,
    p_actor_id,
    now(),
    true,
    'draft',
    null,
    1,
    null
  );

  v_result := jsonb_build_object(
    'backend', 'authoritative_v2',
    'quoteId', v_quote_id,
    'quoteNumber', v_quote_number,
    'revision', 1,
    'status', 'draft',
    'quoteV2Status', 'draft',
    'lineCount', 0
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
    'draft_created',
    null,
    1,
    p_actor_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'requestHash', v_request_hash,
      'result', v_result
    )
  );

  insert into public.sales_quote_v2_draft_requests (
    idempotency_key,
    request_hash,
    actor_id,
    quote_id,
    result
  ) values (
    btrim(p_idempotency_key),
    v_request_hash,
    p_actor_id,
    v_quote_id,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.create_quote_v2_draft(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_quote_v2_draft(text, uuid, jsonb)
  to service_role;

comment on function public.create_quote_v2_draft(text, uuid, jsonb) is
  'Creates one server-numbered authoritative Quote V2 draft with globally idempotent retry semantics.';

create or replace function public.mutate_quote_v2_structure(
  p_quote_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_actor_id uuid,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_existing_event public.sales_quote_v2_events%rowtype;
  v_line public.sales_quote_line_items%rowtype;
  v_source_line public.sales_quote_line_items%rowtype;
  v_target_line public.sales_quote_line_items%rowtype;
  v_design public.sales_quote_designs%rowtype;
  v_source_design public.sales_quote_designs%rowtype;
  v_operation jsonb;
  v_patch jsonb;
  v_options jsonb;
  v_operation_type text;
  v_operation_index integer;
  v_operation_hash text;
  v_line_id uuid;
  v_source_line_id uuid;
  v_target_line_id uuid;
  v_design_id uuid;
  v_requested_design_id uuid;
  v_new_design_id uuid;
  v_target_selected_design_id uuid;
  v_variant text;
  v_fraction text;
  v_new_revision bigint;
  v_line_count integer;
  v_affected_count integer;
  v_design_count integer;
  v_result jsonb;
  v_operation_results jsonb := '[]'::jsonb;
  v_design_map jsonb;
  v_selected_designs jsonb;
  v_design_cleared boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 structural mutation requires the service role.'
      using errcode = '42501';
  end if;

  if p_quote_id is null or p_actor_id is null then
    raise exception 'A Quote V2 ID and authenticated actor ID are required.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.crm_profiles profiles
     where profiles.id = p_actor_id
       and profiles.active = true
       and lower(profiles.email) in (
         '805shutters@gmail.com',
         'jessica@805shutters.com'
       )
  ) then
    raise exception 'The Quote V2 actor is not authorized to mutate drafts.'
      using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A positive expected Quote V2 revision is required.'
      using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
  then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array'
    or jsonb_array_length(p_operations) < 1
    or jsonb_array_length(p_operations) > 200
  then
    raise exception 'Quote V2 structural operations must contain between 1 and 200 entries.'
      using errcode = '22023';
  end if;
  if octet_length(p_operations::text) > 1000000 then
    raise exception 'Quote V2 structural operations are too large.'
      using errcode = '22023';
  end if;
  if public.quote_v2_structure_json_has_protected_key(p_operations) then
    raise exception 'Quote V2 structural operations contain protected pricing or cost fields.'
      using errcode = '22023';
  end if;

  v_operation_hash := encode(
    digest(convert_to(p_operations::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select quotes.*
    into v_quote
    from public.sales_quotes quotes
   where quotes.id = p_quote_id
   for update;
  if not found then
    raise exception 'Quote % does not exist.', p_quote_id
      using errcode = 'P0002';
  end if;
  if not v_quote.quote_v2_backend or v_quote.quote_v2_status = 'legacy' then
    raise exception 'Quote % is not an authoritative V2 quote.', p_quote_id
      using errcode = '22023';
  end if;

  select events.*
    into v_existing_event
    from public.sales_quote_v2_events events
   where events.quote_id = p_quote_id
     and events.idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing_event.event_type <> 'structure_mutation'
      or v_existing_event.actor_id is distinct from p_actor_id
      or v_existing_event.previous_revision is distinct from p_expected_revision
      or v_existing_event.event_payload ->> 'operationHash'
        is distinct from v_operation_hash
    then
      raise exception 'The Quote V2 idempotency key was already used for different inputs.'
        using errcode = '23505';
    end if;
    return v_existing_event.event_payload -> 'result';
  end if;

  if v_quote.status <> 'draft'
    or v_quote.quote_v2_status = 'sent'
    or v_quote.sent_at is not null
    or v_quote.signed_at is not null
  then
    raise exception 'Only an unlocked, unsent Quote V2 draft can be structurally changed.'
      using errcode = '55000';
  end if;
  if v_quote.quote_v2_revision <> p_expected_revision then
    raise exception 'Quote V2 revision conflict: expected %, current %.',
      p_expected_revision,
      v_quote.quote_v2_revision
      using errcode = '40001';
  end if;

  perform lines.id
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id
   order by lines.id
   for update;

  for v_operation, v_operation_index in
    select value, ordinality::integer
      from jsonb_array_elements(p_operations) with ordinality
  loop
    if jsonb_typeof(v_operation) is distinct from 'object' then
      raise exception 'Every Quote V2 structural operation must be an object.'
        using errcode = '22023';
    end if;
    v_operation_type := v_operation ->> 'type';
    v_patch := coalesce(v_operation -> 'patch', '{}'::jsonb);
    if jsonb_typeof(v_patch) is distinct from 'object' then
      raise exception 'Quote V2 structural operation % requires an object patch.',
        v_operation_index
        using errcode = '22023';
    end if;

    if v_operation_type = 'quote.update' then
      if v_patch ? 'customerName'
        and (
          btrim(coalesce(v_patch ->> 'customerName', '')) = ''
          or length(btrim(v_patch ->> 'customerName')) > 200
        )
      then
        raise exception 'Quote V2 customerName must contain at most 200 characters.'
          using errcode = '22023';
      end if;
      if coalesce(length(v_patch ->> 'customerPhone'), 0) > 100
        or coalesce(length(v_patch ->> 'customerEmail'), 0) > 320
        or coalesce(length(v_patch ->> 'customerAddress'), 0) > 1000
        or coalesce(length(v_patch ->> 'installerNotes'), 0) > 20000
      then
        raise exception 'Quote V2 contact or note text is too long.'
          using errcode = '22023';
      end if;
      if v_patch ? 'quoteLetter'
        and upper(coalesce(v_patch ->> 'quoteLetter', '')) !~ '^[A-Z]$'
      then
        raise exception 'Quote V2 quoteLetter must be one letter from A through Z.'
          using errcode = '22023';
      end if;
      begin
        update public.sales_quotes
           set customer_name = case
                 when v_patch ? 'customerName'
                   then btrim(v_patch ->> 'customerName')
                 else customer_name
               end,
               customer_phone = case
                 when v_patch ? 'customerPhone'
                   then nullif(btrim(v_patch ->> 'customerPhone'), '')
                 else customer_phone
               end,
               customer_email = case
                 when v_patch ? 'customerEmail'
                   then nullif(btrim(v_patch ->> 'customerEmail'), '')
                 else customer_email
               end,
               customer_address = case
                 when v_patch ? 'customerAddress'
                   then nullif(btrim(v_patch ->> 'customerAddress'), '')
                 else customer_address
               end,
               appointment_date = case
                 when v_patch ? 'appointmentDate'
                   then nullif(v_patch ->> 'appointmentDate', '')::date
                 else appointment_date
               end,
               installer_notes = case
                 when v_patch ? 'installerNotes'
                   then nullif(v_patch ->> 'installerNotes', '')
                 else installer_notes
               end,
               quote_group_id = case
                 when v_patch ? 'quoteGroupId'
                   then nullif(v_patch ->> 'quoteGroupId', '')::uuid
                 else quote_group_id
               end,
               quote_letter = case
                 when v_patch ? 'quoteLetter'
                   then upper(v_patch ->> 'quoteLetter')
                 else quote_letter
               end
         where id = p_quote_id;
      exception
        when invalid_text_representation or datetime_field_overflow then
          raise exception 'Quote V2 appointmentDate or quoteGroupId is invalid.'
            using errcode = '22023';
      end;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object('index', v_operation_index, 'type', v_operation_type)
      );

    elsif v_operation_type = 'line.create' then
      begin
        v_line_id := coalesce(
          nullif(v_operation ->> 'lineItemId', '')::uuid,
          gen_random_uuid()
        );
      exception when invalid_text_representation then
        raise exception 'Quote V2 lineItemId is invalid.'
          using errcode = '22023';
      end;
      if btrim(coalesce(v_patch ->> 'roomName', '')) = ''
        or length(btrim(v_patch ->> 'roomName')) > 200
        or btrim(coalesce(v_patch ->> 'productType', '')) = ''
        or length(btrim(v_patch ->> 'productType')) > 200
      then
        raise exception 'Quote V2 line creation requires roomName and productType.'
          using errcode = '22023';
      end if;
      if coalesce((v_patch ->> 'widthWhole')::integer, 0) < 0
        or coalesce((v_patch ->> 'widthWhole')::integer, 0) > 1000
        or coalesce((v_patch ->> 'heightWhole')::integer, 0) < 0
        or coalesce((v_patch ->> 'heightWhole')::integer, 0) > 1000
        or coalesce((v_patch ->> 'quantity')::integer, 1) < 1
        or coalesce((v_patch ->> 'quantity')::integer, 1) > 1000
        or coalesce((v_patch ->> 'sortOrder')::integer, 0) < 0
        or coalesce((v_patch ->> 'sortOrder')::integer, 0) > 10000
      then
        raise exception 'Quote V2 line measurements, quantity, or sort order are out of range.'
          using errcode = '22023';
      end if;
      v_fraction := coalesce(nullif(v_patch ->> 'widthFraction', ''), '0');
      if v_fraction <> all(array[
        '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
        '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'
      ]) then
        raise exception 'Quote V2 widthFraction is unsupported.'
          using errcode = '22023';
      end if;
      v_fraction := coalesce(nullif(v_patch ->> 'heightFraction', ''), '0');
      if v_fraction <> all(array[
        '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
        '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'
      ]) then
        raise exception 'Quote V2 heightFraction is unsupported.'
          using errcode = '22023';
      end if;
      insert into public.sales_quote_line_items (
        id, quote_id, room_name, product_type,
        width_whole, width_fraction, height_whole, height_fraction,
        quantity, sort_order, selected_design_id
      ) values (
        v_line_id,
        p_quote_id,
        btrim(v_patch ->> 'roomName'),
        btrim(v_patch ->> 'productType'),
        coalesce((v_patch ->> 'widthWhole')::integer, 0),
        coalesce(nullif(v_patch ->> 'widthFraction', ''), '0'),
        coalesce((v_patch ->> 'heightWhole')::integer, 0),
        coalesce(nullif(v_patch ->> 'heightFraction', ''), '0'),
        coalesce((v_patch ->> 'quantity')::integer, 1),
        coalesce((v_patch ->> 'sortOrder')::integer, 0),
        null
      );
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'lineItemId', v_line_id
        )
      );

    elsif v_operation_type = 'line.update' then
      begin
        v_line_id := (v_operation ->> 'lineItemId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quote V2 lineItemId is invalid.'
          using errcode = '22023';
      end;
      select lines.* into v_line
        from public.sales_quote_line_items lines
       where lines.id = v_line_id and lines.quote_id = p_quote_id
       for update;
      if not found then
        raise exception 'Line item % does not belong to quote %.', v_line_id, p_quote_id
          using errcode = '23503';
      end if;
      if v_patch ? 'roomName'
        and (
          btrim(coalesce(v_patch ->> 'roomName', '')) = ''
          or length(btrim(v_patch ->> 'roomName')) > 200
        )
      then
        raise exception 'Quote V2 roomName is invalid.'
          using errcode = '22023';
      end if;
      if v_patch ? 'productType'
        and (
          btrim(coalesce(v_patch ->> 'productType', '')) = ''
          or length(btrim(v_patch ->> 'productType')) > 200
        )
      then
        raise exception 'Quote V2 productType is invalid.'
          using errcode = '22023';
      end if;
      if (v_patch ? 'widthWhole'
          and ((v_patch ->> 'widthWhole')::integer < 0
            or (v_patch ->> 'widthWhole')::integer > 1000))
        or (v_patch ? 'heightWhole'
          and ((v_patch ->> 'heightWhole')::integer < 0
            or (v_patch ->> 'heightWhole')::integer > 1000))
        or (v_patch ? 'quantity'
          and ((v_patch ->> 'quantity')::integer < 1
            or (v_patch ->> 'quantity')::integer > 1000))
        or (v_patch ? 'sortOrder'
          and ((v_patch ->> 'sortOrder')::integer < 0
            or (v_patch ->> 'sortOrder')::integer > 10000))
      then
        raise exception 'Quote V2 line measurements, quantity, or sort order are out of range.'
          using errcode = '22023';
      end if;
      if v_patch ? 'widthFraction'
        and coalesce(v_patch ->> 'widthFraction', '') <> all(array[
          '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
          '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'
        ])
      then
        raise exception 'Quote V2 widthFraction is unsupported.'
          using errcode = '22023';
      end if;
      if v_patch ? 'heightFraction'
        and coalesce(v_patch ->> 'heightFraction', '') <> all(array[
          '0','1/16','1/8','3/16','1/4','5/16','3/8','7/16',
          '1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'
        ])
      then
        raise exception 'Quote V2 heightFraction is unsupported.'
          using errcode = '22023';
      end if;
      v_design_cleared := v_patch ? 'productType'
        and btrim(v_patch ->> 'productType') is distinct from v_line.product_type;
      if v_design_cleared then
        if exists (
          select 1
            from public.sales_quote_v2_price_snapshots snapshots
           where snapshots.line_item_id = v_line_id
        ) then
          raise exception 'A historically priced Quote V2 line cannot discard its design set until the archive/read-filter contract is installed.'
            using errcode = '55000';
        end if;
        update public.sales_quote_line_items
           set selected_design_id = null
         where id = v_line_id;
        delete from public.sales_quote_designs where line_item_id = v_line_id;
      end if;
      update public.sales_quote_line_items
         set room_name = case when v_patch ? 'roomName'
               then btrim(v_patch ->> 'roomName') else room_name end,
             product_type = case when v_patch ? 'productType'
               then btrim(v_patch ->> 'productType') else product_type end,
             width_whole = case when v_patch ? 'widthWhole'
               then (v_patch ->> 'widthWhole')::integer else width_whole end,
             width_fraction = case when v_patch ? 'widthFraction'
               then v_patch ->> 'widthFraction' else width_fraction end,
             height_whole = case when v_patch ? 'heightWhole'
               then (v_patch ->> 'heightWhole')::integer else height_whole end,
             height_fraction = case when v_patch ? 'heightFraction'
               then v_patch ->> 'heightFraction' else height_fraction end,
             quantity = case when v_patch ? 'quantity'
               then (v_patch ->> 'quantity')::integer else quantity end,
             sort_order = case when v_patch ? 'sortOrder'
               then (v_patch ->> 'sortOrder')::integer else sort_order end
       where id = v_line_id;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'lineItemId', v_line_id,
          'designsCleared', v_design_cleared
        )
      );

    elsif v_operation_type = 'line.delete' then
      begin
        v_line_id := (v_operation ->> 'lineItemId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quote V2 lineItemId is invalid.'
          using errcode = '22023';
      end;
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.line_item_id = v_line_id
           and snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A historically priced Quote V2 line cannot be deleted until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      delete from public.sales_quote_line_items
       where id = v_line_id and quote_id = p_quote_id;
      get diagnostics v_affected_count = row_count;
      if v_affected_count <> 1 then
        raise exception 'Line item % does not belong to quote %.', v_line_id, p_quote_id
          using errcode = '23503';
      end if;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'lineItemId', v_line_id
        )
      );

    elsif v_operation_type = 'lines.clear' then
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A Quote V2 with immutable price history cannot be cleared until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      delete from public.sales_quote_line_items where quote_id = p_quote_id;
      get diagnostics v_affected_count = row_count;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'deletedLineCount', v_affected_count
        )
      );

    elsif v_operation_type = 'line.copy' then
      begin
        v_source_line_id := (v_operation ->> 'sourceLineItemId')::uuid;
        v_target_line_id := coalesce(
          nullif(v_operation ->> 'targetLineItemId', '')::uuid,
          gen_random_uuid()
        );
      exception when invalid_text_representation then
        raise exception 'Quote V2 line copy IDs are invalid.'
          using errcode = '22023';
      end;
      if v_target_line_id = v_source_line_id then
        raise exception 'A Quote V2 line copy requires a new target line identity.'
          using errcode = '22023';
      end if;
      if v_operation ? 'sortOrder'
        and (
          (v_operation ->> 'sortOrder')::integer < 0
          or (v_operation ->> 'sortOrder')::integer > 10000
        )
      then
        raise exception 'Quote V2 line copy sortOrder is out of range.'
          using errcode = '22023';
      end if;
      select lines.* into v_source_line
        from public.sales_quote_line_items lines
       where lines.id = v_source_line_id and lines.quote_id = p_quote_id
       for update;
      if not found then
        raise exception 'Line item % does not belong to quote %.', v_source_line_id, p_quote_id
          using errcode = '23503';
      end if;
      select count(*)::integer into v_line_count
        from public.sales_quote_line_items lines
       where lines.quote_id = p_quote_id;
      if v_line_count >= 40 then
        raise exception 'A V2 quote can contain no more than 40 line items.'
          using errcode = '23514';
      end if;
      insert into public.sales_quote_line_items (
        id, quote_id, room_name, product_type,
        width_whole, width_fraction, height_whole, height_fraction,
        quantity, sort_order, selected_design_id
      ) values (
        v_target_line_id,
        p_quote_id,
        v_source_line.room_name,
        v_source_line.product_type,
        v_source_line.width_whole,
        v_source_line.width_fraction,
        v_source_line.height_whole,
        v_source_line.height_fraction,
        v_source_line.quantity,
        coalesce(
          (v_operation ->> 'sortOrder')::integer,
          (select coalesce(max(lines.sort_order), -1) + 1
             from public.sales_quote_line_items lines
            where lines.quote_id = p_quote_id)
        ),
        null
      );
      v_design_map := '[]'::jsonb;
      v_target_selected_design_id := null;
      for v_source_design in
        select designs.*
          from public.sales_quote_designs designs
         where designs.line_item_id = v_source_line_id
         order by designs.variant, designs.id
      loop
        v_new_design_id := gen_random_uuid();
        v_options := public.quote_v2_structure_sanitize_options(
          coalesce(v_source_design.options_json, '{}'::jsonb)
        );
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
          v_new_design_id, v_target_line_id, v_source_design.variant,
          v_source_design.product_type, v_source_design.supplier,
          v_source_design.material, v_source_design.louver_size,
          v_source_design.tilt_type, v_source_design.hinge_color,
          v_source_design.panel_config, v_source_design.mount_type,
          v_source_design.shade_type, v_source_design.lift_system,
          v_source_design.valance, v_source_design.fabric,
          v_source_design.motor_type, v_source_design.remote_type,
          v_source_design.hard_surface_install,
          v_source_design.ladder_over_15ft,
          v_source_design.requires_takedown, 0, v_source_design.notes,
          v_options, '{}'::jsonb, 'stale', null, null, null, null
        );
        if v_source_design.id = v_source_line.selected_design_id then
          v_target_selected_design_id := v_new_design_id;
        end if;
        v_design_map := v_design_map || jsonb_build_array(
          jsonb_build_object(
            'sourceDesignId', v_source_design.id,
            'designId', v_new_design_id,
            'variant', v_source_design.variant
          )
        );
      end loop;
      update public.sales_quote_line_items
         set selected_design_id = v_target_selected_design_id
       where id = v_target_line_id;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'sourceLineItemId', v_source_line_id,
          'lineItemId', v_target_line_id,
          'selectedDesignId', v_target_selected_design_id,
          'designs', v_design_map
        )
      );

    elsif v_operation_type = 'design.upsert' then
      begin
        v_line_id := (v_operation ->> 'lineItemId')::uuid;
        v_requested_design_id := nullif(v_operation ->> 'designId', '')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quote V2 design upsert IDs are invalid.'
          using errcode = '22023';
      end;
      select lines.* into v_line
        from public.sales_quote_line_items lines
       where lines.id = v_line_id and lines.quote_id = p_quote_id
       for update;
      if not found then
        raise exception 'Line item % does not belong to quote %.', v_line_id, p_quote_id
          using errcode = '23503';
      end if;
      v_variant := btrim(coalesce(v_operation ->> 'variant', ''));
      if v_variant = '' or length(v_variant) > 80 then
        raise exception 'Quote V2 design variant is required and must be at most 80 characters.'
          using errcode = '22023';
      end if;
      if jsonb_typeof(v_operation -> 'selectDesign') is distinct from 'boolean' then
        raise exception 'Quote V2 design upsert requires explicit selectDesign intent.'
          using errcode = '22023';
      end if;
      if v_patch ? 'optionsJson' then
        v_options := v_patch -> 'optionsJson';
        if jsonb_typeof(v_options) is distinct from 'object'
          or octet_length(v_options::text) > 200000
          or public.quote_v2_structure_json_has_protected_key(v_options)
        then
          raise exception 'Quote V2 design options are invalid or contain protected fields.'
            using errcode = '22023';
        end if;
      end if;
      select designs.* into v_design
        from public.sales_quote_designs designs
       where designs.line_item_id = v_line_id
         and designs.variant = v_variant
       for update;
      if found then
        if v_requested_design_id is not null
          and v_requested_design_id is distinct from v_design.id
        then
          raise exception 'The requested design ID conflicts with the saved line/variant identity.'
            using errcode = '23505';
        end if;
        v_design_id := v_design.id;
        update public.sales_quote_designs
           set product_type = case when v_patch ? 'productType'
                 then nullif(btrim(v_patch ->> 'productType'), '') else product_type end,
               supplier = case when v_patch ? 'supplier'
                 then nullif(btrim(v_patch ->> 'supplier'), '') else supplier end,
               material = case when v_patch ? 'material'
                 then nullif(v_patch ->> 'material', '') else material end,
               louver_size = case when v_patch ? 'louverSize'
                 then nullif(v_patch ->> 'louverSize', '') else louver_size end,
               tilt_type = case when v_patch ? 'tiltType'
                 then nullif(v_patch ->> 'tiltType', '') else tilt_type end,
               hinge_color = case when v_patch ? 'hingeColor'
                 then nullif(v_patch ->> 'hingeColor', '') else hinge_color end,
               panel_config = case when v_patch ? 'panelConfig'
                 then nullif(v_patch ->> 'panelConfig', '') else panel_config end,
               mount_type = case when v_patch ? 'mountType'
                 then nullif(v_patch ->> 'mountType', '') else mount_type end,
               shade_type = case when v_patch ? 'shadeType'
                 then nullif(v_patch ->> 'shadeType', '') else shade_type end,
               lift_system = case when v_patch ? 'liftSystem'
                 then nullif(v_patch ->> 'liftSystem', '') else lift_system end,
               valance = case when v_patch ? 'valance'
                 then nullif(v_patch ->> 'valance', '') else valance end,
               fabric = case when v_patch ? 'fabric'
                 then nullif(v_patch ->> 'fabric', '') else fabric end,
               motor_type = case when v_patch ? 'motorType'
                 then nullif(v_patch ->> 'motorType', '') else motor_type end,
               remote_type = case when v_patch ? 'remoteType'
                 then nullif(v_patch ->> 'remoteType', '') else remote_type end,
               hard_surface_install = case when v_patch ? 'hardSurfaceInstall'
                 then (v_patch ->> 'hardSurfaceInstall')::boolean else hard_surface_install end,
               ladder_over_15ft = case when v_patch ? 'ladderOver15ft'
                 then (v_patch ->> 'ladderOver15ft')::boolean else ladder_over_15ft end,
               requires_takedown = case when v_patch ? 'requiresTakedown'
                 then (v_patch ->> 'requiresTakedown')::boolean else requires_takedown end,
               notes = case when v_patch ? 'notes'
                 then nullif(v_patch ->> 'notes', '') else notes end,
               options_json = case when v_patch ? 'optionsJson'
                 then v_patch -> 'optionsJson' else options_json end
         where id = v_design_id;
      else
        v_design_id := coalesce(v_requested_design_id, gen_random_uuid());
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
          v_design_id, v_line_id, v_variant,
          coalesce(nullif(btrim(v_patch ->> 'productType'), ''), v_line.product_type),
          nullif(btrim(v_patch ->> 'supplier'), ''),
          nullif(v_patch ->> 'material', ''),
          nullif(v_patch ->> 'louverSize', ''),
          nullif(v_patch ->> 'tiltType', ''),
          nullif(v_patch ->> 'hingeColor', ''),
          nullif(v_patch ->> 'panelConfig', ''),
          nullif(v_patch ->> 'mountType', ''),
          nullif(v_patch ->> 'shadeType', ''),
          nullif(v_patch ->> 'liftSystem', ''),
          nullif(v_patch ->> 'valance', ''),
          nullif(v_patch ->> 'fabric', ''),
          nullif(v_patch ->> 'motorType', ''),
          nullif(v_patch ->> 'remoteType', ''),
          coalesce((v_patch ->> 'hardSurfaceInstall')::boolean, false),
          coalesce((v_patch ->> 'ladderOver15ft')::boolean, false),
          coalesce((v_patch ->> 'requiresTakedown')::boolean, false),
          0,
          nullif(v_patch ->> 'notes', ''),
          coalesce(v_patch -> 'optionsJson', '{}'::jsonb),
          '{}'::jsonb, 'stale', null, null, null, null
        );
      end if;
      if (v_operation ->> 'selectDesign')::boolean then
        update public.sales_quote_line_items
           set selected_design_id = v_design_id
         where id = v_line_id;
      end if;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'lineItemId', v_line_id,
          'designId', v_design_id,
          'variant', v_variant,
          'selected', (v_operation ->> 'selectDesign')::boolean
        )
      );

    elsif v_operation_type = 'design.select' then
      begin
        v_line_id := (v_operation ->> 'lineItemId')::uuid;
        v_design_id := (v_operation ->> 'designId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quote V2 design selection IDs are invalid.'
          using errcode = '22023';
      end;
      select designs.* into v_design
        from public.sales_quote_designs designs
        join public.sales_quote_line_items lines on lines.id = designs.line_item_id
       where designs.id = v_design_id
         and designs.line_item_id = v_line_id
         and lines.quote_id = p_quote_id
       for update of designs;
      if not found then
        raise exception 'Design % does not belong to line item % on this quote.',
          v_design_id, v_line_id
          using errcode = '23503';
      end if;
      update public.sales_quote_line_items
         set selected_design_id = v_design_id
       where id = v_line_id and quote_id = p_quote_id;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'lineItemId', v_line_id,
          'designId', v_design_id
        )
      );

    elsif v_operation_type = 'design.delete' then
      begin
        v_line_id := (v_operation ->> 'lineItemId')::uuid;
        v_design_id := (v_operation ->> 'designId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quote V2 design deletion IDs are invalid.'
          using errcode = '22023';
      end;
      select designs.* into v_design
        from public.sales_quote_designs designs
        join public.sales_quote_line_items lines on lines.id = designs.line_item_id
       where designs.id = v_design_id
         and designs.line_item_id = v_line_id
         and lines.quote_id = p_quote_id
       for update of designs;
      if not found then
        raise exception 'Design % does not belong to line item % on this quote.',
          v_design_id, v_line_id
          using errcode = '23503';
      end if;
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.design_id = v_design_id
           and snapshots.line_item_id = v_line_id
           and snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A historically priced Quote V2 design cannot be deleted until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      update public.sales_quote_line_items
         set selected_design_id = null
       where id = v_line_id and selected_design_id = v_design_id;
      delete from public.sales_quote_designs where id = v_design_id;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'lineItemId', v_line_id,
          'designId', v_design_id
        )
      );

    elsif v_operation_type = 'design.copySet' then
      begin
        v_source_line_id := (v_operation ->> 'sourceLineItemId')::uuid;
        v_target_line_id := (v_operation ->> 'targetLineItemId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quote V2 design copy IDs are invalid.'
          using errcode = '22023';
      end;
      if v_source_line_id = v_target_line_id then
        raise exception 'Quote V2 design sets require different source and target lines.'
          using errcode = '22023';
      end if;
      select lines.* into v_source_line
        from public.sales_quote_line_items lines
       where lines.id = v_source_line_id and lines.quote_id = p_quote_id
       for update;
      if not found then
        raise exception 'Source line item % does not belong to this quote.', v_source_line_id
          using errcode = '23503';
      end if;
      select lines.* into v_target_line
        from public.sales_quote_line_items lines
       where lines.id = v_target_line_id and lines.quote_id = p_quote_id
       for update;
      if not found then
        raise exception 'Target line item % does not belong to this quote.', v_target_line_id
          using errcode = '23503';
      end if;
      if lower(btrim(v_source_line.product_type))
        is distinct from lower(btrim(v_target_line.product_type))
      then
        raise exception 'Quote V2 design sets can only be copied between matching product types.'
          using errcode = '22023';
      end if;
      select count(*)::integer into v_design_count
        from public.sales_quote_designs designs
       where designs.line_item_id = v_source_line_id;
      if v_design_count < 1 then
        raise exception 'The Quote V2 source line has no design set to copy.'
          using errcode = '22023';
      end if;
      if exists (
        select 1
          from public.sales_quote_v2_price_snapshots snapshots
         where snapshots.line_item_id = v_target_line_id
           and snapshots.quote_id = p_quote_id
      ) then
        raise exception 'A historically priced Quote V2 target design set cannot be replaced until the archive/read-filter contract is installed.'
          using errcode = '55000';
      end if;
      update public.sales_quote_line_items
         set selected_design_id = null
       where id = v_target_line_id;
      delete from public.sales_quote_designs
       where line_item_id = v_target_line_id;
      v_design_map := '[]'::jsonb;
      v_target_selected_design_id := null;
      for v_source_design in
        select designs.*
          from public.sales_quote_designs designs
         where designs.line_item_id = v_source_line_id
         order by designs.variant, designs.id
      loop
        v_new_design_id := gen_random_uuid();
        v_options := public.quote_v2_structure_sanitize_options(
          coalesce(v_source_design.options_json, '{}'::jsonb)
        );
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
          v_new_design_id, v_target_line_id, v_source_design.variant,
          v_source_design.product_type, v_source_design.supplier,
          v_source_design.material, v_source_design.louver_size,
          v_source_design.tilt_type, v_source_design.hinge_color,
          v_source_design.panel_config, v_source_design.mount_type,
          v_source_design.shade_type, v_source_design.lift_system,
          v_source_design.valance, v_source_design.fabric,
          v_source_design.motor_type, v_source_design.remote_type,
          v_source_design.hard_surface_install,
          v_source_design.ladder_over_15ft,
          v_source_design.requires_takedown, 0, v_source_design.notes,
          v_options, '{}'::jsonb, 'stale', null, null, null, null
        );
        if v_source_design.id = v_source_line.selected_design_id then
          v_target_selected_design_id := v_new_design_id;
        end if;
        v_design_map := v_design_map || jsonb_build_array(
          jsonb_build_object(
            'sourceDesignId', v_source_design.id,
            'designId', v_new_design_id,
            'variant', v_source_design.variant
          )
        );
      end loop;
      update public.sales_quote_line_items
         set selected_design_id = v_target_selected_design_id
       where id = v_target_line_id;
      v_operation_results := v_operation_results || jsonb_build_array(
        jsonb_build_object(
          'index', v_operation_index,
          'type', v_operation_type,
          'sourceLineItemId', v_source_line_id,
          'targetLineItemId', v_target_line_id,
          'selectedDesignId', v_target_selected_design_id,
          'designs', v_design_map
        )
      );

    else
      raise exception 'Unsupported Quote V2 structural operation: %.',
        coalesce(v_operation_type, '<missing>')
        using errcode = '22023';
    end if;
  end loop;

  select count(*)::integer into v_line_count
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id;
  if v_line_count > 40 then
    raise exception 'A V2 quote can contain no more than 40 line items.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
      from public.sales_quote_line_items lines
      left join public.sales_quote_designs designs
        on designs.id = lines.selected_design_id
       and designs.line_item_id = lines.id
     where lines.quote_id = p_quote_id
       and lines.selected_design_id is not null
       and designs.id is null
  ) then
    raise exception 'A Quote V2 selected design does not belong to its line item.'
      using errcode = '23503';
  end if;
  if exists (
    select 1
      from public.sales_quote_line_items lines
     where lines.quote_id = p_quote_id
       and lines.selected_design_id is null
  ) then
    raise exception 'Every Quote V2 line must have exactly one selected design.'
      using errcode = '23514';
  end if;

  -- Every structural revision invalidates quote-wide pricing because freight,
  -- oversize, processing, and selection eligibility can depend on any line.
  -- Immutable snapshot history remains append-only; only mutable pointers and
  -- customer-visible prices are cleared.
  update public.sales_quote_designs designs
     set unit_price = 0,
         quote_v2_selection = '{}'::jsonb,
         quote_v2_price_status = 'stale',
         quote_v2_selection_fingerprint = null,
         quote_v2_priced_catalog_version = null,
         quote_v2_priced_at = null,
         current_v2_snapshot_id = null,
         options_json = public.quote_v2_structure_sanitize_options(
           coalesce(designs.options_json, '{}'::jsonb)
         )
    from public.sales_quote_line_items lines
   where lines.id = designs.line_item_id
     and lines.quote_id = p_quote_id;

  v_new_revision := p_expected_revision + 1;
  update public.sales_quotes
     set quote_v2_status = case when v_line_count = 0 then 'draft' else 'stale' end,
         quote_v2_catalog_version = null,
         quote_v2_revision = v_new_revision,
         quote_v2_last_priced_at = null,
         total_amount = 0,
         product_cost = 0,
         manufacturer_cost = 0,
         profit_amount = 0,
         updated_at = now()
   where id = p_quote_id;

  select coalesce(
    jsonb_object_agg(lines.id::text, to_jsonb(lines.selected_design_id)),
    '{}'::jsonb
  )
    into v_selected_designs
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id;

  v_result := jsonb_build_object(
    'backend', 'authoritative_v2',
    'quoteId', p_quote_id,
    'revision', v_new_revision,
    'status', 'draft',
    'quoteV2Status', case when v_line_count = 0 then 'draft' else 'stale' end,
    'lineCount', v_line_count,
    'selectedDesigns', v_selected_designs,
    'operations', v_operation_results
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
    p_quote_id,
    'structure_mutation',
    p_expected_revision,
    v_new_revision,
    p_actor_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'operationHash', v_operation_hash,
      'operationCount', jsonb_array_length(p_operations),
      'result', v_result
    )
  );

  return v_result;
end;
$$;

revoke all on function public.mutate_quote_v2_structure(
  uuid, bigint, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_quote_v2_structure(
  uuid, bigint, text, uuid, jsonb
) to service_role;

comment on function public.mutate_quote_v2_structure(
  uuid, bigint, text, uuid, jsonb
) is
  'Atomically changes authoritative Quote V2 draft structure, invalidates all mutable prices, and records one revisioned idempotent event.';
