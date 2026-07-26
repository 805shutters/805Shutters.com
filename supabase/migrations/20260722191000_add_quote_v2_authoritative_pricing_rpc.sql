-- Transactional, service-only persistence for one authoritative Quote V2
-- pricing result.
--
-- The browser never supplies dollars, catalog identity, fingerprints, cost, or
-- provenance to this function. Trusted server code derives those values with
-- the versioned V2 engine, then persists them atomically here. Every mutation
-- locks the quote revision, appends an audit event, and recomputes quote totals
-- from selected immutable snapshots only.

create or replace function public.save_quote_v2_pricing_result(
  p_quote_id uuid,
  p_line_item_id uuid,
  p_design_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_actor_id uuid,
  p_select_design boolean,
  p_selection jsonb,
  p_selection_fingerprint text,
  p_catalog_version text,
  p_price_status text,
  p_authoritative_snapshot jsonb,
  p_internal_cost_snapshot jsonb,
  p_validation_snapshot jsonb,
  p_provenance_snapshot jsonb
)
returns table (
  quote_id uuid,
  design_id uuid,
  snapshot_id uuid,
  new_revision bigint,
  quote_status text,
  quote_total numeric,
  product_cost_total numeric
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_line public.sales_quote_line_items%rowtype;
  v_design public.sales_quote_designs%rowtype;
  v_existing_event public.sales_quote_v2_events%rowtype;
  v_snapshot_id uuid;
  v_new_revision bigint;
  v_unit_price numeric(12, 2);
  v_once_total numeric(12, 2);
  v_retail_total numeric(12, 2);
  v_internal_total numeric(12, 2);
  v_quote_total numeric(12, 2);
  v_product_cost_total numeric(12, 2);
  v_total_lines integer;
  v_selected_lines integer;
  v_authoritative_lines integer;
  v_blocked_lines integer;
  v_quote_status text;
  v_quote_catalog_versions text;
  v_options jsonb;
  v_event_type text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 pricing persistence requires the service role.'
      using errcode = '42501';
  end if;

  if p_quote_id is null or p_line_item_id is null or p_design_id is null then
    raise exception 'Quote, line-item, and design IDs are required.'
      using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'A non-negative expected Quote V2 revision is required.'
      using errcode = '22023';
  end if;

  if p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
  then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_selection) is distinct from 'object' then
    raise exception 'The canonical V2 selection must be a JSON object.'
      using errcode = '22023';
  end if;

  if p_selection_fingerprint is null
    or p_selection_fingerprint !~ '^sha256:[0-9a-f]{64}$'
  then
    raise exception 'The canonical V2 selection fingerprint is invalid.'
      using errcode = '22023';
  end if;

  if p_catalog_version is null or btrim(p_catalog_version) = '' then
    raise exception 'The authoritative catalog version is required.'
      using errcode = '22023';
  end if;

  if p_price_status is null
    or p_price_status not in ('authoritative', 'stale', 'blocked', 'unpriceable')
  then
    raise exception 'Unsupported Quote V2 price status: %.', p_price_status
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_validation_snapshot, '[]'::jsonb))
      not in ('array', 'object')
  then
    raise exception 'The validation snapshot must be a JSON array or object.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_provenance_snapshot, '[]'::jsonb))
      not in ('array', 'object')
  then
    raise exception 'The provenance snapshot must be a JSON array or object.'
      using errcode = '22023';
  end if;

  if p_provenance_snapshot is null
    or p_provenance_snapshot in ('[]'::jsonb, '{}'::jsonb)
  then
    raise exception 'At least one authoritative source provenance record is required.'
      using errcode = '22023';
  end if;

  if p_selection ->> 'catalogVersion' is distinct from p_catalog_version
    or coalesce(btrim(p_selection ->> 'manufacturerId'), '') = ''
    or coalesce(btrim(p_selection ->> 'productId'), '') = ''
  then
    raise exception 'The canonical selection identity is incomplete or inconsistent.'
      using errcode = '22023';
  end if;

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

  -- Check idempotency only after taking the parent lock. Concurrent retries
  -- serialize here, so the second caller observes and returns the first
  -- caller's completed event instead of failing a revision check.
  select events.*
    into v_existing_event
    from public.sales_quote_v2_events events
   where events.quote_id = p_quote_id
     and events.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_event.event_payload ->> 'lineItemId'
          is distinct from p_line_item_id::text
      or v_existing_event.event_payload ->> 'designId'
          is distinct from p_design_id::text
      or v_existing_event.event_payload ->> 'selectionFingerprint'
          is distinct from p_selection_fingerprint
      or v_existing_event.event_payload ->> 'catalogVersion'
          is distinct from p_catalog_version
      or v_existing_event.event_payload ->> 'priceStatus'
          is distinct from p_price_status
      or (v_existing_event.event_payload ->> 'selectedDesign')::boolean
          is distinct from coalesce(p_select_design, false)
    then
      raise exception 'The Quote V2 idempotency key was already used for a different request.'
        using errcode = '23505';
    end if;

    return query
    select
      p_quote_id,
      p_design_id,
      nullif(v_existing_event.event_payload ->> 'snapshotId', '')::uuid,
      v_existing_event.new_revision,
      v_existing_event.event_payload ->> 'quoteStatus',
      coalesce((v_existing_event.event_payload ->> 'quoteTotal')::numeric, 0),
      coalesce((v_existing_event.event_payload ->> 'productCostTotal')::numeric, 0);
    return;
  end if;

  if v_quote.quote_v2_status = 'sent' or v_quote.status <> 'draft' then
    raise exception 'Sent or non-draft Quote V2 records cannot be repriced.'
      using errcode = '55000';
  end if;

  if v_quote.quote_v2_revision <> p_expected_revision then
    raise exception 'Quote V2 revision conflict: expected %, current %.',
      p_expected_revision,
      v_quote.quote_v2_revision
      using errcode = '40001';
  end if;

  select lines.*
    into v_line
    from public.sales_quote_line_items lines
   where lines.id = p_line_item_id
     and lines.quote_id = p_quote_id
   for update;

  if not found then
    raise exception 'Line item % does not belong to quote %.',
      p_line_item_id,
      p_quote_id
      using errcode = '23503';
  end if;

  select designs.*
    into v_design
    from public.sales_quote_designs designs
   where designs.id = p_design_id
     and designs.line_item_id = p_line_item_id
   for update;

  if not found then
    raise exception 'Design % does not belong to line item %.',
      p_design_id,
      p_line_item_id
      using errcode = '23503';
  end if;

  v_new_revision := v_quote.quote_v2_revision + 1;
  v_options := coalesce(v_design.options_json, '{}'::jsonb)
    - 'authoritative_price_breakdown'
    - 'authoritative_cost_breakdown'
    - 'authoritative_v2_snapshot'
    - 'priced_selection_fingerprint'
    - 'priced_catalog_version'
    - 'quote_v2_catalog_version'
    - 'quote_v2_catalog_as_of'
    - 'authoritative_once_total'
    - 'authoritative_price_status';
  v_options := v_options || jsonb_build_object('quote_v2_backend', true);

  if p_price_status = 'authoritative' then
    if jsonb_typeof(p_authoritative_snapshot) is distinct from 'object'
      or jsonb_typeof(p_authoritative_snapshot -> 'retail') is distinct from 'object'
      or p_authoritative_snapshot ->> 'priceStatus' is distinct from 'authoritative'
      or p_authoritative_snapshot ->> 'selectionFingerprint'
          is distinct from p_selection_fingerprint
      or p_authoritative_snapshot ->> 'catalogVersion'
          is distinct from p_catalog_version
      or p_authoritative_snapshot #>> '{retail,ok}' is distinct from 'true'
      or p_authoritative_snapshot #>> '{retail,validationStatus}'
          is distinct from 'valid'
      or p_authoritative_snapshot #>> '{retail,catalogVersion}'
          is distinct from p_catalog_version
      or coalesce(btrim(p_authoritative_snapshot ->> 'catalogAsOf'), '') = ''
      or jsonb_typeof(p_authoritative_snapshot #> '{retail,unitPrice}')
          is distinct from 'number'
      or jsonb_typeof(p_authoritative_snapshot #> '{retail,onceTotal}')
          is distinct from 'number'
      or jsonb_typeof(p_authoritative_snapshot #> '{retail,total}')
          is distinct from 'number'
      or jsonb_typeof(p_authoritative_snapshot #> '{retail,quantity}')
          is distinct from 'number'
    then
      raise exception 'The authoritative retail snapshot identity is incomplete or inconsistent.'
        using errcode = '22023';
    end if;

    if jsonb_typeof(p_internal_cost_snapshot) is distinct from 'object'
      or jsonb_typeof(p_internal_cost_snapshot -> 'landedCostTotal')
          is distinct from 'number'
    then
      raise exception 'An authoritative protected-cost snapshot is required.'
        using errcode = '22023';
    end if;

    begin
      v_unit_price := (p_authoritative_snapshot #>> '{retail,unitPrice}')::numeric;
      v_once_total := (p_authoritative_snapshot #>> '{retail,onceTotal}')::numeric;
      v_retail_total := (p_authoritative_snapshot #>> '{retail,total}')::numeric;
      v_internal_total := (p_internal_cost_snapshot ->> 'landedCostTotal')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'The authoritative pricing snapshot contains invalid money values.'
          using errcode = '22023';
    end;

    if v_unit_price is null or v_unit_price < 0
      or v_once_total is null or v_once_total < 0
      or v_retail_total is null or v_retail_total < 0
      or v_internal_total is null or v_internal_total < 0
    then
      raise exception 'Authoritative retail and protected cost totals must be non-negative.'
        using errcode = '22023';
    end if;

    if (p_authoritative_snapshot #>> '{retail,quantity}')::numeric
        is distinct from v_line.quantity::numeric
    then
      raise exception 'The authoritative snapshot quantity does not match the persisted line item.'
        using errcode = '22023';
    end if;

    if round(v_retail_total, 2)
        is distinct from round(v_unit_price * v_line.quantity + v_once_total, 2)
    then
      raise exception 'The authoritative retail total does not equal unit price times quantity plus once-per-line charges.'
        using errcode = '22023';
    end if;

    insert into public.sales_quote_v2_price_snapshots (
      quote_id,
      line_item_id,
      design_id,
      quote_revision,
      selection_fingerprint,
      catalog_version,
      retail_total,
      internal_landed_cost_total,
      retail_snapshot,
      internal_cost_snapshot,
      validation_snapshot,
      provenance_snapshot,
      created_by
    ) values (
      p_quote_id,
      p_line_item_id,
      p_design_id,
      v_new_revision,
      p_selection_fingerprint,
      p_catalog_version,
      round(v_retail_total, 2),
      round(v_internal_total, 2),
      p_authoritative_snapshot,
      p_internal_cost_snapshot,
      coalesce(p_validation_snapshot, '[]'::jsonb),
      coalesce(p_provenance_snapshot, '[]'::jsonb),
      p_actor_id
    )
    returning id into v_snapshot_id;

    v_options := v_options || jsonb_build_object(
      'authoritative_price_status', 'authoritative',
      'authoritative_price_breakdown', p_authoritative_snapshot -> 'retail',
      'authoritative_v2_snapshot', p_authoritative_snapshot,
      'authoritative_once_total', round(v_once_total, 2),
      'priced_selection_fingerprint', p_selection_fingerprint,
      'priced_catalog_version', p_catalog_version,
      'quote_v2_catalog_version', p_catalog_version,
      'quote_v2_catalog_as_of', p_authoritative_snapshot ->> 'catalogAsOf'
    );

    update public.sales_quote_designs
       set quote_v2_selection = p_selection,
           quote_v2_price_status = 'authoritative',
           quote_v2_selection_fingerprint = p_selection_fingerprint,
           quote_v2_priced_catalog_version = p_catalog_version,
           quote_v2_priced_at = now(),
           current_v2_snapshot_id = v_snapshot_id,
           unit_price = round(v_unit_price, 2),
           options_json = v_options
     where id = p_design_id;

    v_event_type := 'pricing_authoritative';
  else
    if p_authoritative_snapshot is not null or p_internal_cost_snapshot is not null then
      raise exception 'Non-authoritative pricing results cannot persist retail or cost snapshots.'
        using errcode = '22023';
    end if;

    v_options := v_options || jsonb_build_object(
      'authoritative_price_status', p_price_status,
      'priced_selection_fingerprint', p_selection_fingerprint,
      'priced_catalog_version', p_catalog_version,
      'quote_v2_catalog_version', p_catalog_version
    );

    update public.sales_quote_designs
       set quote_v2_selection = p_selection,
           quote_v2_price_status = p_price_status,
           quote_v2_selection_fingerprint = p_selection_fingerprint,
           quote_v2_priced_catalog_version = p_catalog_version,
           quote_v2_priced_at = now(),
           current_v2_snapshot_id = null,
           unit_price = 0,
           options_json = v_options
     where id = p_design_id;

    v_event_type := 'pricing_' || p_price_status;
  end if;

  if coalesce(p_select_design, false) then
    update public.sales_quote_line_items
       set selected_design_id = p_design_id
     where id = p_line_item_id;
  end if;

  select
    count(*)::integer,
    count(lines.selected_design_id)::integer,
    count(*) filter (
      where designs.quote_v2_price_status = 'authoritative'
        and designs.current_v2_snapshot_id is not null
    )::integer,
    count(*) filter (
      where designs.quote_v2_price_status in ('blocked', 'unpriceable')
    )::integer,
    coalesce(sum(
      case
        when designs.quote_v2_price_status = 'authoritative'
          then snapshots.retail_total
        else 0
      end
    ), 0)::numeric(12, 2),
    coalesce(sum(
      case
        when designs.quote_v2_price_status = 'authoritative'
          then snapshots.internal_landed_cost_total
        else 0
      end
    ), 0)::numeric(12, 2),
    string_agg(
      distinct designs.quote_v2_priced_catalog_version,
      ',' order by designs.quote_v2_priced_catalog_version
    ) filter (
      where designs.quote_v2_price_status = 'authoritative'
    )
    into
      v_total_lines,
      v_selected_lines,
      v_authoritative_lines,
      v_blocked_lines,
      v_quote_total,
      v_product_cost_total,
      v_quote_catalog_versions
    from public.sales_quote_line_items lines
    left join public.sales_quote_designs designs
      on designs.id = lines.selected_design_id
     and designs.line_item_id = lines.id
    left join public.sales_quote_v2_price_snapshots snapshots
      on snapshots.id = designs.current_v2_snapshot_id
     and snapshots.design_id = designs.id
   where lines.quote_id = p_quote_id;

  v_quote_status := case
    when v_total_lines = 0 or v_selected_lines = 0 then 'draft'
    when v_blocked_lines > 0 then 'blocked'
    when v_selected_lines = v_total_lines
      and v_authoritative_lines = v_total_lines then 'priced'
    else 'stale'
  end;

  update public.sales_quotes
     set quote_v2_status = v_quote_status,
         quote_v2_catalog_version = v_quote_catalog_versions,
         quote_v2_revision = v_new_revision,
         quote_v2_last_priced_at = now(),
         total_amount = round(v_quote_total, 2),
         product_cost = round(v_product_cost_total, 2),
         manufacturer_cost = round(v_product_cost_total, 2),
         profit_amount = round(v_quote_total - v_product_cost_total, 2),
         updated_at = now()
   where id = p_quote_id;

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
    v_event_type,
    v_quote.quote_v2_revision,
    v_new_revision,
    p_actor_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'lineItemId', p_line_item_id,
      'designId', p_design_id,
      'snapshotId', v_snapshot_id,
      'selectionFingerprint', p_selection_fingerprint,
      'catalogVersion', p_catalog_version,
      'priceStatus', p_price_status,
      'selectedDesign', coalesce(p_select_design, false),
      'quoteStatus', v_quote_status,
      'quoteTotal', round(v_quote_total, 2),
      'productCostTotal', round(v_product_cost_total, 2)
    )
  );

  return query
  select
    p_quote_id,
    p_design_id,
    v_snapshot_id,
    v_new_revision,
    v_quote_status,
    round(v_quote_total, 2),
    round(v_product_cost_total, 2);
end;
$$;

revoke all on function public.save_quote_v2_pricing_result(
  uuid, uuid, uuid, bigint, text, uuid, boolean, jsonb, text, text, text,
  jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.save_quote_v2_pricing_result(
  uuid, uuid, uuid, bigint, text, uuid, boolean, jsonb, text, text, text,
  jsonb, jsonb, jsonb, jsonb
) to service_role;

comment on function public.save_quote_v2_pricing_result(
  uuid, uuid, uuid, bigint, text, uuid, boolean, jsonb, text, text, text,
  jsonb, jsonb, jsonb, jsonb
) is
  'Atomically persists one server-priced Quote V2 result and recomputes selected-design-only quote totals.';
