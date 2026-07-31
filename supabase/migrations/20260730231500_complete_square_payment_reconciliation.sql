-- Persist every authenticated Square payment receipt and make reconciliation
-- close the exact linked CRM job when collected payments cover the contract.
create table if not exists public.crm_square_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  square_payment_id text not null unique,
  latest_square_event_id text,
  square_order_id text,
  square_customer_id text,
  status text not null default 'processing',
  attempts integer not null default 0,
  amount numeric(12, 2) not null default 0,
  currency text,
  paid_at timestamptz,
  last_attempt_at timestamptz,
  processed_at timestamptz,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  constraint crm_square_payment_receipts_status_check
    check (status in ('processing', 'processed', 'needs_review', 'failed'))
);

alter table public.crm_square_payment_receipts enable row level security;
revoke all on table public.crm_square_payment_receipts from public, anon, authenticated;
grant select, insert, update on table public.crm_square_payment_receipts to service_role;

create or replace function public.set_square_payment_receipt_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'processing' then
    new.attempts := case when tg_op = 'UPDATE' then old.attempts + 1 else 1 end;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_square_payment_receipts_set_audit
  on public.crm_square_payment_receipts;
create trigger crm_square_payment_receipts_set_audit
before insert or update on public.crm_square_payment_receipts
for each row execute function public.set_square_payment_receipt_audit();

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
  v_paid_before numeric(12, 2);
  v_paid_total numeric(12, 2);
  v_effective_intent text;
  v_marked_paid boolean := false;
begin
  if p_quote_id is null or p_job_id is null then
    raise exception 'Exact CRM quote and job identities are required.';
  end if;
  if nullif(btrim(p_square_payment_id), '') is null then
    raise exception 'Exact Square payment identity is required.';
  end if;
  if p_payment_intent not in ('deposit', 'balance') then
    raise exception 'Square payment intent must be deposit or balance.';
  end if;
  if p_amount <= 0 or p_expected_amount <= 0 or p_amount <> p_expected_amount then
    raise exception 'Square payment amount does not exactly match the verified payment.';
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
    raise exception 'Square payment job identity does not match the CRM quote.';
  end if;

  select id
  into v_payment_id
  from public.crm_quote_bookkeeping_payments
  where (external_source = 'square' and external_id = p_square_payment_id)
     or meta ->> 'square_payment_id' = p_square_payment_id
  limit 1;

  select coalesce(sum(amount), 0)
  into v_paid_before
  from public.crm_quote_bookkeeping_payments
  where quote_id = p_quote_id;

  -- A second completed Square charge is the remaining-balance stage even when
  -- a stale/duplicate deposit checkout intent rides on the Square order.
  v_effective_intent := case
    when v_paid_before > 0 then 'balance'
    else p_payment_intent
  end;

  if v_payment_id is not null then
    return jsonb_build_object(
      'status', 'duplicate',
      'paymentId', v_payment_id,
      'quoteId', p_quote_id,
      'jobId', p_job_id,
      'paymentIntent', v_effective_intent,
      'markedPaid', v_quote.status = 'paid'
    );
  end if;

  select id
  into v_entry_id
  from public.crm_quote_bookkeeping_entries
  where quote_id = p_quote_id
  limit 1;

  insert into public.crm_quote_bookkeeping_payments (
    quote_id, job_id, bookkeeping_entry_id, payment_label, payment_type,
    amount, paid_at, source, external_source, external_id, meta
  )
  values (
    p_quote_id, p_job_id, v_entry_id,
    case when v_effective_intent = 'deposit' then 'Deposit' else 'Balance payment' end,
    'credit_card', round(p_amount, 2), p_paid_at, 'crm_quote', 'square',
    p_square_payment_id,
    jsonb_strip_nulls(jsonb_build_object(
      'square_payment_id', p_square_payment_id,
      'square_order_id', p_square_order_id,
      'square_event_id', p_square_event_id,
      'square_payment_type', v_effective_intent,
      'square_original_payment_type', p_payment_intent,
      'square_receipt_url', p_receipt_url,
      'reconciled_by', 'square-api-reconciliation',
      'reconciled_at', now()
    ) || coalesce(p_audit, '{}'::jsonb))
  )
  returning id into v_payment_id;

  select coalesce(sum(amount), 0)
  into v_paid_total
  from public.crm_quote_bookkeeping_payments
  where quote_id = p_quote_id;

  if coalesce(v_quote.quote_total, 0) > 0
     and v_paid_total >= round(v_quote.quote_total, 2) then
    if v_quote.status not in ('paid', 'archived', 'lost') then
      update public.crm_quotes set status = 'paid' where id = p_quote_id;
    end if;
    update public.crm_jobs
    set status = 'closed',
        next_action = null,
        next_action_due = null,
        meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
          'closed_by', 'square-api-reconciliation',
          'closed_at', now(),
          'square_payment_id', p_square_payment_id
        )
    where id = p_job_id
      and status not in ('closed', 'lost');
    v_marked_paid := true;
  else
    v_marked_paid := v_quote.status = 'paid';
  end if;

  insert into public.crm_activity_events (
    actor_email, entity_type, entity_id, action, after_data, metadata
  )
  values (
    'square-api-reconciliation', 'bookkeeping_payment', v_payment_id,
    'square_payment.reconciled',
    jsonb_build_object(
      'quoteId', p_quote_id,
      'jobId', p_job_id,
      'paymentIntent', v_effective_intent,
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
    'paymentIntent', v_effective_intent,
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
