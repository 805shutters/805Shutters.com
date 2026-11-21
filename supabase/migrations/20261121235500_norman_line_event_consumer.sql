-- Norman line-event consumer.
-- Additive only: new role, table, columns, and functions. No drops, deletes, or truncates.
-- Not applied to production by the pull request that adds this file.
-- Does not read or write crm_live_lookup_switch. Norman stays as it is.
-- Onyx, Sundance, and Lotus stay off and their events stay queued.
-- Does not place a manufacturer order. Does not send email, SMS, or any other outbound message.
-- Does not create, store, or print a secret.
--
-- public.wake_line_event_worker stays disabled. It returns wake_disabled until an
-- operator, outside this migration, sets every one of these database settings:
--   line_event.wake_http = on
--   line_event.worker_url = https://www.805shutters.com/api/crm/norman-line-event-worker
--   line_event.worker_secret = the server env NORMAN_LINE_EVENT_WORKER_SECRET
-- The route also stays closed until NORMAN_LINE_EVENT_WAKE_ENABLED=true and
-- NORMAN_LINE_EVENT_WORKER_SECRET is set. A missing URL or secret fails closed:
-- no HTTP call. Only a norman event is posted, one event per call.

alter table line_event.quote_lines
  add column if not exists automatic_retries integer not null default 0;

do $retry$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'line_event_quote_lines_automatic_retries_nonnegative'
  ) then
    alter table line_event.quote_lines
      add constraint line_event_quote_lines_automatic_retries_nonnegative
      check (automatic_retries >= 0);
  end if;
end
$retry$;

comment on column line_event.quote_lines.automatic_retries is
  'How many times a needs-input correction has requeued this line. The consumer allows one.';

create table if not exists line_event.needs_input (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references line_event.quote_lines (line_id),
  event_id uuid not null references line_event.events (id),
  idempotency_key text not null,
  field_key text not null,
  reason text not null,
  assignee text not null,
  kind text not null,
  status text not null default 'open',
  attempt integer not null,
  created_at timestamptz not null default now(),
  corrected_at timestamptz,
  corrected_by text,
  constraint line_event_needs_input_field check (field_key ~ '^[a-z0-9_]{1,80}$'),
  constraint line_event_needs_input_kind check (kind in ('order_entry', 'lookup')),
  constraint line_event_needs_input_assignee check (
    (kind = 'order_entry' and assignee = 'quoter')
    or (kind = 'lookup' and assignee = 'jessica')
  ),
  constraint line_event_needs_input_status check (status in ('open', 'corrected')),
  constraint line_event_needs_input_attempt check (attempt >= 1),
  constraint line_event_needs_input_corrected check (
    (status = 'open' and corrected_at is null and corrected_by is null)
    or (status = 'corrected' and corrected_at is not null and corrected_by in ('quoter', 'jessica'))
  ),
  constraint line_event_needs_input_event_field unique (idempotency_key, field_key)
);

comment on table line_event.needs_input is
  'In-CRM Norman needs-input. Addressed to the quoter or Jessica. No email, SMS, or other outbound message.';

create index if not exists line_event_needs_input_line_idx
  on line_event.needs_input (line_id, created_at);

alter table line_event.needs_input enable row level security;

revoke all on line_event.needs_input from public;

create or replace function line_event.quote_lines_retry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'line queue rows cannot be deleted';
  end if;
  if tg_op = 'INSERT' then
    if new.automatic_retries <> 0 then
      raise exception 'automatic retries start at zero';
    end if;
    return new;
  end if;
  if new.automatic_retries is distinct from old.automatic_retries then
    if current_setting('line_event.via_function', true) is distinct from 'on' then
      raise exception 'line state changes only through line event functions';
    end if;
    if new.automatic_retries <> old.automatic_retries + 1 then
      raise exception 'automatic retries increase by one';
    end if;
  end if;
  return new;
end
$fn$;

