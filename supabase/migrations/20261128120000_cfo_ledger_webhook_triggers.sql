-- Fire-and-forget ledger events for 805 CFO.
-- Additive only: new private schema, functions, and AFTER triggers.
-- No CRM writes, no backfill, no cron, no send-flow changes, no existing trigger edits.
-- No webhook URL or shared secret is stored in this migration.
--
-- Vault names Mike / 805 CFO must create (values stay in Vault):
--   cfo_ledger_webhook_url
--   cfo_ledger_webhook_secret
-- If either row is missing, blank, or Vault is absent, the trigger returns
-- without calling out. A later enqueue error is logged and never rolls back
-- the CRM statement.
--
-- Quote sale set, in crmQuoteStatuses order, from sold through paid.
-- This is the same recorded-sale list crm_sync_customer_payment_progress uses
-- (sold, approved, ordered, received, installed, invoiced, paid).
-- archived, lost, draft, and sent are not sales. closed is a job status, not a
-- crm_quotes status. signed_at null -> non-null is also the one sale transition.
-- A quote that is already a recorded sale does not fire again when it moves
-- among later statuses or gains a signature it did not have.
--
-- Columns read (verified against earlier migrations, never phone/email/address):
--   crm_quotes: id, job_id, quote_number, status, signed_at, quote_total,
--     balance_due, customer_name, customer_printed_name, external_source, meta
--   crm_jobs: id, customer_name
--   crm_quote_bookkeeping_entries: id, job_id, customer_name, total_amount
--   crm_quote_bookkeeping_payments: id, quote_id, job_id, bookkeeping_entry_id,
--     payment_label, payment_type, amount, external_source, meta
--     (meta only for stripe_payment_intent_id, stripe_account_id, stripe_request_id)
--   crm_stripe_allocations: account_id, payment_intent_id, request_id,
--     ledger_payment_id, amount_cents
--   crm_stripe_requests: id, account_id, livemode, quote_id, bookkeeping_entry_id,
--     job_id, session_id, payment_intent_id, created_at
--   crm_stripe_objects: account_id, livemode, kind, id, details->>'charge_id', imported_at

create schema if not exists cfo_ledger;
revoke all on schema cfo_ledger from public;
grant usage on schema cfo_ledger to public;

comment on schema cfo_ledger is
  'Private 805 CFO ledger webhook. Not part of the Data API. Reads Vault at enqueue time and posts with pg_net.';

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- pg_net is not relocatable. Its functions live in schema net.
-- Supabase registers the extension itself in schema extensions:
--   create extension if not exists pg_net with schema extensions;
-- Hosted projects that already have pg_net keep it. Databases without the
-- control file (the PGlite harness) no-op here; delivery then no-ops until
-- net.http_post exists.
do $cfo_ledger_pg_net$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return;
  end if;
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  else
    raise notice 'pg_net is not available in this database. Run create extension if not exists pg_net with schema extensions before ledger delivery can enqueue.';
  end if;
end
$cfo_ledger_pg_net$;

