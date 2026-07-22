-- Quote-wide authoritative pricing persistence.
--
-- Order-level freight, oversize, and processing charges can change every
-- selected line's landed cost when any one line changes. Production therefore
-- persists one complete quote-wide engine result in one database transaction;
-- a sequence of independent line saves would make prior allocations stale.

create or replace function public.save_quote_v2_pricing_batch(
  p_quote_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_actor_id uuid,
  p_results jsonb
)
returns table (
  quote_id uuid,
  new_revision bigint,
  quote_status text,
  quote_total numeric,
  priced_design_count integer,
  blocked_design_count integer
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_line public.sales_quote_line_items%rowtype;
  v_design public.sales_quote_designs%rowtype;
  v_existing_event public.sales_quote_v2_events%rowtype;
  v_result jsonb;
  v_selection jsonb;
  v_authoritative_snapshot jsonb;
  v_internal_cost_snapshot jsonb;
  v_validation_snapshot jsonb;
  v_provenance_snapshot jsonb;
  v_options jsonb;
  v_event_results jsonb := '[]'::jsonb;
  v_seen_line_ids uuid[] := array[]::uuid[];
  v_line_id uuid;
  v_design_id uuid;
  v_snapshot_id uuid;
  v_selection_fingerprint text;
  v_catalog_version text;
  v_price_status text;
  v_select_design boolean;
  v_new_revision bigint;
  v_batch_hash text;
  v_unit_price numeric(12, 2);
  v_once_total numeric(12, 2);
  v_retail_total numeric(12, 2);
  v_internal_total numeric(12, 2);
  v_quote_total numeric(12, 2);
  v_product_cost_total numeric(12, 2);
  v_total_lines integer;
  v_selected_lines integer;
  v_authoritative_lines integer;
  v_selected_blocked_lines integer;
  v_selected_stale_lines integer;
  v_priced_design_count integer := 0;
  v_blocked_design_count integer := 0;
  v_stale_design_count integer := 0;
  v_quote_status text;
  v_quote_catalog_versions text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 batch pricing persistence requires the service role.'
      using errcode = '42501';
  end if;

  if p_quote_id is null or p_actor_id is null then
    raise exception 'A Quote V2 ID and authenticated actor ID are required.'
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

  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Quote V2 batch results must be a JSON array.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_results) < 1
    or jsonb_array_length(p_results) > 40
  then
    raise exception 'Quote V2 batch results must contain between 1 and 40 lines.'
      using errcode = '22023';
  end if;

  v_batch_hash := encode(
    digest(convert_to(p_results::text, 'UTF8'), 'sha256'),
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

  -- Parent locking serializes both revision checks and concurrent idempotent
  -- retries. A completed retry returns the original response unchanged.
  select events.*
    into v_existing_event
    from public.sales_quote_v2_events events
   where events.quote_id = p_quote_id
     and events.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_event.event_type <> 'pricing_batch'
      or v_existing_event.event_payload ->> 'batchHash'
          is distinct from v_batch_hash
    then
      raise exception 'The Quote V2 idempotency key was already used for a different request.'
        using errcode = '23505';
    end if;

    return query
    select
      p_quote_id,
      v_existing_event.new_revision,
      v_existing_event.event_payload ->> 'quoteStatus',
      coalesce((v_existing_event.event_payload ->> 'quoteTotal')::numeric, 0),
      coalesce((v_existing_event.event_payload ->> 'pricedDesignCount')::integer, 0),
      coalesce((v_existing_event.event_payload ->> 'blockedDesignCount')::integer, 0);
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

  select count(*)::integer
    into v_total_lines
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id;

  if v_total_lines < 1 or v_total_lines > 40 then
    raise exception 'An authoritative V2 quote must contain between 1 and 40 lines.'
      using errcode = '23514';
  end if;

  if jsonb_array_length(p_results) <> v_total_lines then
    raise exception 'A Quote V2 pricing batch must include exactly one result for every quote line.'
      using errcode = '22023';
  end if;

  -- Lock all lines in stable order. The parent lock already serializes Quote V2
  -- RPCs, but explicit child locks also protect against service-side mistakes.
  perform lines.id
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id
   order by lines.id
   for update;

  v_new_revision := v_quote.quote_v2_revision + 1;

  for v_result in
    select value
      from jsonb_array_elements(p_results)
  loop
    if jsonb_typeof(v_result) is distinct from 'object' then
      raise exception 'Every Quote V2 batch result must be a JSON object.'
        using errcode = '22023';
    end if;

    begin
      v_line_id := (v_result ->> 'lineItemId')::uuid;
      v_design_id := (v_result ->> 'designId')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Every Quote V2 batch result requires valid line-item and design IDs.'
          using errcode = '22023';
    end;

    if v_line_id is null or v_design_id is null then
      raise exception 'Every Quote V2 batch result requires line-item and design IDs.'
        using errcode = '22023';
    end if;

    if v_line_id = any(v_seen_line_ids) then
      raise exception 'A Quote V2 pricing batch cannot contain duplicate line items.'
        using errcode = '22023';
    end if;
    v_seen_line_ids := array_append(v_seen_line_ids, v_line_id);

    select lines.*
      into v_line
      from public.sales_quote_line_items lines
     where lines.id = v_line_id
       and lines.quote_id = p_quote_id
     for update;

    if not found then
      raise exception 'Line item % does not belong to quote %.',
        v_line_id,
        p_quote_id
        using errcode = '23503';
    end if;

    select designs.*
      into v_design
      from public.sales_quote_designs designs
     where designs.id = v_design_id
       and designs.line_item_id = v_line_id
     for update;

    if not found then
      raise exception 'Design % does not belong to line item %.',
        v_design_id,
        v_line_id
        using errcode = '23503';
    end if;

    v_selection := v_result -> 'selection';
    v_selection_fingerprint := v_result ->> 'selectionFingerprint';
    v_catalog_version := v_result ->> 'catalogVersion';
    v_price_status := v_result ->> 'priceStatus';
    if jsonb_typeof(v_result -> 'selectDesign') is distinct from 'boolean' then
      raise exception 'Every Quote V2 batch result requires an explicit boolean selectDesign intent.'
        using errcode = '22023';
    end if;
    v_select_design := (v_result ->> 'selectDesign')::boolean;
    v_authoritative_snapshot := v_result -> 'authoritativeSnapshot';
    v_internal_cost_snapshot := v_result -> 'internalCostSnapshot';
    v_validation_snapshot := coalesce(v_result -> 'validationSnapshot', '[]'::jsonb);
    v_provenance_snapshot := v_result -> 'provenanceSnapshot';
    v_snapshot_id := null;

    if jsonb_typeof(v_selection) is distinct from 'object'
      or v_selection ->> 'catalogVersion' is distinct from v_catalog_version
      or coalesce(btrim(v_selection ->> 'manufacturerId'), '') = ''
      or coalesce(btrim(v_selection ->> 'productId'), '') = ''
    then
      raise exception 'The canonical Quote V2 selection identity is incomplete or inconsistent.'
        using errcode = '22023';
    end if;

    if v_selection_fingerprint is null
      or v_selection_fingerprint !~ '^sha256:[0-9a-f]{64}$'
      or v_catalog_version is null
      or btrim(v_catalog_version) = ''
    then
      raise exception 'The Quote V2 fingerprint or catalog identity is invalid.'
        using errcode = '22023';
    end if;

    if v_price_status is null
      or v_price_status not in ('authoritative', 'stale', 'blocked', 'unpriceable')
    then
      raise exception 'Unsupported Quote V2 price status: %.', v_price_status
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_validation_snapshot) not in ('array', 'object') then
      raise exception 'Every Quote V2 validation snapshot must be a JSON array or object.'
        using errcode = '22023';
    end if;

    if v_provenance_snapshot is null
      or jsonb_typeof(v_provenance_snapshot) not in ('array', 'object')
      or v_provenance_snapshot in ('[]'::jsonb, '{}'::jsonb)
    then
      raise exception 'Every Quote V2 result requires authoritative source provenance.'
        using errcode = '22023';
    end if;

    if not v_select_design then
      if v_line.selected_design_id is not null
        or v_price_status = 'authoritative'
      then
        raise exception 'Only an unselected, non-authoritative fallback design may preserve a null selected_design_id.'
          using errcode = '22023';
      end if;
    end if;

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

    if v_price_status = 'authoritative' then
      if jsonb_typeof(v_authoritative_snapshot) is distinct from 'object'
        or jsonb_typeof(v_authoritative_snapshot -> 'retail') is distinct from 'object'
        or v_authoritative_snapshot ->> 'priceStatus' is distinct from 'authoritative'
        or v_authoritative_snapshot ->> 'selectionFingerprint'
            is distinct from v_selection_fingerprint
        or v_authoritative_snapshot ->> 'catalogVersion'
            is distinct from v_catalog_version
        or v_authoritative_snapshot #>> '{retail,ok}' is distinct from 'true'
        or v_authoritative_snapshot #>> '{retail,validationStatus}'
            is distinct from 'valid'
        or v_authoritative_snapshot #>> '{retail,catalogVersion}'
            is distinct from v_catalog_version
        or coalesce(btrim(v_authoritative_snapshot ->> 'catalogAsOf'), '') = ''
        or jsonb_typeof(v_authoritative_snapshot #> '{retail,unitPrice}')
            is distinct from 'number'
        or jsonb_typeof(v_authoritative_snapshot #> '{retail,onceTotal}')
            is distinct from 'number'
        or jsonb_typeof(v_authoritative_snapshot #> '{retail,total}')
            is distinct from 'number'
        or jsonb_typeof(v_authoritative_snapshot #> '{retail,quantity}')
            is distinct from 'number'
      then
        raise exception 'An authoritative Quote V2 retail snapshot is incomplete or inconsistent.'
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_internal_cost_snapshot) is distinct from 'object'
        or jsonb_typeof(v_internal_cost_snapshot -> 'productCostTotal')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'freightAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'oversizeAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'processingFeeAllocated')
            is distinct from 'number'
        or jsonb_typeof(v_internal_cost_snapshot -> 'landedCostTotal')
            is distinct from 'number'
      then
        raise exception 'An authoritative protected-cost snapshot is required for every priced line.'
          using errcode = '22023';
      end if;

      begin
        v_unit_price := (v_authoritative_snapshot #>> '{retail,unitPrice}')::numeric;
        v_once_total := (v_authoritative_snapshot #>> '{retail,onceTotal}')::numeric;
        v_retail_total := (v_authoritative_snapshot #>> '{retail,total}')::numeric;
        v_internal_total := (v_internal_cost_snapshot ->> 'landedCostTotal')::numeric;
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'An authoritative Quote V2 snapshot contains invalid money values.'
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

      if (v_internal_cost_snapshot ->> 'productCostTotal')::numeric < 0
        or (v_internal_cost_snapshot ->> 'freightAllocated')::numeric < 0
        or (v_internal_cost_snapshot ->> 'oversizeAllocated')::numeric < 0
        or (v_internal_cost_snapshot ->> 'processingFeeAllocated')::numeric < 0
        or round(v_internal_total, 2) is distinct from round(
          (v_internal_cost_snapshot ->> 'productCostTotal')::numeric
          + (v_internal_cost_snapshot ->> 'freightAllocated')::numeric
          + (v_internal_cost_snapshot ->> 'oversizeAllocated')::numeric
          + (v_internal_cost_snapshot ->> 'processingFeeAllocated')::numeric,
          2
        )
      then
        raise exception 'Landed cost must equal product cost plus allocated freight, oversize, and processing charges.'
          using errcode = '22023';
      end if;

      if (v_authoritative_snapshot #>> '{retail,quantity}')::numeric
          is distinct from v_line.quantity::numeric
      then
        raise exception 'An authoritative snapshot quantity does not match its persisted line item.'
          using errcode = '22023';
      end if;

      if round(v_retail_total, 2)
          is distinct from round(v_unit_price * v_line.quantity + v_once_total, 2)
      then
        raise exception 'An authoritative line total does not equal unit price times quantity plus once-per-line charges.'
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
        v_line_id,
        v_design_id,
        v_new_revision,
        v_selection_fingerprint,
        v_catalog_version,
        round(v_retail_total, 2),
        round(v_internal_total, 2),
        v_authoritative_snapshot,
        v_internal_cost_snapshot,
        v_validation_snapshot,
        v_provenance_snapshot,
        p_actor_id
      )
      returning id into v_snapshot_id;

      v_options := v_options || jsonb_build_object(
        'authoritative_price_status', 'authoritative',
        'authoritative_price_breakdown', v_authoritative_snapshot -> 'retail',
        'authoritative_v2_snapshot', v_authoritative_snapshot,
        'authoritative_once_total', round(v_once_total, 2),
        'priced_selection_fingerprint', v_selection_fingerprint,
        'priced_catalog_version', v_catalog_version,
        'quote_v2_catalog_version', v_catalog_version,
        'quote_v2_catalog_as_of', v_authoritative_snapshot ->> 'catalogAsOf'
      );

      update public.sales_quote_designs
         set quote_v2_selection = v_selection,
             quote_v2_price_status = 'authoritative',
             quote_v2_selection_fingerprint = v_selection_fingerprint,
             quote_v2_priced_catalog_version = v_catalog_version,
             quote_v2_priced_at = now(),
             current_v2_snapshot_id = v_snapshot_id,
             unit_price = round(v_unit_price, 2),
             options_json = v_options
       where id = v_design_id;

      v_priced_design_count := v_priced_design_count + 1;
    else
      if (
        v_authoritative_snapshot is not null
        and v_authoritative_snapshot <> 'null'::jsonb
      ) or (
        v_internal_cost_snapshot is not null
        and v_internal_cost_snapshot <> 'null'::jsonb
      ) then
        raise exception 'Non-authoritative batch results cannot persist retail or cost snapshots.'
          using errcode = '22023';
      end if;

      v_options := v_options || jsonb_build_object(
        'authoritative_price_status', v_price_status,
        'priced_selection_fingerprint', v_selection_fingerprint,
        'priced_catalog_version', v_catalog_version,
        'quote_v2_catalog_version', v_catalog_version
      );

      update public.sales_quote_designs
         set quote_v2_selection = v_selection,
             quote_v2_price_status = v_price_status,
             quote_v2_selection_fingerprint = v_selection_fingerprint,
             quote_v2_priced_catalog_version = v_catalog_version,
             quote_v2_priced_at = now(),
             current_v2_snapshot_id = null,
             unit_price = 0,
             options_json = v_options
       where id = v_design_id;

      if v_price_status = 'stale' then
        v_stale_design_count := v_stale_design_count + 1;
      else
        v_blocked_design_count := v_blocked_design_count + 1;
      end if;
    end if;

    if v_select_design then
      -- A prior selected alternative cannot remain current after the selected
      -- design changes. Its immutable history remains in the snapshot table,
      -- but the mutable pointer and customer-visible price are invalidated.
      if v_line.selected_design_id is not null
        and v_line.selected_design_id <> v_design_id
      then
        update public.sales_quote_designs
           set quote_v2_price_status = 'stale',
               current_v2_snapshot_id = null,
               unit_price = 0,
               options_json = (
                 coalesce(options_json, '{}'::jsonb)
                   - 'authoritative_price_breakdown'
                   - 'authoritative_cost_breakdown'
                   - 'authoritative_v2_snapshot'
                   - 'authoritative_once_total'
               ) || jsonb_build_object(
                 'authoritative_price_status', 'stale',
                 'quote_v2_backend', true
               )
         where id = v_line.selected_design_id
           and line_item_id = v_line_id;
      end if;

      update public.sales_quote_line_items
         set selected_design_id = v_design_id
       where id = v_line_id;
    end if;

    v_event_results := v_event_results || jsonb_build_array(
      jsonb_build_object(
        'lineItemId', v_line_id,
        'designId', v_design_id,
        'snapshotId', v_snapshot_id,
        'selectionFingerprint', v_selection_fingerprint,
        'catalogVersion', v_catalog_version,
        'priceStatus', v_price_status,
        'selectedDesign', v_select_design
      )
    );
  end loop;

  if cardinality(v_seen_line_ids) <> v_total_lines then
    raise exception 'A Quote V2 pricing batch did not cover every quote line exactly once.'
      using errcode = '22023';
  end if;

  select
    count(lines.selected_design_id)::integer,
    count(*) filter (
      where designs.quote_v2_price_status = 'authoritative'
        and designs.current_v2_snapshot_id is not null
    )::integer,
    count(*) filter (
      where designs.quote_v2_price_status in ('blocked', 'unpriceable')
    )::integer,
    count(*) filter (
      where designs.quote_v2_price_status = 'stale'
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
      v_selected_lines,
      v_authoritative_lines,
      v_selected_blocked_lines,
      v_selected_stale_lines,
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
    when v_blocked_design_count > 0 or v_selected_blocked_lines > 0 then 'blocked'
    when v_stale_design_count > 0 or v_selected_stale_lines > 0 then 'stale'
    when v_selected_lines = v_total_lines
      and v_authoritative_lines = v_total_lines then 'priced'
    when v_selected_lines = 0 then 'draft'
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
    'pricing_batch',
    v_quote.quote_v2_revision,
    v_new_revision,
    p_actor_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'batchHash', v_batch_hash,
      'resultCount', jsonb_array_length(p_results),
      'results', v_event_results,
      'quoteStatus', v_quote_status,
      'quoteTotal', round(v_quote_total, 2),
      'productCostTotal', round(v_product_cost_total, 2),
      'pricedDesignCount', v_priced_design_count,
      'blockedDesignCount', v_blocked_design_count,
      'staleDesignCount', v_stale_design_count
    )
  );

  return query
  select
    p_quote_id,
    v_new_revision,
    v_quote_status,
    round(v_quote_total, 2),
    v_priced_design_count,
    v_blocked_design_count;
end;
$$;

revoke all on function public.save_quote_v2_pricing_batch(
  uuid, bigint, text, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.save_quote_v2_pricing_batch(
  uuid, bigint, text, uuid, jsonb
) to service_role;

comment on function public.save_quote_v2_pricing_batch(
  uuid, bigint, text, uuid, jsonb
) is
  'Atomically persists one complete server-priced Quote V2 batch so order-level cost allocations cannot drift between lines.';