create trigger line_event_quote_lines_retry_guard
before insert or update or delete on line_event.quote_lines
for each row execute function line_event.quote_lines_retry_guard();

create or replace function line_event.needs_input_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'needs input rows cannot be deleted';
  end if;
  if current_setting('line_event.via_function', true) is distinct from 'on' then
    raise exception 'needs input changes only through line event functions';
  end if;
  if tg_op = 'UPDATE'
    and (new.id, new.line_id, new.event_id, new.idempotency_key, new.field_key, new.reason, new.assignee, new.kind, new.attempt, new.created_at)
      is distinct from
      (old.id, old.line_id, old.event_id, old.idempotency_key, old.field_key, old.reason, old.assignee, old.kind, old.attempt, old.created_at) then
    raise exception 'only correction fields can change on a needs input row';
  end if;
  return new;
end
$fn$;

create trigger line_event_needs_input_guard
before insert or update or delete on line_event.needs_input
for each row execute function line_event.needs_input_guard();

create or replace function line_event.norman_failure_target(p_message text)
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
  if v_message ilike '%spec_changed%' or v_message ilike '%spec_hash%' then
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

create or replace function line_event.norman_payload_error(p_payload jsonb, p_line_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_quote uuid;
  v_revision bigint;
  v_receipt jsonb;
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
     or lower(btrim(coalesce(v_receipt->>'vendor', ''))) is distinct from 'norman' then
    return 'lookup:account';
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
  if nullif(btrim(coalesce(v_receipt->>'captured_by', '')), '') is null then
    return 'lookup:captured_by';
  end if;
  if nullif(btrim(coalesce(v_receipt->>'source_url', '')), '') is null
     and nullif(btrim(coalesce(v_receipt->>'evidence', '')), '') is null then
    return 'lookup:source_url';
  end if;
  return null;
end
$fn$;

create or replace function line_event.record_norman_failure(
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
  from line_event.norman_failure_target(p_message) as target;
  v_assignee := case when v_kind = 'lookup' then 'jessica' else 'quoter' end;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event from line_event.events where id = p_event_id for update;
  if not found then
    raise exception 'line event % not found', p_event_id;
  end if;
  if v_event.manufacturer <> 'norman' or v_event.line_id is distinct from p_line_id then
    return jsonb_build_object('blocked', false, 'reason', 'not_norman', 'state', null);
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

create or replace function line_event.consume_norman_line_event(
  p_idempotency_key text,
  p_claimed_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor text := coalesce(nullif(btrim(coalesce(p_claimed_by, '')), ''), 'manufacturer_bot_norman');
  v_event line_event.events%rowtype;
  v_line line_event.quote_lines%rowtype;
  v_error text;
  v_message text;
  v_quote uuid;
  v_revision bigint;
  v_variant text;
  v_actor_name text;
  v_receipt jsonb;
  v_recorded jsonb;
  v_record uuid;
  v_priced jsonb;
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
  if v_event.manufacturer <> 'norman' then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'not_norman',
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
    v_error := line_event.norman_payload_error(v_event.payload, v_event.line_id);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    v_quote := (v_event.payload->>'quote_id')::uuid;
    v_revision := (v_event.payload->>'expected_revision')::bigint;
    v_variant := btrim(v_event.payload->>'variant');
    v_actor_name := lower(btrim(v_event.payload->>'actor'));
    v_receipt := v_event.payload->'receipt';
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
      'price', v_priced
    );
  exception when others then
    v_message := sqlerrm;
  end;
  return line_event.record_norman_failure(v_event.line_id, v_event.id, v_message);
end
$fn$;

create or replace function line_event.correct_norman_line_input(
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
  v_enqueued := line_event.enqueue_line_event(v_line.line_id, v_line.version + 1, 'norman', p_payload);
  return v_enqueued || jsonb_build_object(
    'duplicate', false,
    'enqueued', true,
    'automatic_retries', 1,
    'reason', 'retry'
  );
end
$fn$;

-- Disabled unless line_event.wake_http is exactly on and both the URL and the
-- secret settings are present. The secret is never written by this migration.
create or replace function public.wake_line_event_worker(p_manufacturer text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_enabled text := current_setting('line_event.wake_http', true);
  v_url text := nullif(btrim(coalesce(current_setting('line_event.worker_url', true), '')), '');
  v_secret text := nullif(btrim(coalesce(current_setting('line_event.worker_secret', true), '')), '');
  v_key text;
  v_body jsonb;
  v_headers jsonb;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if v_enabled is distinct from 'on' or v_manufacturer <> 'norman' then
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
    'manufacturer', 'norman',
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
  'Posts one Norman line event to the worker route when line_event.wake_http, line_event.worker_url, and line_event.worker_secret are set. Otherwise returns wake_disabled or wake_unconfigured and does not call out. enqueue_line_event is the only caller.';

create or replace function public.consume_norman_line_event(
  p_idempotency_key text,
  p_claimed_by text default 'manufacturer_bot_norman'
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.consume_norman_line_event(p_idempotency_key, p_claimed_by);
$fn$;

create or replace function public.correct_norman_line_input(
  p_needs_input_id uuid,
  p_payload jsonb,
  p_corrected_by text
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.correct_norman_line_input(p_needs_input_id, p_payload, p_corrected_by);
$fn$;

comment on function public.consume_norman_line_event(text, text) is
  'Claims one Norman line event by idempotency key line_id:version, prices it through the live-lookup receipt path, and appends a price record. A duplicate or a stale version is a no-op. A priced line is never blocked.';

comment on function public.correct_norman_line_input(uuid, jsonb, text) is
  'Records an in-CRM correction and requeues the line once. A second correction does not requeue. No outbound message.';

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'manufacturer_bot_norman') then
    create role manufacturer_bot_norman nologin;
  end if;
end
$role$;

comment on role manufacturer_bot_norman is
  'Norman line-event consumer. NOLOGIN. Execute on consume_norman_line_event and correct_norman_line_input only.';

revoke all on function line_event.quote_lines_retry_guard() from public;
revoke all on function line_event.needs_input_guard() from public;
revoke all on function line_event.norman_failure_target(text) from public;
revoke all on function line_event.norman_payload_error(jsonb, uuid) from public;
revoke all on function line_event.record_norman_failure(uuid, uuid, text) from public;
revoke all on function line_event.consume_norman_line_event(text, text) from public;
revoke all on function line_event.correct_norman_line_input(uuid, jsonb, text) from public;
revoke all on function public.consume_norman_line_event(text, text) from public;
revoke all on function public.correct_norman_line_input(uuid, jsonb, text) from public;

grant execute on function line_event.norman_failure_target(text) to current_user;
grant execute on function line_event.norman_payload_error(jsonb, uuid) to current_user;
grant execute on function line_event.record_norman_failure(uuid, uuid, text) to current_user;
grant execute on function line_event.consume_norman_line_event(text, text) to current_user;
grant execute on function line_event.correct_norman_line_input(uuid, jsonb, text) to current_user;
grant execute on function public.consume_norman_line_event(text, text) to current_user;
grant execute on function public.correct_norman_line_input(uuid, jsonb, text) to current_user;

grant execute on function public.consume_norman_line_event(text, text) to service_role, manufacturer_bot_norman;
grant execute on function public.correct_norman_line_input(uuid, jsonb, text) to service_role, manufacturer_bot_norman;

do $revoke$
declare
  target text;
  fn text;
begin
  foreach target in array array['anon', 'authenticated', 'manufacturer_bot'] loop
    if exists (select 1 from pg_roles where rolname = target) then
      foreach fn in array array[
        'public.consume_norman_line_event(text, text)',
        'public.correct_norman_line_input(uuid, jsonb, text)'
      ] loop
        execute format('revoke all on function %s from %I', fn, target);
      end loop;
    end if;
  end loop;
end
$revoke$;

notify pgrst, 'reload schema';