create or replace function cfo_ledger.quote_is_recorded_sale(p_status text, p_signed_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_signed_at is not null
    or p_status in (
      'sold',
      'approved',
      'ordered',
      'received',
      'installed',
      'invoiced',
      'paid'
    );
$fn$;

comment on function cfo_ledger.quote_is_recorded_sale(text, timestamptz) is
  'True when a crm_quotes row is sold, approved, or a later quote status, or signed_at is set. One sale, not a later status move.';

create or replace function cfo_ledger.stripe_object(
  p_payment_intent text,
  p_charge text,
  p_session text,
  p_account text,
  p_request text,
  p_amount_cents bigint
)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select nullif(
    jsonb_strip_nulls(jsonb_build_object(
      'payment_intent_id', nullif(btrim(p_payment_intent), ''),
      'charge_id', nullif(btrim(p_charge), ''),
      'checkout_session_id', nullif(btrim(p_session), ''),
      'account_id', nullif(btrim(p_account), ''),
      'request_id', nullif(btrim(p_request), ''),
      'amount_cents', p_amount_cents
    )),
    '{}'::jsonb
  );
$fn$;

comment on function cfo_ledger.stripe_object(text, text, text, text, text, bigint) is
  'Stripe ids only. Omits the object when every id is blank. Does not read receipt URLs or customer contact fields.';

create or replace function cfo_ledger.sale_context(p_quote uuid, p_entry uuid, p_job uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  v_job uuid := p_job;
  v_name text;
  v_number text;
  v_total numeric;
  v_balance numeric;
begin
  if p_quote is not null then
    select q.job_id,
           nullif(btrim(q.quote_number), ''),
           coalesce(nullif(btrim(q.customer_name), ''), nullif(btrim(q.customer_printed_name), '')),
           q.quote_total,
           q.balance_due
      into v_job, v_number, v_name, v_total, v_balance
    from public.crm_quotes q
    where q.id = p_quote;
    v_job := coalesce(p_job, v_job);
  elsif p_entry is not null then
    select e.job_id,
           nullif(btrim(e.customer_name), ''),
           e.total_amount
      into v_job, v_name, v_total
    from public.crm_quote_bookkeeping_entries e
    where e.id = p_entry;
    v_job := coalesce(p_job, v_job);
  end if;
  if v_name is null and v_job is not null then
    select nullif(btrim(j.customer_name), '')
      into v_name
    from public.crm_jobs j
    where j.id = v_job;
  end if;
  return jsonb_build_object(
    'job_id', v_job,
    'quote_number', v_number,
    'customer_name', v_name,
    'quote_total', v_total,
    'balance_due', v_balance
  );
exception
  when others then
    return jsonb_build_object('job_id', p_job);
end
$fn$;

comment on function cfo_ledger.sale_context(uuid, uuid, uuid) is
  'Quote number, job id, customer name, quote total, and balance for a ledger payload. Name falls back from the quote, to the bookkeeping entry, to the job. Contact columns are not selected.';

create or replace function cfo_ledger.enqueue(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text;
  v_secret text;
  v_sig text;
  v_headers jsonb;
begin
  begin
    select ds.decrypted_secret
      into v_url
    from vault.decrypted_secrets ds
    where ds.name = 'cfo_ledger_webhook_url'
    order by ds.updated_at desc nulls last, ds.created_at desc nulls last, ds.id desc
    limit 1;

    select ds.decrypted_secret
      into v_secret
    from vault.decrypted_secrets ds
    where ds.name = 'cfo_ledger_webhook_secret'
    order by ds.updated_at desc nulls last, ds.created_at desc nulls last, ds.id desc
    limit 1;

    if nullif(btrim(coalesce(v_url, '')), '') is null
       or nullif(btrim(coalesce(v_secret, '')), '') is null then
      return;
    end if;

    begin
      v_sig := encode(
        extensions.hmac(
          convert_to(p_payload::text, 'utf8'),
          convert_to(v_secret, 'utf8'),
          'sha256'
        ),
        'hex'
      );
    exception
      when undefined_function or invalid_schema_name then
        v_sig := encode(
          public.hmac(
            convert_to(p_payload::text, 'utf8'),
            convert_to(v_secret, 'utf8'),
            'sha256'
          ),
          'hex'
        );
    end;

    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ledger-secret', v_secret,
      'x-ledger-signature', v_sig
    );

    -- pg_net queues the request and returns. The HTTP call happens after commit.
    execute 'select net.http_post($1, $2, $3::jsonb, $4, $5)'
      using v_url, p_payload, '{}'::jsonb, v_headers, 5000;
  exception
    when undefined_table or invalid_schema_name then
      return;
    when others then
      raise warning 'cfo_ledger_enqueue_failed sqlstate=%', sqlstate;
  end;
end
$fn$;

comment on function cfo_ledger.enqueue(jsonb) is
  'Enqueue one ledger POST via net.http_post. URL and secret come from vault.decrypted_secrets (cfo_ledger_webhook_url, cfo_ledger_webhook_secret). Missing Vault or a missing value returns. Any other failure logs sqlstate and does not raise.';

create or replace function cfo_ledger.on_quote_sold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name text;
begin
  begin
    if tg_op = 'UPDATE' and cfo_ledger.quote_is_recorded_sale(old.status, old.signed_at) then
      return new;
    end if;
    if not cfo_ledger.quote_is_recorded_sale(new.status, new.signed_at) then
      return new;
    end if;
    v_name := coalesce(
      nullif(btrim(new.customer_name), ''),
      nullif(btrim(new.customer_printed_name), '')
    );
    if v_name is null and new.job_id is not null then
      select nullif(btrim(j.customer_name), '')
        into v_name
      from public.crm_jobs j
      where j.id = new.job_id;
    end if;
    perform cfo_ledger.enqueue(jsonb_build_object(
      'event_type', 'quote_sold',
      'occurred_at', clock_timestamp(),
      'quote_id', new.id,
      'job_id', new.job_id,
      'quote_number', nullif(btrim(new.quote_number), ''),
      'customer_name', v_name,
      'amount', new.quote_total,
      'amount_kind', 'quote_total',
      'quote_total', new.quote_total,
      'balance_due', new.balance_due,
      'payment_row_id', null,
      'external_source', nullif(btrim(new.external_source), ''),
      'label', new.status,
      'payment_type', null,
      'stripe', null
    ));
  exception
    when others then
      raise warning 'cfo_ledger_quote_sold_failed sqlstate=%', sqlstate;
  end;
  return new;
end
$fn$;

comment on function cfo_ledger.on_quote_sold() is
  'AFTER insert or status/signed_at update. One quote_sold event when the row first becomes a recorded sale. Later statuses do not enqueue again.';

create or replace function cfo_ledger.on_payment_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name text;
begin
  begin
    if tg_op <> 'UPDATE' then
      return new;
    end if;
    if new.meta -> 'payment_progress' ->> 'closed' is distinct from 'true' then
      return new;
    end if;
    if old.meta -> 'payment_progress' ->> 'closed' = 'true' then
      return new;
    end if;
    v_name := coalesce(
      nullif(btrim(new.customer_name), ''),
      nullif(btrim(new.customer_printed_name), '')
    );
    if v_name is null and new.job_id is not null then
      select nullif(btrim(j.customer_name), '')
        into v_name
      from public.crm_jobs j
      where j.id = new.job_id;
    end if;
    perform cfo_ledger.enqueue(jsonb_build_object(
      'event_type', 'payment_closed',
      'occurred_at', clock_timestamp(),
      'quote_id', new.id,
      'job_id', new.job_id,
      'quote_number', nullif(btrim(new.quote_number), ''),
      'customer_name', v_name,
      'amount', new.balance_due,
      'amount_kind', 'balance_due',
      'quote_total', new.quote_total,
      'balance_due', new.balance_due,
      'payment_row_id', null,
      'external_source', nullif(btrim(new.external_source), ''),
      'label', 'payment_closed',
      'payment_type', null,
      'stripe', null
    ));
  exception
    when others then
      raise warning 'cfo_ledger_payment_closed_failed sqlstate=%', sqlstate;
  end;
  return new;
end
$fn$;

comment on function cfo_ledger.on_payment_closed() is
  'AFTER meta update. One payment_closed event when meta.payment_progress.closed flips from not true to true. amount is balance_due; quote_total is separate.';

create or replace function cfo_ledger.on_bookkeeping_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_context jsonb;
  v_intent text;
  v_account text;
  v_request text;
  v_charge text;
  v_session text;
  v_stripe jsonb;
begin
  begin
    v_context := cfo_ledger.sale_context(new.quote_id, new.bookkeeping_entry_id, new.job_id);
    v_intent := nullif(btrim(new.meta ->> 'stripe_payment_intent_id'), '');
    v_account := nullif(btrim(new.meta ->> 'stripe_account_id'), '');
    v_request := nullif(btrim(new.meta ->> 'stripe_request_id'), '');
    if v_intent is not null or v_request is not null then
      begin
        select o.details ->> 'charge_id', r.session_id
          into v_charge, v_session
        from public.crm_stripe_requests r
        left join public.crm_stripe_objects o
          on o.account_id = r.account_id
         and o.livemode = r.livemode
         and o.kind = 'payment'
         and o.id = coalesce(r.payment_intent_id, v_intent)
        where (v_request is not null and r.id::text = v_request)
           or (v_intent is not null and r.payment_intent_id = v_intent)
        order by r.created_at desc nulls last
        limit 1;
        if v_charge is null and v_intent is not null then
          select o.details ->> 'charge_id'
            into v_charge
          from public.crm_stripe_objects o
          where o.kind = 'payment'
            and o.id = v_intent
            and (v_account is null or o.account_id = v_account)
          order by o.imported_at desc nulls last
          limit 1;
        end if;
      exception
        when others then
          v_charge := null;
          v_session := null;
      end;
    end if;
    v_stripe := cfo_ledger.stripe_object(v_intent, v_charge, v_session, v_account, v_request, null);
    perform cfo_ledger.enqueue(jsonb_build_object(
      'event_type', 'bookkeeping_payment',
      'occurred_at', clock_timestamp(),
      'quote_id', new.quote_id,
      'job_id', coalesce(new.job_id, (v_context ->> 'job_id')::uuid),
      'quote_number', v_context ->> 'quote_number',
      'customer_name', v_context ->> 'customer_name',
      'amount', new.amount,
      'amount_kind', 'payment_amount',
      'quote_total', v_context -> 'quote_total',
      'balance_due', v_context -> 'balance_due',
      'payment_row_id', new.id,
      'external_source', nullif(btrim(new.external_source), ''),
      'label', new.payment_label,
      'payment_type', new.payment_type,
      'stripe', v_stripe
    ));
  exception
    when others then
      raise warning 'cfo_ledger_bookkeeping_payment_failed sqlstate=%', sqlstate;
  end;
  return new;
end
$fn$;

comment on function cfo_ledger.on_bookkeeping_payment() is
  'AFTER insert on crm_quote_bookkeeping_payments. One bookkeeping_payment event per inserted receipt (check, cash, Zelle, ACH/other, Stripe, and any other allowed tender). amount is the payment amount.';

create or replace function cfo_ledger.on_stripe_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_quote uuid;
  v_entry uuid;
  v_job uuid;
  v_pay_quote uuid;
  v_pay_entry uuid;
  v_pay_job uuid;
  v_session text;
  v_charge text;
  v_label text;
  v_payment_type text;
  v_context jsonb;
begin
  begin
    select r.quote_id, r.bookkeeping_entry_id, r.job_id, r.session_id, o.details ->> 'charge_id'
      into v_quote, v_entry, v_job, v_session, v_charge
    from public.crm_stripe_requests r
    left join public.crm_stripe_objects o
      on o.account_id = r.account_id
     and o.livemode = r.livemode
     and o.kind = 'payment'
     and o.id = new.payment_intent_id
    where r.id = new.request_id
    order by o.imported_at desc nulls last
    limit 1;

    -- A missed request must not clear quote ids already read. Keep payment
    -- fields in their own targets, then fill only the gaps.
    select p.quote_id, p.bookkeeping_entry_id, p.job_id, p.payment_label, p.payment_type
      into v_pay_quote, v_pay_entry, v_pay_job, v_label, v_payment_type
    from public.crm_quote_bookkeeping_payments p
    where p.id = new.ledger_payment_id;

    v_quote := coalesce(v_quote, v_pay_quote);
    v_entry := coalesce(v_entry, v_pay_entry);
    v_job := coalesce(v_job, v_pay_job);
    v_context := cfo_ledger.sale_context(v_quote, v_entry, v_job);
    perform cfo_ledger.enqueue(jsonb_build_object(
      'event_type', 'stripe_allocation',
      'occurred_at', clock_timestamp(),
      'quote_id', v_quote,
      'job_id', coalesce(v_job, nullif(v_context ->> 'job_id', '')::uuid),
      'quote_number', v_context ->> 'quote_number',
      'customer_name', v_context ->> 'customer_name',
      'amount', new.amount_cents::numeric / 100,
      'amount_kind', 'payment_amount',
      'quote_total', v_context -> 'quote_total',
      'balance_due', v_context -> 'balance_due',
      'payment_row_id', new.ledger_payment_id,
      'external_source', 'stripe',
      'label', coalesce(v_label, 'Stripe allocation'),
      'payment_type', v_payment_type,
      'stripe', cfo_ledger.stripe_object(
        new.payment_intent_id,
        v_charge,
        v_session,
        new.account_id,
        new.request_id::text,
        new.amount_cents
      )
    ));
  exception
    when others then
      raise warning 'cfo_ledger_stripe_allocation_failed sqlstate=%', sqlstate;
  end;
  return new;
end
$fn$;

comment on function cfo_ledger.on_stripe_allocation() is
  'AFTER insert on crm_stripe_allocations. One stripe_allocation event. amount is amount_cents / 100. Stripe ids are payment intent, charge, checkout session, account, and request.';

revoke all on function cfo_ledger.quote_is_recorded_sale(text, timestamptz) from public;
revoke all on function cfo_ledger.stripe_object(text, text, text, text, text, bigint) from public;
revoke all on function cfo_ledger.sale_context(uuid, uuid, uuid) from public;
revoke all on function cfo_ledger.enqueue(jsonb) from public;
revoke all on function cfo_ledger.on_quote_sold() from public;
revoke all on function cfo_ledger.on_payment_closed() from public;
revoke all on function cfo_ledger.on_bookkeeping_payment() from public;
revoke all on function cfo_ledger.on_stripe_allocation() from public;

do $revoke$
declare
  target text;
begin
  foreach target in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = target) then
      execute format('revoke all on function cfo_ledger.quote_is_recorded_sale(text, timestamptz) from %I', target);
      execute format('revoke all on function cfo_ledger.stripe_object(text, text, text, text, text, bigint) from %I', target);
      execute format('revoke all on function cfo_ledger.sale_context(uuid, uuid, uuid) from %I', target);
      execute format('revoke all on function cfo_ledger.enqueue(jsonb) from %I', target);
      execute format('revoke all on function cfo_ledger.on_quote_sold() from %I', target);
      execute format('revoke all on function cfo_ledger.on_payment_closed() from %I', target);
      execute format('revoke all on function cfo_ledger.on_bookkeeping_payment() from %I', target);
      execute format('revoke all on function cfo_ledger.on_stripe_allocation() from %I', target);
    end if;
  end loop;
end
$revoke$;

-- Trigger functions must be executable by whoever writes the CRM row.
-- They return trigger and do not reveal the Vault secret. enqueue stays revoked.
grant execute on function cfo_ledger.on_quote_sold() to public;
grant execute on function cfo_ledger.on_payment_closed() to public;
grant execute on function cfo_ledger.on_bookkeeping_payment() to public;
grant execute on function cfo_ledger.on_stripe_allocation() to public;

drop trigger if exists crm_quotes_cfo_ledger_quote_sold on public.crm_quotes;
create trigger crm_quotes_cfo_ledger_quote_sold
  after insert or update of status, signed_at
  on public.crm_quotes
  for each row
  execute function cfo_ledger.on_quote_sold();

drop trigger if exists crm_quotes_cfo_ledger_payment_closed on public.crm_quotes;
create trigger crm_quotes_cfo_ledger_payment_closed
  after update of meta
  on public.crm_quotes
  for each row
  execute function cfo_ledger.on_payment_closed();

drop trigger if exists crm_quote_bookkeeping_payments_cfo_ledger on public.crm_quote_bookkeeping_payments;
create trigger crm_quote_bookkeeping_payments_cfo_ledger
  after insert
  on public.crm_quote_bookkeeping_payments
  for each row
  execute function cfo_ledger.on_bookkeeping_payment();

drop trigger if exists crm_stripe_allocations_cfo_ledger on public.crm_stripe_allocations;
create trigger crm_stripe_allocations_cfo_ledger
  after insert
  on public.crm_stripe_allocations
  for each row
  execute function cfo_ledger.on_stripe_allocation();
