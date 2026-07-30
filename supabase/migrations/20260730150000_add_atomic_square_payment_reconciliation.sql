-- Atomically reconcile a completed Square-hosted payment into the CRM ledger.
-- The webhook supplies identity and amount only after verifying the Square
-- signature and re-reading the durable Square order metadata.
create or replace function public.reconcile_square_quote_payment(
  p_quote_id uuid,
  p_job_id uuid,
  p_square_payment_id text,
  p_square_order_id text,
  p_payment_intent text,
  p_amount numeric,
  p_expected_amount numeric,
  p_paid_at date,
  p_square_event_id text default null,
  p_receipt_url text default null,
  p_audit jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.crm_quotes%rowtype;
  v_payment_id uuid;
  v_entry_id uuid;
  v_paid_total numeric(12, 2);
  v_marked_paid boolean := false;
begin
  if p_quote_id is null or p_job_id is null then
    raise exception 'Exact CRM quote and job identities are required.';
  end if;
  if nullif(btrim(p_square_payment_id), '') is null or nullif(btrim(p_square_order_id), '') is null then
    raise exception 'Exact Square payment and order identities are required.';
  end if;
  if p_payment_intent not in ('deposit', 'balance') then
    raise exception 'Square payment intent must be deposit or balance.';
  end if;
  if p_amount <= 0 or p_expected_amount <= 0 or p_amount <> p_expected_amount then
    raise exception 'Square payment amount does not exactly match the linked order.';
  end if;

  select *
  into v_quote
  from public.crm_quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'CRM quote was not found.';
  end if;
  if v_quote.job_id is distinct from p_job_id then
    raise exception 'Square order job identity does not match the CRM quote.';
  end if;

  select id
  into v_payment_id
  from public.crm_quote_bookkeeping_payments
  where (external_source = 'square' and external_id = p_square_payment_id)
     or meta ->> 'square_payment_id' = p_square_payment_id
  limit 1;

  if v_payment_id is not null then
    return jsonb_build_object(
      'status', 'duplicate',
      'paymentId', v_payment_id,
      'quoteId', p_quote_id,
      'jobId', p_job_id,
      'markedPaid', v_quote.status = 'paid'
    );
  end if;

  select id
  into v_entry_id
  from public.crm_quote_bookkeeping_entries
  where quote_id = p_quote_id
  limit 1;

  insert into public.crm_quote_bookkeeping_payments (
    quote_id,
    job_id,
    bookkeeping_entry_id,
    payment_label,
    payment_type,
    amount,
    paid_at,
    source,
    external_source,
    external_id,
    meta
  )
  values (
    p_quote_id,
    p_job_id,
    v_entry_id,
    case when p_payment_intent = 'deposit' then 'Deposit' else 'Balance payment' end,
    'credit_card',
    round(p_amount, 2),
    p_paid_at,
    'crm_quote',
    'square',
    p_square_payment_id,
    jsonb_strip_nulls(jsonb_build_object(
      'square_payment_id', p_square_payment_id,
      'square_order_id', p_square_order_id,
      'square_event_id', p_square_event_id,
      'square_payment_type', p_payment_intent,
      'square_receipt_url', p_receipt_url,
      'reconciled_by', 'square-webhook',
      'reconciled_at', now()
    ) || coalesce(p_audit, '{}'::jsonb))
  )
  returning id into v_payment_id;

  select coalesce(sum(amount), 0)
  into v_paid_total
  from public.crm_quote_bookkeeping_payments
  where quote_id = p_quote_id;

  if coalesce(v_quote.quote_total, 0) > 0
     and v_paid_total >= round(v_quote.quote_total, 2)
     and v_quote.status not in ('paid', 'archived', 'lost') then
    update public.crm_quotes
    set status = 'paid'
    where id = p_quote_id;
    v_marked_paid := true;
  else
    v_marked_paid := v_quote.status = 'paid';
  end if;

  insert into public.crm_activity_events (
    actor_email,
    entity_type,
    entity_id,
    action,
    after_data,
    metadata
  )
  values (
    'square-webhook',
    'bookkeeping_payment',
    v_payment_id,
    'square_payment.reconciled',
    jsonb_build_object(
      'quoteId', p_quote_id,
      'jobId', p_job_id,
      'paymentIntent', p_payment_intent,
      'amount', round(p_amount, 2),
      'paidAt', p_paid_at,
      'markedPaid', v_marked_paid
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'squarePaymentId', p_square_payment_id,
      'squareOrderId', p_square_order_id,
      'squareEventId', p_square_event_id,
      'receiptUrl', p_receipt_url
    ) || coalesce(p_audit, '{}'::jsonb))
  );

  return jsonb_build_object(
    'status', 'recorded',
    'paymentId', v_payment_id,
    'quoteId', p_quote_id,
    'jobId', p_job_id,
    'markedPaid', v_marked_paid
  );
end;
$$;

revoke all on function public.reconcile_square_quote_payment(
  uuid, uuid, text, text, text, numeric, numeric, date, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.reconcile_square_quote_payment(
  uuid, uuid, text, text, text, numeric, numeric, date, text, text, jsonb
) to service_role;

comment on function public.reconcile_square_quote_payment(
  uuid, uuid, text, text, text, numeric, numeric, date, text, text, jsonb
) is
  'Service-role-only atomic Square reconciliation. Exact payment/order/quote/job/intent/amount identity is required; retries are idempotent by Square payment id.';
