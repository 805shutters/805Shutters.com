-- Lotus order worker (S8c). Stacked on the Norman line-event consumer.
-- Additive only: one column, one role, and new functions. No drops, deletes, or truncates.
-- Not applied to production by the pull request that adds this file.
-- Does not seed crm_vendor_accounts. Lotus has no account number here, so a
-- confirmation cost fails closed with no_vendor_account and is not priced.
-- Does not read or write crm_live_lookup_switch. Lotus stays off.
-- Does not send the Lotus order form, an email, an SMS, or any other message.
-- Does not create, store, or print a secret.
-- Does not write installer_notes or __internal805. Does not set role service_role.
--
-- Lotus Roller and Vertical are ordered by an emailed form. There is no portal
-- draft, so portal_draft_id is left null. The order or confirmation number is
-- manufacturer_order_ref. The confirmation's own reference is the new
-- confirmation_ref column: confirmation_url is a URL, confirmation_notes is
-- free text, and portal_draft_id would claim a portal draft that does not exist.
--
-- The wake stays disabled. Each manufacturer has its own gate. This function
-- keeps the Norman, Onyx, and Sundance branches and adds Lotus:
--   norman:    line_event.wake_http, worker_url, worker_secret
--              route env NORMAN_LINE_EVENT_WAKE_ENABLED
--   onyx:      line_event.onyx_wake_http, onyx_worker_url, onyx_worker_secret
--              route env ONYX_LINE_EVENT_WAKE_ENABLED
--   sundance:  line_event.sundance_wake_http, sundance_worker_url, sundance_worker_secret
--              route env SUNDANCE_LINE_EVENT_WAKE_ENABLED
--   lotus:     line_event.lotus_wake_http, lotus_worker_url, lotus_worker_secret
--              route env LOTUS_LINE_EVENT_WAKE_ENABLED
-- A Lotus event is posted only when an operator, outside this migration, sets
-- line_event.lotus_wake_http=on, the Lotus worker URL, and the Lotus secret.
-- The route also stays closed until LOTUS_LINE_EVENT_WAKE_ENABLED=true and
-- LOTUS_LINE_EVENT_WORKER_SECRET is set. A missing URL or secret fails closed.
-- Turning one gate on does not wake the other three.

alter table public.crm_vendor_order_drafts
  add column if not exists confirmation_ref text;

comment on column public.crm_vendor_order_drafts.confirmation_ref is
  'Reference on the manufacturer confirmation. For Lotus this is the emailed confirmation reference, not a portal draft id. portal_draft_id stays null.';

