-- Manual Ken payment confirmations remain record-only. This migration adds
-- durable duplicate-reference protection and validates the complete batch
-- before delegating to the existing atomic, stale-allocation-safe v2 RPC.
create unique index if not exists crm_ken_payments_manual_reference_unique
on public.crm_ken_payments ((meta->>'manualPaymentReference'))
where nullif(meta->>'manualPaymentReference', '') is not null;

create or replace function public.crm_create_manual_ken_payment_batch_v3(
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
  v_allocation jsonb;
  v_allocation_total numeric := 0;
  v_method text := nullif(p_meta->>'manualPaymentMethod', '');
begin
  if p_paid_on is null then
    raise exception 'Manual payment date is required';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'Manual payment amount must be greater than zero';
  end if;
  if coalesce(p_meta->>'manualPaymentConfirmed', 'false') <> 'true' then
    raise exception 'Manual payment confirmation is required';
  end if;
  if v_method is null or v_method not in ('check', 'cash', 'ach', 'card', 'other') then
    raise exception 'A valid manual payment method is required';
  end if;
  if nullif(p_meta->>'paymentRequestId', '') is null then
    raise exception 'Manual payment request id is required';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) = 0 then
    raise exception 'At least one exact payable allocation is required';
  end if;

  for v_allocation in
    select * from jsonb_array_elements(p_allocations)
  loop
    if nullif(v_allocation->>'item_key', '') is null then
      raise exception 'Every allocation requires an exact payable item key';
    end if;
    if coalesce(v_allocation->'meta'->>'person', '') <> 'ken' then
      raise exception 'Allocation recipient does not match Ken';
    end if;
    if coalesce((v_allocation->>'amount')::numeric, 0) <= 0 then
      raise exception 'Allocation amounts must be greater than zero';
    end if;
    v_allocation_total := v_allocation_total + (v_allocation->>'amount')::numeric;
  end loop;

  if round(v_allocation_total, 2) <> round(p_amount, 2) then
    raise exception 'Manual payment amount must exactly match its payable allocations';
  end if;

  return public.crm_create_ken_payment_batch_v2(
    p_paid_on,
    p_period_month,
    p_amount,
    p_note,
    p_created_by_email,
    p_meta,
    p_allocations
  );
end;
$$;

revoke all on function public.crm_create_manual_ken_payment_batch_v3(date, date, numeric, text, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.crm_create_manual_ken_payment_batch_v3(date, date, numeric, text, text, jsonb, jsonb)
to service_role;

comment on function public.crm_create_manual_ken_payment_batch_v3(date, date, numeric, text, text, jsonb, jsonb)
is 'Service-role-only record of a user-confirmed manual Ken payment. It never initiates an external transfer and requires exact, current payable allocations.';
