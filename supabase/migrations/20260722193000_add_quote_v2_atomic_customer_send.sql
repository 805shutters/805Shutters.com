-- Atomic customer-safe Quote V2 send persistence.
--
-- This migration is additive and does not modify or backfill any legacy quote.
-- The RPC is a persistence boundary only: it does not send email/SMS and is not
-- wired into the production send route until a separately approved cutover.
--
-- Trusted server code first reprices the selected designs with the authoritative
-- TypeScript engine. This RPC then locks the quote and independently proves that
-- every selected immutable retail snapshot is still current before it mirrors
-- an allow-listed customer payload and advances the V2 lifecycle in one database
-- transaction. Protected cost columns are never selected into the mirror.

create or replace function public.quote_v2_customer_json_has_protected_key(
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
  v_normalized_key text;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      v_normalized_key := regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
      if v_normalized_key ~ '(dealer|wholesale|internal|landed|margin|markup|multiplier)'
        or v_normalized_key ~ 'cost'
        or v_normalized_key in (
          'optionsjson',
          'provenance',
          'validationsnapshot',
          'dealerschedule',
          'processingfeeallocated'
        )
      then
        return true;
      end if;
      if public.quote_v2_customer_json_has_protected_key(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if public.quote_v2_customer_json_has_protected_key(v_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function public.quote_v2_customer_json_has_protected_key(jsonb)
  from public, anon, authenticated;
grant execute on function public.quote_v2_customer_json_has_protected_key(jsonb)
  to service_role;

create table if not exists public.sales_quote_v2_customer_send_snapshots (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  priced_quote_revision bigint not null,
  sent_quote_revision bigint not null,
  catalog_version text not null,
  retail_total numeric(12, 2) not null,
  customer_payload jsonb not null,
  crm_job_id uuid not null references public.crm_jobs(id) on delete restrict,
  crm_quote_id uuid not null references public.crm_quotes(id) on delete restrict,
  sent_via text not null,
  created_by uuid not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint sales_quote_v2_customer_send_revision_check check (
    priced_quote_revision >= 0
    and sent_quote_revision = priced_quote_revision + 1
  ),
  constraint sales_quote_v2_customer_send_total_check
    check (retail_total >= 0),
  constraint sales_quote_v2_customer_send_catalog_check
    check (btrim(catalog_version) <> ''),
  constraint sales_quote_v2_customer_send_channel_check
    check (sent_via in ('email', 'sms', 'both')),
  constraint sales_quote_v2_customer_send_idempotency_check
    check (btrim(idempotency_key) <> '' and length(idempotency_key) <= 200),
  constraint sales_quote_v2_customer_send_payload_check check (
    jsonb_typeof(customer_payload) = 'object'
    and customer_payload ->> 'backend' = 'authoritative_v2'
    and jsonb_typeof(customer_payload -> 'total') = 'number'
    and jsonb_typeof(customer_payload -> 'lines') = 'array'
    and not public.quote_v2_customer_json_has_protected_key(customer_payload)
  ),
  constraint sales_quote_v2_customer_send_idempotency_uniq
    unique (quote_id, idempotency_key),
  constraint sales_quote_v2_customer_send_revision_uniq
    unique (quote_id, sent_quote_revision)
);

create index if not exists sales_quote_v2_customer_send_quote_created_idx
  on public.sales_quote_v2_customer_send_snapshots (quote_id, created_at desc);

alter table public.sales_quote_v2_customer_send_snapshots enable row level security;

revoke all on public.sales_quote_v2_customer_send_snapshots
  from public, anon, authenticated;
grant select on public.sales_quote_v2_customer_send_snapshots to authenticated;
grant all on public.sales_quote_v2_customer_send_snapshots to service_role;

drop policy if exists "805 CRM users read V2 customer send snapshots"
  on public.sales_quote_v2_customer_send_snapshots;
create policy "805 CRM users read V2 customer send snapshots"
on public.sales_quote_v2_customer_send_snapshots
for select
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

drop trigger if exists sales_quote_v2_customer_send_snapshots_append_only
  on public.sales_quote_v2_customer_send_snapshots;
create trigger sales_quote_v2_customer_send_snapshots_append_only
before update or delete
on public.sales_quote_v2_customer_send_snapshots
for each row
execute function public.reject_v2_audit_mutation();

create or replace function public.persist_quote_v2_customer_send(
  p_quote_id uuid,
  p_expected_revision bigint,
  p_expected_catalog_version text,
  p_idempotency_key text,
  p_actor_id uuid,
  p_sent_via text,
  p_customer_payload jsonb
)
returns table (
  send_snapshot_id uuid,
  quote_id uuid,
  crm_quote_id uuid,
  previous_revision bigint,
  new_revision bigint,
  catalog_version text,
  quote_total numeric,
  persisted_sent_at timestamptz,
  persisted_sent_via text,
  customer_payload jsonb
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_existing public.sales_quote_v2_customer_send_snapshots%rowtype;
  v_line record;
  v_customer_line jsonb;
  v_retail jsonb;
  v_safe_surcharges jsonb;
  v_safe_price jsonb;
  v_safe_line jsonb;
  v_safe_lines jsonb := '[]'::jsonb;
  v_safe_payload jsonb;
  v_selected_catalog_versions text;
  v_total_lines integer;
  v_mirrored_line_ids uuid[] := array[]::uuid[];
  v_line_id uuid;
  v_design_id uuid;
  v_send_snapshot_id uuid := gen_random_uuid();
  v_crm_job_id uuid;
  v_crm_quote_id uuid;
  v_new_revision bigint;
  v_retail_total numeric(12, 2) := 0;
  v_line_total numeric(12, 2);
  v_unit_price numeric(12, 2);
  v_quantity integer;
  v_product_interest text;
  v_sent_at timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Quote V2 customer-send persistence requires the service role.'
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
    raise exception 'The Quote V2 customer-send actor is not authorized to mutate quotes.'
      using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A positive expected Quote V2 revision is required.'
      using errcode = '22023';
  end if;

  if p_expected_catalog_version is null
    or btrim(p_expected_catalog_version) = ''
    or length(p_expected_catalog_version) > 500
  then
    raise exception 'A non-empty expected Quote V2 catalog identity is required.'
      using errcode = '22023';
  end if;

  if p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 200
  then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.'
      using errcode = '22023';
  end if;

  if p_sent_via is null or p_sent_via not in ('email', 'sms', 'both') then
    raise exception 'Quote V2 sent_via must be email, sms, or both.'
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

  -- A completed retry returns the original immutable customer-safe result.
  -- It is checked before lifecycle validation because the source quote is now
  -- intentionally in the sent state.
  select snapshots.*
    into v_existing
    from public.sales_quote_v2_customer_send_snapshots snapshots
   where snapshots.quote_id = p_quote_id
     and snapshots.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing.priced_quote_revision <> p_expected_revision
      or v_existing.catalog_version is distinct from btrim(p_expected_catalog_version)
      or v_existing.sent_via is distinct from p_sent_via
      or (
        p_customer_payload is not null
        and v_existing.customer_payload is distinct from p_customer_payload
      )
    then
      raise exception 'The Quote V2 idempotency key was already used for a different customer-send request.'
        using errcode = '23505';
    end if;

    return query
    select
      v_existing.id,
      v_existing.quote_id,
      v_existing.crm_quote_id,
      v_existing.priced_quote_revision,
      v_existing.sent_quote_revision,
      v_existing.catalog_version,
      v_existing.retail_total,
      v_existing.created_at,
      v_existing.sent_via,
      v_existing.customer_payload;
    return;
  end if;

  if v_quote.status <> 'draft' or v_quote.quote_v2_status <> 'priced' then
    raise exception 'Only a priced draft Quote V2 can enter customer-send persistence.'
      using errcode = '55000';
  end if;

  if v_quote.quote_v2_revision <> p_expected_revision then
    raise exception 'Quote V2 revision conflict: expected %, current %.',
      p_expected_revision,
      v_quote.quote_v2_revision
      using errcode = '40001';
  end if;

  if v_quote.quote_v2_catalog_version is distinct from btrim(p_expected_catalog_version) then
    raise exception 'Quote V2 catalog conflict: expected %, current %.',
      btrim(p_expected_catalog_version),
      v_quote.quote_v2_catalog_version
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_customer_payload) is distinct from 'object' then
    raise exception 'A server-revalidated customer payload is required.'
      using errcode = '22023';
  end if;

  select count(*)::integer
    into v_total_lines
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id;

  if v_total_lines < 1 or v_total_lines > 40 then
    raise exception 'An authoritative V2 quote must contain between 1 and 40 lines.'
      using errcode = '23514';
  end if;

  -- Lock the complete selected lineage. Parent locking serializes all V2 RPCs;
  -- explicit child locks also prevent future server code from bypassing that
  -- invariant accidentally.
  perform lines.id
    from public.sales_quote_line_items lines
    join public.sales_quote_designs designs
      on designs.id = lines.selected_design_id
     and designs.line_item_id = lines.id
    join public.sales_quote_v2_price_snapshots snapshots
      on snapshots.id = designs.current_v2_snapshot_id
     and snapshots.design_id = designs.id
   where lines.quote_id = p_quote_id
   order by lines.id
   for update of lines, designs, snapshots;

  for v_line in
    select
      lines.id as line_item_id,
      lines.room_name,
      lines.product_type,
      lines.width_whole,
      lines.width_fraction,
      lines.height_whole,
      lines.height_fraction,
      lines.quantity,
      lines.sort_order,
      lines.selected_design_id,
      designs.id as design_id,
      designs.variant,
      designs.unit_price,
      designs.quote_v2_price_status,
      designs.quote_v2_selection_fingerprint,
      designs.quote_v2_priced_catalog_version,
      designs.current_v2_snapshot_id,
      snapshots.id as snapshot_id,
      snapshots.quote_id as snapshot_quote_id,
      snapshots.line_item_id as snapshot_line_item_id,
      snapshots.design_id as snapshot_design_id,
      snapshots.quote_revision as snapshot_quote_revision,
      snapshots.selection_fingerprint as snapshot_selection_fingerprint,
      snapshots.catalog_version as snapshot_catalog_version,
      snapshots.retail_total as snapshot_retail_total,
      snapshots.retail_snapshot
    from public.sales_quote_line_items lines
    left join public.sales_quote_designs designs
      on designs.id = lines.selected_design_id
     and designs.line_item_id = lines.id
    left join public.sales_quote_v2_price_snapshots snapshots
      on snapshots.id = designs.current_v2_snapshot_id
     and snapshots.design_id = designs.id
   where lines.quote_id = p_quote_id
   order by lines.sort_order, lines.id
  loop
    if v_line.selected_design_id is null
      or v_line.design_id is null
      or v_line.snapshot_id is null
    then
      raise exception 'Every Quote V2 line requires one selected design with a current snapshot.'
        using errcode = '23514';
    end if;

    if v_line.quote_v2_price_status is distinct from 'authoritative'
      or v_line.current_v2_snapshot_id is distinct from v_line.snapshot_id
      or v_line.snapshot_quote_id is distinct from p_quote_id
      or v_line.snapshot_line_item_id is distinct from v_line.line_item_id
      or v_line.snapshot_design_id is distinct from v_line.design_id
      or v_line.snapshot_quote_revision is distinct from p_expected_revision
      or v_line.snapshot_selection_fingerprint
          is distinct from v_line.quote_v2_selection_fingerprint
      or v_line.snapshot_catalog_version
          is distinct from v_line.quote_v2_priced_catalog_version
    then
      raise exception 'A selected Quote V2 snapshot is stale or has inconsistent ownership.'
        using errcode = '40001';
    end if;

    if v_line.snapshot_catalog_version is null
      or btrim(v_line.snapshot_catalog_version) = ''
      or v_line.quote_v2_selection_fingerprint is null
      or v_line.quote_v2_selection_fingerprint !~ '^sha256:[0-9a-f]{64}$'
      or jsonb_typeof(v_line.retail_snapshot) is distinct from 'object'
      or v_line.retail_snapshot ->> 'priceStatus' is distinct from 'authoritative'
      or v_line.retail_snapshot ->> 'selectionFingerprint'
          is distinct from v_line.snapshot_selection_fingerprint
      or v_line.retail_snapshot ->> 'catalogVersion'
          is distinct from v_line.snapshot_catalog_version
    then
      raise exception 'A selected Quote V2 immutable retail snapshot is incomplete or inconsistent.'
        using errcode = '22023';
    end if;

    v_retail := v_line.retail_snapshot -> 'retail';
    if jsonb_typeof(v_retail) is distinct from 'object'
      or v_retail ->> 'ok' is distinct from 'true'
      or v_retail ->> 'validationStatus' is distinct from 'valid'
      or v_retail ->> 'catalogVersion' is distinct from v_line.snapshot_catalog_version
      or coalesce(btrim(v_retail ->> 'productId'), '') = ''
      or coalesce(btrim(v_retail ->> 'programId'), '') = ''
      or coalesce(btrim(v_retail ->> 'programName'), '') = ''
      or jsonb_typeof(v_retail -> 'matchedWidth') is distinct from 'number'
      or coalesce(
        jsonb_typeof(v_retail -> 'matchedHeight'),
        'missing'
      ) not in ('null', 'number')
      or jsonb_typeof(v_retail -> 'base') is distinct from 'number'
      or jsonb_typeof(v_retail -> 'surchargeLines') is distinct from 'array'
      or jsonb_typeof(v_retail -> 'unitPrice') is distinct from 'number'
      or jsonb_typeof(v_retail -> 'discountPercent') is distinct from 'number'
      or jsonb_typeof(v_retail -> 'discountAmount') is distinct from 'number'
      or jsonb_typeof(v_retail -> 'quantity') is distinct from 'number'
      or jsonb_typeof(v_retail -> 'onceTotal') is distinct from 'number'
      or jsonb_typeof(v_retail -> 'total') is distinct from 'number'
    then
      raise exception 'A selected Quote V2 retail result cannot be projected safely.'
        using errcode = '22023';
    end if;

    if exists (
      select 1
        from jsonb_array_elements(v_retail -> 'surchargeLines') with ordinality
          as surcharge(value, ordinal)
       where jsonb_typeof(surcharge.value) is distinct from 'object'
          or coalesce(btrim(surcharge.value ->> 'id'), '') = ''
          or coalesce(btrim(surcharge.value ->> 'label'), '') = ''
          or jsonb_typeof(surcharge.value -> 'amount') is distinct from 'number'
    ) then
      raise exception 'A selected Quote V2 retail surcharge cannot be projected safely.'
        using errcode = '22023';
    end if;

    begin
      v_quantity := (v_retail ->> 'quantity')::integer;
      v_unit_price := round((v_retail ->> 'unitPrice')::numeric, 2);
      v_line_total := round((v_retail ->> 'total')::numeric, 2);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'A selected Quote V2 retail result contains invalid numeric values.'
          using errcode = '22023';
    end;

    if v_quantity < 1
      or v_quantity is distinct from v_line.quantity
      or v_unit_price < 0
      or v_line_total < 0
      or round(v_line.snapshot_retail_total, 2) is distinct from v_line_total
      or round(v_line.unit_price, 2) is distinct from v_unit_price
      or (v_retail ->> 'base')::numeric < 0
      or (v_retail ->> 'discountPercent')::numeric < 0
      or (v_retail ->> 'discountPercent')::numeric > 100
      or (v_retail ->> 'discountAmount')::numeric < 0
      or (v_retail ->> 'onceTotal')::numeric < 0
    then
      raise exception 'A selected Quote V2 retail total, quantity, or discount is inconsistent.'
        using errcode = '22023';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', surcharge.value ->> 'id',
          'label', surcharge.value ->> 'label',
          'amount', (surcharge.value ->> 'amount')::numeric
        ) order by surcharge.ordinal
      ),
      '[]'::jsonb
    )
      into v_safe_surcharges
      from jsonb_array_elements(v_retail -> 'surchargeLines') with ordinality
        as surcharge(value, ordinal);

    v_safe_price := jsonb_build_object(
      'productId', v_retail ->> 'productId',
      'programId', v_retail ->> 'programId',
      'programName', v_retail ->> 'programName',
      'matchedWidth', (v_retail ->> 'matchedWidth')::numeric,
      'matchedHeight', case
        when v_retail -> 'matchedHeight' = 'null'::jsonb then null
        else (v_retail ->> 'matchedHeight')::numeric
      end,
      'base', (v_retail ->> 'base')::numeric,
      'surchargeLines', v_safe_surcharges,
      'unitPrice', v_unit_price,
      'discountPercent', (v_retail ->> 'discountPercent')::numeric,
      'discountAmount', (v_retail ->> 'discountAmount')::numeric,
      'quantity', v_quantity,
      'onceTotal', (v_retail ->> 'onceTotal')::numeric,
      'total', v_line_total
    );

    if jsonb_typeof(v_retail -> 'sqft') = 'number' then
      v_safe_price := v_safe_price || jsonb_build_object(
        'sqft', (v_retail ->> 'sqft')::numeric
      );
    end if;
    if jsonb_typeof(v_retail -> 'billableSqft') = 'number' then
      v_safe_price := v_safe_price || jsonb_build_object(
        'billableSqft', (v_retail ->> 'billableSqft')::numeric
      );
    end if;

    v_safe_line := jsonb_build_object(
      'lineItemId', v_line.line_item_id,
      'selectedDesignId', v_line.design_id,
      'selectedVariant', v_line.variant,
      'room', nullif(btrim(v_line.room_name), ''),
      'productType', nullif(btrim(v_line.product_type), ''),
      'widthInches', round(
        v_line.width_whole::numeric + case
          when v_line.width_fraction ~ '^[0-9]+/[1-9][0-9]*$'
            then split_part(v_line.width_fraction, '/', 1)::numeric
              / split_part(v_line.width_fraction, '/', 2)::numeric
          else 0
        end,
        4
      ),
      'heightInches', round(
        v_line.height_whole::numeric + case
          when v_line.height_fraction ~ '^[0-9]+/[1-9][0-9]*$'
            then split_part(v_line.height_fraction, '/', 1)::numeric
              / split_part(v_line.height_fraction, '/', 2)::numeric
          else 0
        end,
        4
      ),
      'quantity', v_quantity,
      'price', v_safe_price
    );

    v_safe_lines := v_safe_lines || jsonb_build_array(v_safe_line);
    v_retail_total := round(v_retail_total + v_line_total, 2);
  end loop;

  select string_agg(
    distinct snapshots.catalog_version,
    ',' order by snapshots.catalog_version
  )
    into v_selected_catalog_versions
    from public.sales_quote_line_items lines
    join public.sales_quote_designs designs
      on designs.id = lines.selected_design_id
     and designs.line_item_id = lines.id
    join public.sales_quote_v2_price_snapshots snapshots
      on snapshots.id = designs.current_v2_snapshot_id
     and snapshots.design_id = designs.id
   where lines.quote_id = p_quote_id;

  if v_selected_catalog_versions is distinct from v_quote.quote_v2_catalog_version
    or v_selected_catalog_versions is distinct from btrim(p_expected_catalog_version)
  then
    raise exception 'The selected Quote V2 snapshots do not match the quote catalog identity.'
      using errcode = '40001';
  end if;

  if round(coalesce(v_quote.total_amount, 0), 2) is distinct from v_retail_total then
    raise exception 'The selected Quote V2 snapshots do not match the quote retail total.'
      using errcode = '40001';
  end if;

  v_safe_payload := jsonb_build_object(
    'backend', 'authoritative_v2',
    'total', v_retail_total,
    'lines', v_safe_lines
  );

  -- JSONB equality rejects missing, extra, or altered fields. Since v_safe_payload
  -- is constructed from an explicit allow-list, a server bug cannot smuggle a
  -- dealer-cost, freight-cost, multiplier, margin, wholesale, or options object
  -- into the customer mirror.
  if p_customer_payload is distinct from v_safe_payload then
    raise exception 'The server customer payload drifted from the locked authoritative snapshots.'
      using errcode = '40001';
  end if;

  v_new_revision := v_quote.quote_v2_revision + 1;

  select coalesce(
    string_agg(distinct lower(lines.product_type), ', ' order by lower(lines.product_type)),
    'window treatments'
  )
    into v_product_interest
    from public.sales_quote_line_items lines
   where lines.quote_id = p_quote_id;

  -- Reuse the established external identity so a pre-existing draft mirror is
  -- replaced safely instead of creating a second public contract. Every column
  -- below is an explicit customer-safe allow-list; no source notes or cost fields
  -- are copied.
  if exists (
    select 1
      from public.crm_quotes quotes
     where quotes.external_source = 'mts_805_bookkeeping'
       and quotes.external_id = 'quote:' || p_quote_id::text
       and quotes.status <> 'draft'
  ) then
    raise exception 'An existing non-draft customer mirror cannot be replaced by Quote V2.'
      using errcode = '55000';
  end if;

  insert into public.crm_jobs (
    external_source,
    external_id,
    source,
    status,
    priority,
    customer_name,
    phone,
    email,
    address,
    city,
    product_interest,
    sales_owner,
    next_action,
    next_action_due,
    appointment_start,
    appointment_end,
    estimated_total,
    deposit_paid,
    notes,
    meta,
    updated_at
  ) values (
    'mts_805_bookkeeping',
    'quote:' || p_quote_id::text,
    'sales_quote_v2_send',
    'quoted',
    'normal',
    v_quote.customer_name,
    coalesce(nullif(btrim(v_quote.customer_phone), ''), 'unknown'),
    nullif(btrim(v_quote.customer_email), ''),
    nullif(btrim(v_quote.customer_address), ''),
    null,
    v_product_interest,
    case lower(coalesce(v_quote.sales_owner, ''))
      when 'mike' then 'Mike'
      when 'jessica' then 'Jessica'
      else 'Unassigned'
    end,
    'Follow up',
    null,
    v_quote.appointment_date::timestamptz,
    null,
    v_retail_total,
    round(coalesce(v_quote.deposit_paid, 0), 2),
    null,
    jsonb_build_object(
      'source', 'sales_quote_v2_send',
      'source_sales_quote_id', p_quote_id,
      'account_id', v_quote.account_id,
      'quote_v2_backend', true,
      'quote_v2_revision', v_new_revision,
      'customer_send_snapshot_id', v_send_snapshot_id
    ),
    v_sent_at
  )
  on conflict (external_source, external_id) do update
     set source = excluded.source,
         status = excluded.status,
         priority = excluded.priority,
         customer_name = excluded.customer_name,
         phone = excluded.phone,
         email = excluded.email,
         address = excluded.address,
         city = excluded.city,
         product_interest = excluded.product_interest,
         sales_owner = excluded.sales_owner,
         next_action = excluded.next_action,
         next_action_due = excluded.next_action_due,
         appointment_start = excluded.appointment_start,
         appointment_end = excluded.appointment_end,
         estimated_total = excluded.estimated_total,
         deposit_paid = excluded.deposit_paid,
         notes = excluded.notes,
         meta = excluded.meta,
         updated_at = excluded.updated_at
  returning id into v_crm_job_id;

  insert into public.crm_quotes (
    external_source,
    external_id,
    job_id,
    quote_number,
    status,
    quote_total,
    materials_cost,
    labor_cost,
    discount,
    tax,
    deposit_required,
    balance_due,
    sold_by,
    sent_at,
    customer_email,
    customer_phone,
    customer_address,
    share_token,
    quote_group_id,
    quote_label,
    notes,
    meta,
    updated_at
  ) values (
    'mts_805_bookkeeping',
    'quote:' || p_quote_id::text,
    v_crm_job_id,
    v_quote.quote_number,
    'sent',
    v_retail_total,
    0,
    0,
    0,
    0,
    round(v_retail_total * 0.5, 2),
    round(v_retail_total - round(v_retail_total * 0.5, 2), 2),
    case lower(coalesce(v_quote.sales_owner, ''))
      when 'mike' then 'Mike'
      when 'jessica' then 'Jessica'
      else 'Unassigned'
    end,
    v_sent_at,
    nullif(btrim(v_quote.customer_email), ''),
    nullif(btrim(v_quote.customer_phone), ''),
    nullif(btrim(v_quote.customer_address), ''),
    v_quote.share_token::text,
    v_quote.quote_group_id,
    v_quote.quote_letter,
    null,
    jsonb_build_object(
      'source', 'sales_quote_v2_send',
      'source_sales_quote_id', p_quote_id,
      'account_id', v_quote.account_id,
      'quote_v2_backend', true,
      'quote_v2_revision', v_new_revision,
      'quote_v2_catalog_version', v_selected_catalog_versions,
      'customer_send_snapshot_id', v_send_snapshot_id
    ),
    v_sent_at
  )
  on conflict (external_source, external_id) do update
     set job_id = excluded.job_id,
         quote_number = excluded.quote_number,
         status = excluded.status,
         quote_total = excluded.quote_total,
         materials_cost = 0,
         labor_cost = 0,
         discount = excluded.discount,
         tax = excluded.tax,
         deposit_required = excluded.deposit_required,
         balance_due = excluded.balance_due,
         sold_by = excluded.sold_by,
         sent_at = excluded.sent_at,
         customer_email = excluded.customer_email,
         customer_phone = excluded.customer_phone,
         customer_address = excluded.customer_address,
         share_token = excluded.share_token,
         quote_group_id = excluded.quote_group_id,
         quote_label = excluded.quote_label,
         notes = null,
         meta = excluded.meta,
         updated_at = excluded.updated_at
  returning id into v_crm_quote_id;

  for v_customer_line in
    select value
      from jsonb_array_elements(v_safe_payload -> 'lines') with ordinality
        as customer_line(value, ordinal)
     order by ordinal
  loop
    v_line_id := (v_customer_line ->> 'lineItemId')::uuid;
    v_design_id := (v_customer_line ->> 'selectedDesignId')::uuid;

    if exists (
      select 1
        from public.crm_quote_line_items lines
       where lines.id = v_line_id
         and lines.quote_id <> v_crm_quote_id
    ) then
      raise exception 'A customer-mirror line ID already belongs to another quote.'
        using errcode = '23505';
    end if;

    if exists (
      select 1
        from public.crm_quote_designs designs
       where designs.id = v_design_id
         and designs.line_item_id <> v_line_id
    ) then
      raise exception 'A customer-mirror design ID already belongs to another line.'
        using errcode = '23505';
    end if;

    insert into public.crm_quote_line_items (
      id,
      quote_id,
      room,
      width_in,
      height_in,
      quantity,
      discount_percent,
      sort_order,
      selected_design_id,
      notes
    ) values (
      v_line_id,
      v_crm_quote_id,
      v_customer_line ->> 'room',
      (v_customer_line ->> 'widthInches')::numeric,
      (v_customer_line ->> 'heightInches')::numeric,
      (v_customer_line ->> 'quantity')::integer,
      (v_customer_line #>> '{price,discountPercent}')::numeric,
      cardinality(v_mirrored_line_ids),
      null,
      v_customer_line ->> 'productType'
    )
    on conflict (id) do update
       set quote_id = excluded.quote_id,
           room = excluded.room,
           width_in = excluded.width_in,
           height_in = excluded.height_in,
           quantity = excluded.quantity,
           discount_percent = excluded.discount_percent,
           sort_order = excluded.sort_order,
           selected_design_id = null,
           notes = excluded.notes,
           updated_at = v_sent_at;

    delete from public.crm_quote_designs designs
     where designs.line_item_id = v_line_id
       and designs.id <> v_design_id;

    insert into public.crm_quote_designs (
      id,
      line_item_id,
      label,
      sort_order,
      product_id,
      program_id,
      fabric,
      surcharges,
      motorization,
      unit_price,
      price_breakdown,
      price_status,
      priced_at,
      notes,
      details,
      wholesale_unit_price
    ) values (
      v_design_id,
      v_line_id,
      v_customer_line ->> 'selectedVariant',
      0,
      v_customer_line #>> '{price,productId}',
      v_customer_line #>> '{price,programId}',
      v_customer_line #>> '{price,programName}',
      v_customer_line #> '{price,surchargeLines}',
      '[]'::jsonb,
      (v_customer_line #>> '{price,unitPrice}')::numeric,
      v_customer_line -> 'price',
      'ok',
      v_sent_at,
      null,
      jsonb_build_object(
        'source', 'authoritative_v2_customer_send',
        'catalogVersion', v_selected_catalog_versions
      ),
      null
    )
    on conflict (id) do update
       set line_item_id = excluded.line_item_id,
           label = excluded.label,
           sort_order = excluded.sort_order,
           product_id = excluded.product_id,
           program_id = excluded.program_id,
           fabric = excluded.fabric,
           surcharges = excluded.surcharges,
           motorization = excluded.motorization,
           unit_price = excluded.unit_price,
           price_breakdown = excluded.price_breakdown,
           price_status = excluded.price_status,
           priced_at = excluded.priced_at,
           notes = null,
           details = excluded.details,
           wholesale_unit_price = null,
           updated_at = v_sent_at;

    update public.crm_quote_line_items
       set selected_design_id = v_design_id,
           updated_at = v_sent_at
     where id = v_line_id
       and quote_id = v_crm_quote_id;

    v_mirrored_line_ids := array_append(v_mirrored_line_ids, v_line_id);
  end loop;

  delete from public.crm_quote_line_items lines
   where lines.quote_id = v_crm_quote_id
     and not (lines.id = any(v_mirrored_line_ids));

  insert into public.sales_quote_v2_customer_send_snapshots (
    id,
    quote_id,
    priced_quote_revision,
    sent_quote_revision,
    catalog_version,
    retail_total,
    customer_payload,
    crm_job_id,
    crm_quote_id,
    sent_via,
    created_by,
    idempotency_key,
    created_at
  ) values (
    v_send_snapshot_id,
    p_quote_id,
    p_expected_revision,
    v_new_revision,
    v_selected_catalog_versions,
    v_retail_total,
    v_safe_payload,
    v_crm_job_id,
    v_crm_quote_id,
    p_sent_via,
    p_actor_id,
    btrim(p_idempotency_key),
    v_sent_at
  );

  update public.sales_quotes quotes
     set status = 'sent',
         quote_v2_status = 'sent',
         quote_v2_revision = v_new_revision,
         sent_at = v_sent_at,
         sent_via = p_sent_via,
         updated_at = v_sent_at
   where quotes.id = p_quote_id
     and quotes.status = 'draft'
     and quotes.quote_v2_status = 'priced'
     and quotes.quote_v2_revision = p_expected_revision
     and quotes.quote_v2_catalog_version = v_selected_catalog_versions;

  if not found then
    raise exception 'The Quote V2 lifecycle changed during customer-send persistence.'
      using errcode = '40001';
  end if;

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
    'customer_send_persisted',
    p_expected_revision,
    v_new_revision,
    p_actor_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'customerSendSnapshotId', v_send_snapshot_id,
      'crmQuoteId', v_crm_quote_id,
      'catalogVersion', v_selected_catalog_versions,
      'quoteTotal', v_retail_total,
      'lineCount', v_total_lines,
      'sentVia', p_sent_via
    )
  );

  return query
  select
    v_send_snapshot_id,
    p_quote_id,
    v_crm_quote_id,
    p_expected_revision,
    v_new_revision,
    v_selected_catalog_versions,
    v_retail_total,
    v_sent_at,
    p_sent_via,
    v_safe_payload;
end;
$$;

revoke all on function public.persist_quote_v2_customer_send(
  uuid, bigint, text, text, uuid, text, jsonb
) from public, anon, authenticated;

grant execute on function public.persist_quote_v2_customer_send(
  uuid, bigint, text, text, uuid, text, jsonb
) to service_role;

comment on table public.sales_quote_v2_customer_send_snapshots is
  'Append-only customer-safe Quote V2 send mirrors. Protected dealer cost and margin data are prohibited.';

comment on function public.persist_quote_v2_customer_send(
  uuid, bigint, text, text, uuid, text, jsonb
) is
  'Atomically revalidates selected immutable retail snapshots, writes an allow-listed customer mirror, and advances Quote V2 to sent. It performs no external delivery.';