create or replace function line_event.lotus_dealer_net_basis(p_basis text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select lower(regexp_replace(btrim(coalesce(p_basis, '')), '[[:space:]]+', ' ', 'g'))
    in ('dealer net', 'dealer_net', 'dealer net base price', 'dealer_net_base_price');
$fn$;

comment on function line_event.lotus_dealer_net_basis(text) is
  'True only when a Lotus confirmation cost is labeled dealer net. Any other label stays price_basis_unconfirmed.';

create or replace function line_event.lotus_product_key(p_product text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case lower(regexp_replace(btrim(coalesce(p_product, '')), '[[:space:]]+', ' ', 'g'))
    when 'lotus_roller_shades' then 'lotus_roller_shades'
    when 'lotus roller' then 'lotus_roller_shades'
    when 'lotus roller shades' then 'lotus_roller_shades'
    when 'roller shades' then 'lotus_roller_shades'
    when 'lotus_vertical_blinds' then 'lotus_vertical_blinds'
    when 'lotus vertical' then 'lotus_vertical_blinds'
    when 'lotus vertical blinds' then 'lotus_vertical_blinds'
    when 'vertical blinds' then 'lotus_vertical_blinds'
    else null
  end;
$fn$;

comment on function line_event.lotus_product_key(text) is
  'Lotus Roller and Vertical only. Any other product is not an emailed-form order for this worker.';

-- Norman, Onyx, and Sundance branches below are the previous function plus one
-- Lotus-only basis check after the existing no_vendor_account lookup.
create or replace function public.record_vendor_price_receipt(
  p_quote_id uuid, p_expected_revision bigint, p_receipt jsonb, p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $live$
declare
  q public.sales_quotes%rowtype;
  account public.crm_vendor_accounts%rowtype;
  line_ref uuid;
  net_unit numeric;
  observed timestamptz;
  record_id uuid;
  source_url text;
  evidence text;
  captured_by text;
  expected_hash text;
  vendor_name text;
  portal_draft text;
begin
  if p_actor is null or p_actor not in ('mike', 'jessica') then
    raise exception 'receipt actor must be mike or jessica';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
     or p_receipt->>'schema' is distinct from '805-price-record/v1' then
    raise exception 'schema must be 805-price-record/v1';
  end if;
  vendor_name := p_receipt->>'vendor';
  if vendor_name is null or vendor_name not in ('norman', 'onyx', 'sundance', 'lotus') then
    raise exception 'vendor is not a live-lookup manufacturer';
  end if;
  if nullif(btrim(p_receipt->>'captured_at'), '') is null then
    raise exception 'captured_at is missing';
  end if;
  begin
    observed := (p_receipt->>'captured_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'captured_at is missing';
  end;
  if observed is null then raise exception 'captured_at is missing'; end if;
  source_url := nullif(btrim(p_receipt->>'source_url'), '');
  evidence := nullif(btrim(p_receipt->>'evidence'), '');
  if source_url is null and evidence is null then
    raise exception 'source_url or evidence is required';
  end if;
  if source_url is not null and source_url !~ '^https://' then
    raise exception 'source_url must be an https URL';
  end if;
  captured_by := btrim(p_receipt->>'captured_by');
  if captured_by is null or captured_by !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    raise exception 'captured_by bot is required';
  end if;
  if vendor_name in ('onyx', 'sundance') and captured_by is distinct from vendor_name then
    raise exception 'captured_by must be the manufacturer bot';
  end if;
  if vendor_name = 'onyx' and source_url is not null
     and source_url !~ '^https://admin[.]onyxshutters[.]com($|[/?])' then
    raise exception 'source_url is not the manufacturer portal';
  end if;
  if vendor_name = 'sundance' and source_url is not null
     and source_url !~ '^https://sundance[.]blindata[.]app($|[/?])' then
    raise exception 'source_url is not the manufacturer portal';
  end if;
  if p_receipt->>'currency' is distinct from 'USD' then
    raise exception 'currency must be USD';
  end if;
  if nullif(p_receipt->>'line_id', '') is null then
    raise exception 'line_id is missing';
  end if;
  begin
    line_ref := (p_receipt->>'line_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'line_id is unknown';
  end;
  begin
    net_unit := (p_receipt->>'dealer_net_base_price')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dealer net base price must be a positive number';
  end;
  if net_unit is null or net_unit <= 0 or net_unit <> round(net_unit, 2)
     or net_unit::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'dealer net base price must be a positive number';
  end if;
  select * into q from public.sales_quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found.'; end if;
  if q.quote_v2_backend and p_expected_revision is distinct from q.quote_v2_revision then
    raise exception 'stale_revision';
  end if;
  if not exists (
    select 1 from public.sales_quote_line_items where id = line_ref and quote_id = q.id
  ) then
    raise exception 'line_id is unknown';
  end if;
  select * into account
  from public.crm_vendor_accounts
  where vendor = vendor_name
    and account_number = p_receipt->>'account'
    and active;
  if not found then
    if not exists (
      select 1 from public.crm_vendor_accounts where vendor = vendor_name and active
    ) then
      raise exception 'no_vendor_account';
    end if;
    raise exception 'vendor account is not an 805 account';
  end if;
  expected_hash := public.price_record_line_spec_hash(line_ref);
  if p_receipt->>'spec_hash' is distinct from expected_hash then
    raise exception 'spec_hash does not match the line';
  end if;
  if vendor_name = 'lotus' then
    if not line_event.lotus_dealer_net_basis(p_receipt->>'price_basis') then
      raise exception 'price_basis_unconfirmed';
    end if;
    if nullif(btrim(coalesce(p_receipt->>'observed_label', '')), '') is not null
       and not line_event.lotus_dealer_net_basis(p_receipt->>'observed_label') then
      raise exception 'price_basis_unconfirmed';
    end if;
  end if;
  portal_draft := public.price_record_portal_draft_id(p_receipt);
  insert into public.crm_vendor_price_receipts (
    quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, vendor_account_id,
    observed_at, net_unit_price, net_line_total, currency, portal_draft_id, portal_url, evidence,
    source_bot_id, screenshot_path, captured_by, receipt, actor
  ) values (
    q.id, line_ref, coalesce(q.quote_v2_revision, 0), expected_hash,
    account.vendor, account.account_number, account.id,
    observed, net_unit, net_unit, 'USD', portal_draft, source_url, evidence,
    case
      when captured_by ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then captured_by::uuid
      else null
    end,
    evidence, captured_by, p_receipt, p_actor
  ) returning id into record_id;
  return jsonb_build_object(
    'records', jsonb_build_array(jsonb_build_object(
      'line_id', line_ref,
      'record_id', record_id,
      'vendor_account_id', account.id,
      'portal_draft_id', portal_draft
    )),
    'blocked_lines', '[]'::jsonb
  );
end $live$;

comment on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) is
  'Appends one 805-price-record/v1 receipt. Keeps portal_draft_id from price_record_portal_draft_id. Norman, Onyx, and Sundance checks are unchanged. Lotus raises no_vendor_account when no active account exists, and price_basis_unconfirmed unless the confirmation cost is dealer net. No account row is inserted.';

create or replace function line_event.lotus_failure_target(p_message text)
returns table (field_key text, kind text, reason text)
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_message text := btrim(coalesce(p_message, ''));
  v_prefix text := split_part(v_message, ':', 1);
  v_field text := split_part(v_message, ':', 2);
begin
  if v_prefix in ('order_entry', 'lookup') and v_field ~ '^[a-z0-9_]{1,80}$' and split_part(v_message, ':', 3) = '' then
    field_key := v_field;
    kind := v_prefix;
    reason := v_field;
    return next;
    return;
  end if;
  if v_message ilike '%price_basis_unconfirmed%' then
    field_key := 'price_basis';
    kind := 'lookup';
  elsif v_message ilike '%no_vendor_account%' then
    field_key := 'account';
    kind := 'lookup';
  elsif v_message ilike '%spec_changed%' or v_message ilike '%spec_hash%' then
    field_key := 'spec_hash';
    kind := 'order_entry';
  elsif v_message ilike '%no_margin%' or v_message ilike '%live_margin%' then
    field_key := 'live_margin';
    kind := 'lookup';
  elsif v_message ilike '%no_site_price%' or v_message ilike '%dealer net%' or v_message ilike '%net price%' then
    field_key := 'dealer_net_base_price';
    kind := 'lookup';
  elsif v_message ilike '%switch_off%' then
    field_key := 'live_lookup_switch';
    kind := 'lookup';
  elsif v_message ilike '%stale_revision%' then
    field_key := 'expected_revision';
    kind := 'order_entry';
  elsif v_message ilike '%captured_at%' then
    field_key := 'captured_at';
    kind := 'lookup';
  elsif v_message ilike '%captured_by%' then
    field_key := 'captured_by';
    kind := 'lookup';
  elsif v_message ilike '%805 account%' or v_message ilike '%vendor account%' then
    field_key := 'account';
    kind := 'lookup';
  elsif v_message ilike '%currency%' then
    field_key := 'currency';
    kind := 'lookup';
  elsif v_message ilike '%source_url%' or v_message ilike '%evidence%' then
    field_key := 'source_url';
    kind := 'lookup';
  elsif v_message ilike '%quote not found%' then
    field_key := 'quote_id';
    kind := 'order_entry';
  elsif v_message ilike '%crm_jobs%' or v_message ilike '%job_id%' then
    field_key := 'job_id';
    kind := 'order_entry';
  elsif v_message ilike '%crm_quotes%' or v_message ilike '%foreign key%' then
    field_key := 'crm_quote_id';
    kind := 'order_entry';
  elsif v_message ilike '%product_type%' or v_message ilike '%product%' then
    field_key := 'product_type';
    kind := 'order_entry';
  elsif v_message ilike '%confirmation_ref%' then
    field_key := 'confirmation_ref';
    kind := 'order_entry';
  elsif v_message ilike '%order_number%' or v_message ilike '%manufacturer_order_ref%' then
    field_key := 'order_number';
    kind := 'order_entry';
  elsif v_message ilike '%size fraction%' or v_message ilike '%width%' then
    field_key := 'width';
    kind := 'order_entry';
  elsif v_message ilike '%schema%' then
    field_key := 'schema';
    kind := 'order_entry';
  elsif v_message ilike '%line_id%' or v_message ilike '%line item%' or v_message ilike '%line_ref%' then
    field_key := 'line_id';
    kind := 'order_entry';
  else
    field_key := 'line_id';
    kind := 'order_entry';
  end if;
  reason := case when char_length(v_message) = 0 then field_key else left(v_message, 500) end;
  return next;
end
$fn$;

create or replace function line_event.lotus_payload_error(p_payload jsonb, p_line_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_quote uuid;
  v_crm_quote uuid;
  v_job uuid;
  v_revision bigint;
  v_receipt jsonb;
  v_order text;
  v_confirmation text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'order_entry:payload';
  end if;
  if nullif(btrim(coalesce(p_payload->>'quote_id', '')), '') is null then
    return 'order_entry:quote_id';
  end if;
  begin
    v_quote := (p_payload->>'quote_id')::uuid;
  exception when invalid_text_representation then
    return 'order_entry:quote_id';
  end;
  if v_quote is null then
    return 'order_entry:quote_id';
  end if;
  if nullif(btrim(coalesce(p_payload->>'crm_quote_id', '')), '') is null then
    return 'order_entry:crm_quote_id';
  end if;
  begin
    v_crm_quote := (p_payload->>'crm_quote_id')::uuid;
  exception when invalid_text_representation then
    return 'order_entry:crm_quote_id';
  end;
  if v_crm_quote is null then
    return 'order_entry:crm_quote_id';
  end if;
  if nullif(btrim(coalesce(p_payload->>'job_id', '')), '') is null then
    return 'order_entry:job_id';
  end if;
  begin
    v_job := (p_payload->>'job_id')::uuid;
  exception when invalid_text_representation then
    return 'order_entry:job_id';
  end;
  if v_job is null then
    return 'order_entry:job_id';
  end if;
  if line_event.lotus_product_key(p_payload->>'product_type') is null then
    return 'order_entry:product_type';
  end if;
  if nullif(btrim(coalesce(p_payload->>'variant', '')), '') is null then
    return 'order_entry:variant';
  end if;
  if nullif(btrim(coalesce(p_payload->>'expected_revision', '')), '') is null then
    return 'order_entry:expected_revision';
  end if;
  begin
    v_revision := (p_payload->>'expected_revision')::bigint;
  exception when others then
    return 'order_entry:expected_revision';
  end;
  if v_revision is null or v_revision < 0 then
    return 'order_entry:expected_revision';
  end if;
  if lower(btrim(coalesce(p_payload->>'actor', ''))) not in ('mike', 'jessica') then
    return 'lookup:actor';
  end if;
  v_order := btrim(coalesce(p_payload->>'order_number', ''));
  if v_order = '' or char_length(v_order) > 80 then
    return 'order_entry:order_number';
  end if;
  v_confirmation := btrim(coalesce(p_payload->>'confirmation_ref', ''));
  if v_confirmation = '' or char_length(v_confirmation) > 120 then
    return 'order_entry:confirmation_ref';
  end if;
  v_receipt := p_payload->'receipt';
  if v_receipt is null or jsonb_typeof(v_receipt) <> 'object' then
    return 'order_entry:receipt';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'line_id', '')), '') is null
     or lower(btrim(v_receipt->>'line_id')) is distinct from lower(p_line_id::text) then
    return 'order_entry:line_id';
  end if;
  if v_receipt->>'schema' is distinct from '805-price-record/v1' then
    return 'order_entry:schema';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'spec_hash', '')), '') is null then
    return 'order_entry:spec_hash';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'account', '')), '') is null
     or lower(btrim(coalesce(v_receipt->>'vendor', ''))) is distinct from 'lotus' then
    return 'lookup:account';
  end if;
  if not line_event.lotus_dealer_net_basis(v_receipt->>'price_basis') then
    return 'lookup:price_basis';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'observed_label', '')), '') is not null
     and not line_event.lotus_dealer_net_basis(v_receipt->>'observed_label') then
    return 'lookup:price_basis';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'dealer_net_base_price', '')), '') is null then
    return 'lookup:dealer_net_base_price';
  end if;
  if v_receipt->>'currency' is distinct from 'USD' then
    return 'lookup:currency';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'captured_at', '')), '') is null then
    return 'lookup:captured_at';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'captured_by', '')), '') is null
     or lower(btrim(v_receipt->>'captured_by')) is distinct from 'lotus' then
    return 'lookup:captured_by';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'source_url', '')), '') is null
     and nullif(btrim(coalesce(v_receipt->>'evidence', '')), '') is null then
    return 'lookup:source_url';
  end if;
  return null;
