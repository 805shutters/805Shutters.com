-- One customer reminder per completed Square payment, with exact quote/job
-- identity, durable provider state, and an application-level SMS opt-out ledger.
create table if not exists public.crm_customer_sms_preferences (
  phone_e164 text primary key,
  do_not_contact boolean not null default false,
  opted_out_at timestamptz,
  opt_out_source text,
  updated_at timestamptz not null default now(),
  constraint crm_customer_sms_preferences_phone_check
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create table if not exists public.crm_customer_email_preferences (
  email_normalized text primary key,
  do_not_contact boolean not null default false,
  opted_out_at timestamptz,
  opt_out_source text,
  updated_at timestamptz not null default now(),
  constraint crm_customer_email_preferences_email_check
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized like '%@%')
);

alter table public.crm_quotes
  add column if not exists sent_via text;
alter table public.crm_quotes
  drop constraint if exists crm_quotes_sent_via_check;
alter table public.crm_quotes
  add constraint crm_quotes_sent_via_check
  check (sent_via is null or sent_via in ('email','sms','both'));

create table if not exists public.crm_square_contract_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  job_id uuid references public.crm_jobs(id) on delete set null,
  square_payment_id text not null,
  event_key text not null,
  channel text,
  recipient text,
  message_body text,
  status text not null,
  reason text,
  scheduled_for timestamptz,
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  provider_message_sid text,
  provider_message_id text,
  provider_status text,
  provider_error_code text,
  last_error text,
  constraint crm_square_contract_reminders_status_check
    check (status in ('scheduled','sending','accepted','delivered','undelivered','failed','unknown','skipped','review_needed')),
  constraint crm_square_contract_reminders_attempt_count_check check (attempt_count >= 0),
  constraint crm_square_contract_reminders_channel_check
    check (channel is null or channel in ('sms','email')),
  constraint crm_square_contract_reminders_payment_unique unique (square_payment_id, event_key)
);

create unique index if not exists crm_square_contract_reminders_provider_sid_idx
on public.crm_square_contract_reminders (provider_message_sid)
where provider_message_sid is not null;

create index if not exists crm_square_contract_reminders_quote_idx
on public.crm_square_contract_reminders (quote_id, created_at desc);

create index if not exists crm_square_contract_reminders_due_idx
on public.crm_square_contract_reminders (scheduled_for, created_at)
where status = 'scheduled';

alter table public.crm_customer_sms_preferences enable row level security;
alter table public.crm_customer_email_preferences enable row level security;
alter table public.crm_square_contract_reminders enable row level security;
revoke all on table public.crm_customer_sms_preferences from public, anon, authenticated;
revoke all on table public.crm_customer_email_preferences from public, anon, authenticated;
revoke all on table public.crm_square_contract_reminders from public, anon, authenticated;
grant select, insert, update on table public.crm_customer_sms_preferences to service_role;
grant select, insert, update on table public.crm_customer_email_preferences to service_role;
grant select, insert, update on table public.crm_square_contract_reminders to service_role;

create or replace function public.schedule_crm_square_contract_reminder(
  p_quote_id uuid,
  p_job_id uuid,
  p_square_payment_id text,
  p_event_key text,
  p_scheduled_for timestamptz
)
returns setof public.crm_square_contract_reminders
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  insert into public.crm_square_contract_reminders (
    quote_id, job_id, square_payment_id, event_key, status, scheduled_for
  )
  values (
    p_quote_id, p_job_id, p_square_payment_id, p_event_key, 'scheduled', p_scheduled_for
  )
  on conflict (square_payment_id, event_key) do update
  set updated_at = public.crm_square_contract_reminders.updated_at
  returning public.crm_square_contract_reminders.*;
end;
$$;

create or replace function public.claim_due_crm_square_contract_reminders(
  p_limit integer default 50
)
returns setof public.crm_square_contract_reminders
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select reminder.id
    from public.crm_square_contract_reminders as reminder
    where reminder.status = 'scheduled'
      and reminder.scheduled_for <= now()
    order by reminder.scheduled_for, reminder.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  update public.crm_square_contract_reminders as reminder
  set
    status = 'sending',
    attempt_count = reminder.attempt_count + 1,
    last_attempted_at = now(),
    updated_at = now()
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

