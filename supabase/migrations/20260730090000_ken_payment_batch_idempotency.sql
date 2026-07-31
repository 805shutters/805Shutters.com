-- A confirmed Ken batch is both the job-level payable record and the one-time
-- business-buyout ledger application. Prevent a retried confirmation request
-- from inserting the shared source row twice.
create unique index if not exists crm_ken_payments_request_id_unique
on public.crm_ken_payments ((meta->>'paymentRequestId'))
where nullif(meta->>'paymentRequestId', '') is not null;

-- Return both the canonical payment id and whether this call created it.
-- Concurrent retries with the same request id converge on one payment row,
-- one allocation set, and one notification-eligible response.
create or replace function public.crm_create_ken_payment_batch_v2(
  p_paid_on date,
  p_period_month date,
  p_amount numeric,
  p_note text,
  p_created_by_email text,
  p_meta jsonb,
  p_allocations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_request_id text := nullif(p_meta->>'paymentRequestId', '');
  v_allocation jsonb;
  v_existing_allocated numeric;
  v_expected_allocated numeric;
begin
  if v_request_id is null then
    raise exception 'Ken payment request id is required';
  end if;

  -- Serialize all Ken confirmations. A different request id built from the
  -- same stale review must not allocate the same job a second time.
  perform pg_advisory_xact_lock(hashtext('crm_ken_payment_batch_v2'));

  begin
    insert into public.crm_ken_payments (
      paid_on, period_month, amount, note, created_by_email, meta
    ) values (
      p_paid_on, p_period_month, p_amount, p_note, p_created_by_email, coalesce(p_meta, '{}'::jsonb)
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      select id into v_payment_id
      from public.crm_ken_payments
      where meta->>'paymentRequestId' = v_request_id;

      if v_payment_id is null then
        raise;
      end if;

      return jsonb_build_object('payment_id', v_payment_id, 'created', false);
  end;

  for v_allocation in
    select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    select coalesce(sum(amount), 0) into v_existing_allocated
    from public.crm_ken_payment_allocations
    where item_key = v_allocation->>'item_key';

    v_expected_allocated := coalesce(
      nullif(v_allocation->'meta'->>'expectedExplicitPaidAmount', '')::numeric,
      0
    );
    if round(v_existing_allocated, 2) <> round(v_expected_allocated, 2) then
      raise exception 'Ken payable allocation changed during confirmation for item %',
        v_allocation->>'item_key';
    end if;

    insert into public.crm_ken_payment_allocations (
      payment_id, source, quote_id, bookkeeping_entry_id, job_id, item_key,
      customer_name, closed_at, amount, period_month, meta
    ) values (
      v_payment_id,
      v_allocation->>'source',
      nullif(v_allocation->>'quote_id', '')::uuid,
      nullif(v_allocation->>'bookkeeping_entry_id', '')::uuid,
      nullif(v_allocation->>'job_id', '')::uuid,
      v_allocation->>'item_key',
      v_allocation->>'customer_name',
      nullif(v_allocation->>'closed_at', '')::date,
      (v_allocation->>'amount')::numeric,
      nullif(v_allocation->>'period_month', '')::date,
      coalesce(v_allocation->'meta', '{}'::jsonb)
    );
  end loop;

  return jsonb_build_object('payment_id', v_payment_id, 'created', true);
end;
$$;

grant execute on function public.crm_create_ken_payment_batch_v2(date, date, numeric, text, text, jsonb, jsonb)
to service_role;