end
$fn$;

create or replace function line_event.record_lotus_failure(
  p_line_id uuid,
  p_event_id uuid,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_line line_event.quote_lines%rowtype;
  v_event line_event.events%rowtype;
  v_field text;
  v_kind text;
  v_reason text;
  v_assignee text;
  v_item uuid;
  v_attempt integer;
  v_blocked boolean := false;
begin
  select target.field_key, target.kind, target.reason
    into v_field, v_kind, v_reason
  from line_event.lotus_failure_target(p_message) as target;
  v_assignee := case when v_kind = 'lookup' then 'jessica' else 'quoter' end;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event from line_event.events where id = p_event_id for update;
  if not found then
    raise exception 'line event % not found', p_event_id;
  end if;
  if v_event.manufacturer <> 'lotus' or v_event.line_id is distinct from p_line_id then
    return jsonb_build_object('blocked', false, 'reason', 'not_lotus', 'state', null);
  end if;
  select * into v_line from line_event.quote_lines where line_id = p_line_id for update;
  select coalesce(max(attempt), 0) + 1 into v_attempt
  from line_event.needs_input
  where line_id = p_line_id;
  insert into line_event.needs_input (
    line_id, event_id, idempotency_key, field_key, reason, assignee, kind, attempt
  ) values (
    p_line_id, p_event_id, v_event.idempotency_key, v_field, v_reason, v_assignee, v_kind, v_attempt
  )
  on conflict (idempotency_key, field_key) do nothing
  returning id into v_item;
  if v_item is null then
    select id into v_item
    from line_event.needs_input
    where idempotency_key = v_event.idempotency_key and field_key = v_field;
  end if;
  if v_line.state in ('priced', 'built') then
    return jsonb_build_object(
      'outcome', 'needs_input',
      'blocked', false,
      'state', v_line.state,
      'field_key', v_field,
      'assignee', v_assignee,
      'kind', v_kind,
      'needs_input_id', v_item,
      'automatic_retries', v_line.automatic_retries,
      'idempotency_key', v_event.idempotency_key
    );
  end if;
  if v_line.state in ('entering', 'entered') then
    perform line_event.apply_transition(p_line_id, 'blocked', 'needs input: ' || v_field);
    if v_event.completed_at is null then
      update line_event.events
      set completed_at = now()
      where id = v_event.id;
    end if;
    v_blocked := true;
  end if;
  select * into v_line from line_event.quote_lines where line_id = p_line_id;
  return jsonb_build_object(
    'outcome', 'needs_input',
    'blocked', v_blocked,
    'state', v_line.state,
    'field_key', v_field,
    'assignee', v_assignee,
    'kind', v_kind,
    'needs_input_id', v_item,
    'automatic_retries', v_line.automatic_retries,
    'idempotency_key', v_event.idempotency_key
  );
end
$fn$;

create or replace function line_event.consume_lotus_line_event(
  p_idempotency_key text,
  p_claimed_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor text := coalesce(nullif(btrim(coalesce(p_claimed_by, '')), ''), 'manufacturer_bot_lotus');
  v_event line_event.events%rowtype;
  v_line line_event.quote_lines%rowtype;
  v_error text;
  v_message text;
  v_quote uuid;
  v_crm_quote uuid;
  v_job uuid;
  v_revision bigint;
  v_variant text;
  v_actor_name text;
  v_product text;
  v_order_number text;
  v_confirmation_ref text;
  v_receipt jsonb;
  v_recorded jsonb;
  v_record uuid;
  v_priced jsonb;
  v_draft uuid;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-fA-F-]{36}:[1-9][0-9]*$' then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'bad_key', 'blocked', false);
  end if;
  if char_length(v_actor) > 200 then
    raise exception 'claimed_by is too long';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event
  from line_event.events
  where idempotency_key = p_idempotency_key
  for update;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'missing', 'blocked', false);
  end if;
  select * into v_line
  from line_event.quote_lines
  where line_id = v_event.line_id
  for update;
  if v_event.manufacturer <> 'lotus' then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'not_lotus',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key,
      'manufacturer', v_event.manufacturer
    );
  end if;
  if v_line.version is distinct from v_event.line_version then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'stale_version',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key,
      'line_version', v_line.version
    );
  end if;
  if v_event.completed_at is not null or v_line.state in ('priced', 'built', 'cancelled') then
    return jsonb_build_object(
      'outcome', 'noop',
      'reason', 'duplicate',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key,
      'duplicate', true
    );
  end if;
  if v_line.state = 'queued' and v_event.claimed_at is null then
    update line_event.events
    set claimed_by = v_actor,
        claimed_at = now()
    where id = v_event.id
    returning * into v_event;
    perform line_event.apply_transition(v_event.line_id, 'entering', null);
  elsif v_line.state is distinct from 'entering' or v_event.claimed_by is distinct from v_actor then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'not_claimable',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key
    );
  end if;
  begin
    v_error := line_event.lotus_payload_error(v_event.payload, v_event.line_id);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    v_quote := (v_event.payload->>'quote_id')::uuid;
    v_crm_quote := (v_event.payload->>'crm_quote_id')::uuid;
    v_job := (v_event.payload->>'job_id')::uuid;
    v_revision := (v_event.payload->>'expected_revision')::bigint;
    v_variant := btrim(v_event.payload->>'variant');
    v_actor_name := lower(btrim(v_event.payload->>'actor'));
    v_product := line_event.lotus_product_key(v_event.payload->>'product_type');
    v_order_number := btrim(v_event.payload->>'order_number');
    v_confirmation_ref := btrim(v_event.payload->>'confirmation_ref');
    v_receipt := v_event.payload->'receipt';
    select id into v_draft
    from public.crm_vendor_order_drafts
    where crm_quote_id = v_crm_quote
      and lower(manufacturer) = 'lotus'
      and source_id = v_event.line_id::text
    for update;
    if v_draft is null then
      insert into public.crm_vendor_order_drafts (
        crm_quote_id, crm_job_id, manufacturer, product_type, status,
        adapter_version, source_hash, payload, portal_draft_id,
        source_kind, source_id, source_revision, external_task_id,
        line_count, routing_keys, product_names,
        manufacturer_order_ref, confirmation_ref, confirmed_at, message
      ) values (
        v_crm_quote, v_job, 'Lotus', v_product, 'order_confirmed',
        'lotus-confirmation/v1', v_receipt->>'spec_hash', v_event.payload, null,
        'submitted_technical_measure', v_event.line_id::text, v_event.line_id::text, v_event.line_id::text,
        1, jsonb_build_array('lotus:' || v_product), jsonb_build_array(v_product),
        v_order_number, v_confirmation_ref, now(),
        'Lotus order confirmation recorded. The worker did not send the order form.'
      );
    else
      update public.crm_vendor_order_drafts
      set manufacturer_order_ref = v_order_number,
          confirmation_ref = v_confirmation_ref,
          status = 'order_confirmed',
          confirmed_at = coalesce(confirmed_at, now()),
          product_type = v_product,
          source_hash = v_receipt->>'spec_hash',
          payload = v_event.payload,
          routing_keys = jsonb_build_array('lotus:' || v_product),
          product_names = jsonb_build_array(v_product),
          message = 'Lotus order confirmation recorded. The worker did not send the order form.',
          updated_at = now()
      where id = v_draft;
    end if;
    select id into v_record
    from public.crm_vendor_price_receipts
    where quote_id = v_quote
      and line_id = v_event.line_id
      and receipt = v_receipt
    order by created_at desc
    limit 1;
    if v_record is null then
      v_recorded := public.record_vendor_price_receipt(v_quote, v_revision, v_receipt, v_actor_name);
      v_record := (v_recorded->'records'->0->>'record_id')::uuid;
    end if;
    v_priced := public.price_line_from_receipt(
      v_quote, v_event.line_id, v_variant, v_record, v_revision, v_event.id
    );
    perform line_event.apply_transition(v_event.line_id, 'entered', null);
    update line_event.events
    set completed_at = now()
    where id = v_event.id and completed_at is null;
    perform line_event.apply_transition(v_event.line_id, 'priced', null);
    return jsonb_build_object(
      'outcome', 'priced',
      'blocked', false,
      'state', 'priced',
      'duplicate', false,
      'idempotency_key', v_event.idempotency_key,
      'event_id', v_event.id,
      'line_id', v_event.line_id,
      'record_id', v_record,
      'order_number', v_order_number,
      'confirmation_ref', v_confirmation_ref,
      'price', v_priced
    );
  exception when others then
    v_message := sqlerrm;
  end;
  return line_event.record_lotus_failure(v_event.line_id, v_event.id, v_message);