create or replace function public.record_crm_square_contract_reminder_skip(
  p_quote_id uuid,
  p_job_id uuid,
  p_square_payment_id text,
  p_event_key text,
  p_reason text,
  p_status text default 'skipped'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.crm_square_contract_reminders (
    quote_id, job_id, square_payment_id, event_key, status, reason
  )
  values (
    p_quote_id, p_job_id, p_square_payment_id, p_event_key,
    case when p_status = 'review_needed' then 'review_needed' else 'skipped' end,
    p_reason
  )
  on conflict (square_payment_id, event_key) do nothing;
$$;

create or replace function public.record_crm_square_contract_reminder_provider_status(
  p_message_sid text,
  p_provider_status text,
  p_error_code text default null
)
returns setof public.crm_square_contract_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_status text := lower(trim(coalesce(p_provider_status, '')));
begin
  if coalesce(trim(p_message_sid), '') = '' or normalized_status = '' then return; end if;
  return query
  update public.crm_square_contract_reminders as reminder
  set
    status = case
      when reminder.status in ('delivered','undelivered') then reminder.status
      when normalized_status = 'delivered' then 'delivered'
      when normalized_status in ('failed','undelivered','canceled') then 'undelivered'
      when normalized_status in ('accepted','scheduled','queued','sending','sent') then 'accepted'
      else reminder.status
    end,
    provider_status = case
      when reminder.status in ('delivered','undelivered') then reminder.provider_status
      else normalized_status
    end,
    provider_error_code = case
      when reminder.status in ('delivered','undelivered') then reminder.provider_error_code
      when normalized_status in ('failed','undelivered','canceled') then nullif(trim(coalesce(p_error_code,'')), '')
      else null
    end,
    last_error = case
      when reminder.status in ('delivered','undelivered') then reminder.last_error
      when normalized_status in ('failed','undelivered','canceled')
        then concat('Twilio delivery status: ', normalized_status)
      else null
    end,
    delivered_at = case when normalized_status = 'delivered' then coalesce(reminder.delivered_at, now()) else reminder.delivered_at end,
    updated_at = now()
  where reminder.provider_message_sid = p_message_sid
  returning reminder.*;
end;
$$;

revoke all on function public.record_crm_square_contract_reminder_skip(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.record_crm_square_contract_reminder_provider_status(text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_crm_square_contract_reminder_skip(uuid,uuid,text,text,text,text)
  to service_role;
grant execute on function public.record_crm_square_contract_reminder_provider_status(text,text,text)
  to service_role;
revoke all on function public.schedule_crm_square_contract_reminder(uuid,uuid,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_due_crm_square_contract_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.schedule_crm_square_contract_reminder(uuid,uuid,text,text,timestamptz)
  to service_role;
grant execute on function public.claim_due_crm_square_contract_reminders(integer)
  to service_role;

-- A payment may be recorded before signature, but it must not move an unsigned
-- quote to paid or close its job. Replace the active reconciliation function
-- with the same contract plus the signed-at gate.
create or replace function public.reconcile_square_quote_payment(
  p_quote_id uuid, p_job_id uuid, p_square_payment_id text, p_square_order_id text,
  p_payment_intent text, p_amount numeric, p_expected_amount numeric, p_paid_at date,
  p_square_event_id text default null, p_receipt_url text default null,
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
  v_paid_before numeric(12,2);
  v_paid_total numeric(12,2);
  v_effective_intent text;
  v_marked_paid boolean := false;
begin
  if p_quote_id is null or p_job_id is null then raise exception 'Exact CRM quote and job identities are required.'; end if;
  if nullif(btrim(p_square_payment_id), '') is null then raise exception 'Exact Square payment identity is required.'; end if;
  if p_payment_intent not in ('deposit','balance') then raise exception 'Square payment intent must be deposit or balance.'; end if;
  if p_amount <= 0 or p_expected_amount <= 0 or p_amount <> p_expected_amount then
    raise exception 'Square payment amount does not exactly match the verified payment.';
  end if;

  select * into v_quote from public.crm_quotes where id = p_quote_id for update;
  if not found then raise exception 'CRM quote was not found.'; end if;
  if v_quote.job_id is distinct from p_job_id then raise exception 'Square payment job identity does not match the CRM quote.'; end if;

  select id into v_payment_id
  from public.crm_quote_bookkeeping_payments
  where (external_source = 'square' and external_id = p_square_payment_id)
     or meta ->> 'square_payment_id' = p_square_payment_id
  limit 1;
  select coalesce(sum(amount),0) into v_paid_before
  from public.crm_quote_bookkeeping_payments where quote_id = p_quote_id;
  v_effective_intent := case when v_paid_before > 0 then 'balance' else p_payment_intent end;
  if v_payment_id is not null then
    return jsonb_build_object(
      'status','duplicate','paymentId',v_payment_id,'quoteId',p_quote_id,
      'jobId',p_job_id,'paymentIntent',v_effective_intent,'markedPaid',v_quote.status = 'paid'
    );
  end if;

  select id into v_entry_id from public.crm_quote_bookkeeping_entries where quote_id = p_quote_id limit 1;
  insert into public.crm_quote_bookkeeping_payments (
    quote_id,job_id,bookkeeping_entry_id,payment_label,payment_type,amount,paid_at,
    source,external_source,external_id,meta
  ) values (
    p_quote_id,p_job_id,v_entry_id,
    case when v_effective_intent = 'deposit' then 'Deposit' else 'Balance payment' end,
    'credit_card',round(p_amount,2),p_paid_at,'crm_quote','square',p_square_payment_id,
    jsonb_strip_nulls(jsonb_build_object(
      'square_payment_id',p_square_payment_id,'square_order_id',p_square_order_id,
      'square_event_id',p_square_event_id,'square_payment_type',v_effective_intent,
      'square_original_payment_type',p_payment_intent,'square_receipt_url',p_receipt_url,
      'reconciled_by','square-api-reconciliation','reconciled_at',now()
    ) || coalesce(p_audit,'{}'::jsonb))
  ) returning id into v_payment_id;

  select coalesce(sum(amount),0) into v_paid_total
  from public.crm_quote_bookkeeping_payments where quote_id = p_quote_id;
  if v_quote.signed_at is not null
     and coalesce(v_quote.quote_total,0) > 0
     and v_paid_total >= round(v_quote.quote_total,2) then
    if v_quote.status not in ('paid','archived','lost') then
      update public.crm_quotes set status = 'paid' where id = p_quote_id;
    end if;
    update public.crm_jobs
    set status = 'closed', next_action = null, next_action_due = null,
        meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object(
          'closed_by','square-api-reconciliation','closed_at',now(),
          'square_payment_id',p_square_payment_id
        )
    where id = p_job_id and status not in ('closed','lost');
    v_marked_paid := true;
  else
    v_marked_paid := v_quote.status = 'paid';
  end if;

  insert into public.crm_activity_events (
    actor_email,entity_type,entity_id,action,after_data,metadata
  ) values (
    'square-api-reconciliation','bookkeeping_payment',v_payment_id,'square_payment.reconciled',
    jsonb_build_object(
      'quoteId',p_quote_id,'jobId',p_job_id,'paymentIntent',v_effective_intent,
      'amount',round(p_amount,2),'paidAt',p_paid_at,'markedPaid',v_marked_paid,
      'contractSigned',v_quote.signed_at is not null
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'squarePaymentId',p_square_payment_id,'squareOrderId',p_square_order_id,
      'squareEventId',p_square_event_id,'receiptUrl',p_receipt_url
    ) || coalesce(p_audit,'{}'::jsonb))
  );
  return jsonb_build_object(
    'status','recorded','paymentId',v_payment_id,'quoteId',p_quote_id,
    'jobId',p_job_id,'paymentIntent',v_effective_intent,'markedPaid',v_marked_paid
  );
end;
$$;

revoke all on function public.reconcile_square_quote_payment(
  uuid,uuid,text,text,text,numeric,numeric,date,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.reconcile_square_quote_payment(
  uuid,uuid,text,text,text,numeric,numeric,date,text,text,jsonb
) to service_role;
