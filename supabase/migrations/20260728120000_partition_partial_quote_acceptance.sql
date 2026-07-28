-- Partial public acceptance must be one atomic persistence operation. Fully
-- unselected rows are moved intact; a partially selected quantity is split by
-- copying its stored design/snapshot rows verbatim (never repriced). This keeps
-- manufacturer data, price_breakdown provenance and wholesale snapshots exact.
--
-- Existing signed rows are never changed implicitly. A historical repair must
-- supply both the exact prior signed_at and the exact signed-contract total; the
-- function also verifies the stored signed_selection before it will proceed.

create or replace function public.partition_crm_partial_quote_acceptance(
  p_quote_id uuid,
  p_share_token text,
  p_selected_line_ids text[],
  p_line_quantities jsonb,
  p_signed_at timestamptz,
  p_signature text,
  p_printed_name text,
  p_current_money jsonb,
  p_future_money jsonb,
  p_expected_existing_signed_at timestamptz default null,
  p_expected_contract_total numeric default null
)
returns table (
  already_signed boolean,
  future_quote_id uuid,
  future_job_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.crm_quotes%rowtype;
  v_job public.crm_jobs%rowtype;
  v_future_quote_id uuid;
  v_future_job_id uuid;
  v_total_count integer;
  v_plan_count integer;
  v_distinct_plan_count integer;
  v_selected_quantity integer;
  v_remaining_quantity integer;
  v_contract_total numeric;
  v_stored_selection jsonb;
  v_is_backfill boolean := p_expected_existing_signed_at is not null;
  v_plan jsonb;
  v_line_id uuid;
  v_new_line_id uuid;
  v_selected_design_label text;
begin
  select * into v_quote
  from public.crm_quotes
  where id = p_quote_id and share_token = p_share_token
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Quote was not found for partial acceptance.';
  end if;

  if v_quote.signed_at is not null and not v_is_backfill then
    return query
      select true,
        nullif(v_quote.meta #>> '{partial_acceptance,future_quote_id}', '')::uuid,
        nullif(v_quote.meta #>> '{partial_acceptance,future_job_id}', '')::uuid;
    return;
  end if;

  if v_is_backfill then
    if v_quote.signed_at is distinct from p_expected_existing_signed_at then
      raise exception using errcode = '40001', message = 'Historical signed_at changed; backfill aborted.';
    end if;
    select total_amount into v_contract_total
    from public.crm_customer_contracts
    where external_source = 'crm_quote'
      and external_id = 'contract:' || p_quote_id::text
      and signed_at is not null
    limit 1;
    if v_contract_total is null or round(v_contract_total, 2) <> round(p_expected_contract_total, 2) then
      raise exception using errcode = '22000', message = 'Signed contract total does not match the explicit backfill guard.';
    end if;
    v_stored_selection := v_quote.meta #> '{signed_selection,lineItemIds}';
    if v_stored_selection is null
       or (select array_agg(stored.value order by stored.value)
           from jsonb_array_elements_text(v_stored_selection) as stored(value))
          is distinct from
          (select array_agg(selected.value::text order by selected.value::text)
           from unnest(p_selected_line_ids) as selected(value)) then
      raise exception using errcode = '22000', message = 'Stored signed selection does not match the explicit backfill selection.';
    end if;
  elsif v_quote.signed_at is not null then
    raise exception using errcode = '23505', message = 'Quote is already signed.';
  end if;

  select count(*) into v_total_count
  from public.crm_quote_line_items
  where quote_id = p_quote_id;

  select
    count(*),
    count(distinct plan.value->>'lineItemId'),
    coalesce(sum((plan.value->>'selectedQuantity')::integer), 0),
    coalesce(sum((plan.value->>'remainingQuantity')::integer), 0)
  into v_plan_count, v_distinct_plan_count, v_selected_quantity, v_remaining_quantity
  from jsonb_array_elements(p_line_quantities) as plan(value)
  join public.crm_quote_line_items line
    on line.id = (plan.value->>'lineItemId')::uuid
   and line.quote_id = p_quote_id
  where (plan.value->>'selectedQuantity')::integer >= 0
    and (plan.value->>'remainingQuantity')::integer >= 0
    and (plan.value->>'selectedQuantity')::integer
        + (plan.value->>'remainingQuantity')::integer = line.quantity;

  if v_total_count < 1
     or v_plan_count <> v_total_count
     or v_distinct_plan_count <> v_total_count
     or v_selected_quantity < 1
     or v_remaining_quantity < 1
     or cardinality(p_selected_line_ids) <> v_selected_quantity then
    raise exception using errcode = '22023', message = 'Partial acceptance selection is invalid or stale.';
  end if;

  select * into v_job from public.crm_jobs where id = v_quote.job_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Linked CRM job was not found.';
  end if;

  insert into public.crm_jobs (
    source, lead_id, status, priority, customer_name, phone, email, address, city,
    product_interest, sales_owner, next_action, next_action_due, estimated_total,
    deposit_paid, notes, meta
  ) values (
    'partial_acceptance_future', v_job.lead_id, 'quoted', v_job.priority,
    v_job.customer_name, v_job.phone, v_job.email, v_job.address, v_job.city,
    v_job.product_interest, v_job.sales_owner, 'Follow up on remaining contract items',
    null, (p_future_money->>'total')::numeric, 0, v_job.notes,
    coalesce(v_job.meta, '{}'::jsonb) || jsonb_build_object(
      'partial_acceptance', jsonb_build_object(
        'role', 'future',
        'source_job_id', v_job.id,
        'source_quote_id', v_quote.id,
        'created_at', p_signed_at
      )
    )
  )
  returning id into v_future_job_id;

  insert into public.crm_quotes (
    job_id, quote_number, status, quote_total, materials_cost, labor_cost,
    discount, tax, deposit_required, balance_due, sold_by, sent_at, approved_at,
    manufacturer_name, manufacturer_order_ref, manufacturer_order_url,
    manufacturer_document_url, customer_email, customer_phone, customer_address,
    quote_group_id, quote_label, notes, meta
  ) values (
    v_future_job_id,
    case when v_quote.quote_number is null then null else v_quote.quote_number || '-FUTURE' end,
    'draft',
    (p_future_money->>'total')::numeric,
    (p_future_money->>'materialsCost')::numeric,
    (p_future_money->>'laborCost')::numeric,
    (p_future_money->>'discount')::numeric,
    (p_future_money->>'tax')::numeric,
    (p_future_money->>'depositDue')::numeric,
    (p_future_money->>'balanceDue')::numeric,
    v_quote.sold_by, null, null,
    v_quote.manufacturer_name, v_quote.manufacturer_order_ref,
    v_quote.manufacturer_order_url, v_quote.manufacturer_document_url,
    v_quote.customer_email, v_quote.customer_phone, v_quote.customer_address,
    null, null, v_quote.notes,
    (coalesce(v_quote.meta, '{}'::jsonb) - 'signed_selection' - 'contract_snapshot')
      || jsonb_build_object(
        'legacy_source_total_adjustment', (p_future_money->>'sourceTotalAdjustment')::numeric,
        'legacy_source_total', (p_future_money->>'total')::numeric,
        'partial_acceptance', jsonb_build_object(
          'role', 'future',
          'source_signed_quote_id', v_quote.id,
          'source_job_id', v_job.id,
          'created_at', p_signed_at
        )
      )
  )
  returning id into v_future_quote_id;

  for v_plan in select value from jsonb_array_elements(p_line_quantities)
  loop
    v_line_id := (v_plan->>'lineItemId')::uuid;
    if (v_plan->>'selectedQuantity')::integer = 0 then
      update public.crm_quote_line_items
      set quote_id = v_future_quote_id
      where id = v_line_id and quote_id = p_quote_id;
    elsif (v_plan->>'remainingQuantity')::integer > 0 then
      select design.label into v_selected_design_label
      from public.crm_quote_line_items line
      left join public.crm_quote_designs design on design.id = line.selected_design_id
      where line.id = v_line_id and line.quote_id = p_quote_id;

      insert into public.crm_quote_line_items (
        quote_id, room, width_in, height_in, quantity, sort_order,
        selected_design_id, notes, discount_percent
      )
      select
        v_future_quote_id, room, width_in, height_in,
        (v_plan->>'remainingQuantity')::integer, sort_order,
        null, notes, discount_percent
      from public.crm_quote_line_items
      where id = v_line_id and quote_id = p_quote_id
      returning id into v_new_line_id;

      insert into public.crm_quote_designs (
        line_item_id, label, sort_order, product_id, program_id, fabric, details,
        surcharges, motorization, unit_price, wholesale_unit_price,
        price_breakdown, price_status, priced_at, notes
      )
      select
        v_new_line_id, label, sort_order, product_id, program_id, fabric, details,
        surcharges, motorization, unit_price, wholesale_unit_price,
        price_breakdown, price_status, priced_at, notes
      from public.crm_quote_designs
      where line_item_id = v_line_id;

      if v_selected_design_label is not null then
        update public.crm_quote_line_items
        set selected_design_id = (
          select id from public.crm_quote_designs
          where line_item_id = v_new_line_id and label = v_selected_design_label
          limit 1
        )
        where id = v_new_line_id;
      end if;

      update public.crm_quote_line_items
      set quantity = (v_plan->>'selectedQuantity')::integer
      where id = v_line_id and quote_id = p_quote_id;
    end if;
  end loop;

  update public.crm_quotes
  set status = 'sold',
      signed_at = coalesce(v_quote.signed_at, p_signed_at),
      sold_at = coalesce(v_quote.sold_at, p_signed_at),
      customer_signature = coalesce(v_quote.customer_signature, p_signature),
      customer_printed_name = coalesce(v_quote.customer_printed_name, p_printed_name),
      quote_total = (p_current_money->>'total')::numeric,
      materials_cost = (p_current_money->>'materialsCost')::numeric,
      labor_cost = (p_current_money->>'laborCost')::numeric,
      discount = (p_current_money->>'discount')::numeric,
      tax = (p_current_money->>'tax')::numeric,
      deposit_required = (p_current_money->>'depositDue')::numeric,
      balance_due = (p_current_money->>'balanceDue')::numeric,
      meta = coalesce(v_quote.meta, '{}'::jsonb)
        || jsonb_build_object(
          'legacy_source_total_adjustment', (p_current_money->>'sourceTotalAdjustment')::numeric,
          'legacy_source_total', (p_current_money->>'total')::numeric,
          'signed_selection', jsonb_build_object(
            'lineItemIds', to_jsonb(p_selected_line_ids),
            'subtotal', (p_current_money->>'subtotal')::numeric,
            'total', (p_current_money->>'total')::numeric
          ),
          'partial_acceptance', jsonb_build_object(
            'role', 'current',
            'future_quote_id', v_future_quote_id,
            'future_job_id', v_future_job_id,
            'partitioned_at', now(),
            'historical_backfill', v_is_backfill,
            'pre_partition', case when v_is_backfill then jsonb_build_object(
              'quote_total', v_quote.quote_total,
              'deposit_required', v_quote.deposit_required,
              'balance_due', v_quote.balance_due,
              'materials_cost', v_quote.materials_cost,
              'labor_cost', v_quote.labor_cost,
              'signed_at', v_quote.signed_at
            ) else null end
          )
        )
  where id = p_quote_id;

  update public.crm_jobs
  set status = 'sold',
      estimated_total = (p_current_money->>'total')::numeric,
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
        'partial_acceptance', jsonb_build_object(
          'current_quote_id', p_quote_id,
          'future_quote_id', v_future_quote_id,
          'future_job_id', v_future_job_id,
          'partitioned_at', now()
        )
      )
  where id = v_job.id;

  return query select false, v_future_quote_id, v_future_job_id;
end;
$$;

revoke all on function public.partition_crm_partial_quote_acceptance(
  uuid, text, text[], jsonb, timestamptz, text, text, jsonb, jsonb, timestamptz, numeric
) from public, anon, authenticated;
grant execute on function public.partition_crm_partial_quote_acceptance(
  uuid, text, text[], jsonb, timestamptz, text, text, jsonb, jsonb, timestamptz, numeric
) to service_role;