end
$fn$;

create or replace function line_event.correct_lotus_line_input(
  p_needs_input_id uuid,
  p_payload jsonb,
  p_corrected_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item line_event.needs_input%rowtype;
  v_line line_event.quote_lines%rowtype;
  v_by text := lower(btrim(coalesce(p_corrected_by, '')));
  v_enqueued jsonb;
begin
  if p_needs_input_id is null then
    raise exception 'needs_input_id is required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a json object';
  end if;
  if v_by not in ('quoter', 'jessica') then
    raise exception 'corrected_by must be quoter or jessica';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_item from line_event.needs_input where id = p_needs_input_id for update;
  if not found then
    raise exception 'needs input % not found', p_needs_input_id;
  end if;
  select * into v_line from line_event.quote_lines where line_id = v_item.line_id for update;
  if v_line.manufacturer is distinct from 'lotus' then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'not_lotus'
    );
  end if;
  if v_item.status = 'corrected' then
    return jsonb_build_object(
      'duplicate', true,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'duplicate'
    );
  end if;
  if v_by is distinct from v_item.assignee then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'assignee'
    );
  end if;
  update line_event.needs_input
  set status = 'corrected',
      corrected_at = now(),
      corrected_by = v_by
  where id = v_item.id;
  if v_line.state in ('priced', 'built') then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'priced'
    );
  end if;
  if v_line.automatic_retries >= 1 then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', v_line.state = 'blocked',
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'retry_spent'
    );
  end if;
  if v_line.state is distinct from 'blocked' then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'not_blocked'
    );
  end if;
  update line_event.quote_lines
  set automatic_retries = automatic_retries + 1,
      updated_at = now()
  where line_id = v_line.line_id;
  v_enqueued := line_event.enqueue_line_event(v_line.line_id, v_line.version + 1, 'lotus', p_payload);
  return v_enqueued || jsonb_build_object(
    'duplicate', false,
    'enqueued', true,
    'automatic_retries', 1,
    'reason', 'retry'
  );
end
$fn$;

-- Keeps the Norman, Onyx, and Sundance gates and adds Lotus. Each branch reads
-- only that manufacturer's settings. The secret is never written here.
create or replace function public.wake_line_event_worker(p_manufacturer text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_enabled text;
  v_url text;
  v_secret text;
  v_key text;
  v_body jsonb;
  v_headers jsonb;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if v_manufacturer = 'norman' then
    v_enabled := current_setting('line_event.wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.worker_secret', true), '')), '');
  elsif v_manufacturer = 'onyx' then
    v_enabled := current_setting('line_event.onyx_wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.onyx_worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.onyx_worker_secret', true), '')), '');
  elsif v_manufacturer = 'sundance' then
    v_enabled := current_setting('line_event.sundance_wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.sundance_worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.sundance_worker_secret', true), '')), '');
  elsif v_manufacturer = 'lotus' then
    v_enabled := current_setting('line_event.lotus_wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.lotus_worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.lotus_worker_secret', true), '')), '');
  else
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_disabled',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  if v_enabled is distinct from 'on' then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_disabled',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_unconfigured',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  select idempotency_key into v_key from line_event.events where id = p_event_id;
  if v_key is null then
    raise exception 'line event % not found', p_event_id;
  end if;
  v_body := jsonb_build_object(
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'idempotency_key', v_key
  );
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );
  begin
    execute 'select net.http_post($1, $2, $3::jsonb, $4, $5)'
      using v_url, v_body, '{}'::jsonb, v_headers, 5000;
  exception when others then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_unconfigured',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end;
  return jsonb_build_object(
    'woken', true,
    'reason', 'http',
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'schema', '805-line-event/v1'
  );
end
$fn$;

comment on function public.wake_line_event_worker(text, uuid) is
  'Posts one Norman, Onyx, Sundance, or Lotus line event when that manufacturer''s own wake gate, URL, and secret are set. Otherwise returns wake_disabled or wake_unconfigured and does not call out. enqueue_line_event is the only caller.';

create or replace function public.consume_lotus_line_event(
  p_idempotency_key text,
  p_claimed_by text default 'manufacturer_bot_lotus'
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.consume_lotus_line_event(p_idempotency_key, p_claimed_by);
$fn$;

create or replace function public.correct_lotus_line_input(
  p_needs_input_id uuid,
  p_payload jsonb,
  p_corrected_by text
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.correct_lotus_line_input(p_needs_input_id, p_payload, p_corrected_by);
$fn$;

comment on function public.consume_lotus_line_event(text, text) is
  'Claims one Lotus line event by idempotency key line_id:version and records the confirmation already in hand: manufacturer_order_ref, confirmation_ref, and a price receipt applied through price_line_from_receipt. Does not send the order form or any message. A duplicate or a stale version is a no-op. A priced line is never blocked.';

comment on function public.correct_lotus_line_input(uuid, jsonb, text) is
  'Records an in-CRM correction and requeues the Lotus line once. A second correction does not requeue. No outbound message.';

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'manufacturer_bot_lotus') then
    create role manufacturer_bot_lotus nologin;
  end if;
end
$role$;

comment on role manufacturer_bot_lotus is
  'Lotus order worker. NOLOGIN. Execute on consume_lotus_line_event and correct_lotus_line_input only. No table grants.';

revoke all on function line_event.lotus_dealer_net_basis(text) from public;
revoke all on function line_event.lotus_product_key(text) from public;
revoke all on function line_event.lotus_failure_target(text) from public;
revoke all on function line_event.lotus_payload_error(jsonb, uuid) from public;
revoke all on function line_event.record_lotus_failure(uuid, uuid, text) from public;
revoke all on function line_event.consume_lotus_line_event(text, text) from public;
revoke all on function line_event.correct_lotus_line_input(uuid, jsonb, text) from public;
revoke all on function public.consume_lotus_line_event(text, text) from public;
revoke all on function public.correct_lotus_line_input(uuid, jsonb, text) from public;

grant execute on function line_event.lotus_dealer_net_basis(text) to current_user;
grant execute on function line_event.lotus_product_key(text) to current_user;
grant execute on function line_event.lotus_failure_target(text) to current_user;
grant execute on function line_event.lotus_payload_error(jsonb, uuid) to current_user;
grant execute on function line_event.record_lotus_failure(uuid, uuid, text) to current_user;
grant execute on function line_event.consume_lotus_line_event(text, text) to current_user;
grant execute on function line_event.correct_lotus_line_input(uuid, jsonb, text) to current_user;
grant execute on function public.consume_lotus_line_event(text, text) to current_user;
grant execute on function public.correct_lotus_line_input(uuid, jsonb, text) to current_user;

grant execute on function public.consume_lotus_line_event(text, text) to service_role, manufacturer_bot_lotus;
grant execute on function public.correct_lotus_line_input(uuid, jsonb, text) to service_role, manufacturer_bot_lotus;

do $revoke$
declare
  target text;
  fn text;
begin
  foreach target in array array[
    'anon', 'authenticated', 'manufacturer_bot',
    'manufacturer_bot_norman', 'manufacturer_bot_onyx', 'manufacturer_bot_sundance'
  ] loop
    if exists (select 1 from pg_roles where rolname = target) then
      foreach fn in array array[
        'public.consume_lotus_line_event(text, text)',
        'public.correct_lotus_line_input(uuid, jsonb, text)'
      ] loop
        execute format('revoke all on function %s from %I', fn, target);
      end loop;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'manufacturer_bot_lotus') then
    execute 'revoke all on function public.consume_norman_line_event(text, text) from manufacturer_bot_lotus';
    execute 'revoke all on function public.correct_norman_line_input(uuid, jsonb, text) from manufacturer_bot_lotus';
    execute 'revoke all on function public.wake_line_event_worker(text, uuid) from manufacturer_bot_lotus';
    execute 'revoke all on function public.record_vendor_price_receipt(uuid, bigint, jsonb, text) from manufacturer_bot_lotus';
    execute 'revoke all on function public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid) from manufacturer_bot_lotus';
    if to_regprocedure('public.consume_onyx_line_event(text, text)') is not null then
      execute 'revoke all on function public.consume_onyx_line_event(text, text) from manufacturer_bot_lotus';
      execute 'revoke all on function public.correct_onyx_line_input(uuid, jsonb, text) from manufacturer_bot_lotus';
    end if;
    if to_regprocedure('public.consume_sundance_line_event(text, text)') is not null then
      execute 'revoke all on function public.consume_sundance_line_event(text, text) from manufacturer_bot_lotus';
      execute 'revoke all on function public.correct_sundance_line_input(uuid, jsonb, text) from manufacturer_bot_lotus';
    end if;
  end if;
end
$revoke$;

notify pgrst, 'reload schema';
