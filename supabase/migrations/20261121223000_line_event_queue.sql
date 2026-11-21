-- 805 manufacturer line-event queue. Schema id 805-line-event/v1.
-- Additive only: new private schema, tables, and functions.
-- Not applied to production by the pull request that adds this file.
-- Does not read or write live-lookup prices or crm_live_lookup_switch.
--
-- States: draft, ready, queued, entering, entered, priced, built, blocked, cancelled.
-- Allowed transitions, from the 2026-11-21 pipeline design:
--   draft -> ready
--   ready -> queued
--   queued -> entering
--   entering -> entered
--   entered -> priced
--   priced -> built
--   entering -> blocked   (mismatch or login; reason required)
--   entered -> blocked    (no price label; reason required)
--   blocked -> queued     (fixed; next line version)
--   queued -> cancelled   (removed; reason required)
--   priced -> queued      (edited; next line version)
-- enqueue from draft applies draft -> ready -> queued in one call.
-- The stored event for that call records ready -> queued.
-- blocked and cancelled require a reason. Cancelled is terminal.

create schema if not exists line_event;

revoke all on schema line_event from public;

comment on schema line_event is
  'Private 805 line-event queue (805-line-event/v1). Not exposed through the Data API. Bots call the public functions only.';

create table if not exists line_event.transitions (
  from_state text not null,
  to_state text not null,
  primary key (from_state, to_state),
  constraint line_event_transition_states_known check (
    from_state in ('draft', 'ready', 'queued', 'entering', 'entered', 'priced', 'built', 'blocked', 'cancelled')
    and to_state in ('draft', 'ready', 'queued', 'entering', 'entered', 'priced', 'built', 'blocked', 'cancelled')
  )
);

insert into line_event.transitions (from_state, to_state)
values
  ('draft', 'ready'),
  ('ready', 'queued'),
  ('queued', 'entering'),
  ('entering', 'entered'),
  ('entered', 'priced'),
  ('priced', 'built'),
  ('entering', 'blocked'),
  ('entered', 'blocked'),
  ('blocked', 'queued'),
  ('queued', 'cancelled'),
  ('priced', 'queued')
on conflict (from_state, to_state) do nothing;

create table if not exists line_event.quote_lines (
  line_id uuid primary key,
  manufacturer text,
  state text not null default 'draft',
  version bigint not null default 0,
  block_reason text,
  cancel_reason text,
  updated_at timestamptz not null default now(),
  constraint line_event_quote_lines_manufacturer_known check (
    manufacturer is null or manufacturer in ('norman', 'onyx', 'sundance', 'lotus')
  ),
  constraint line_event_quote_lines_state_known check (
    state in ('draft', 'ready', 'queued', 'entering', 'entered', 'priced', 'built', 'blocked', 'cancelled')
  ),
  constraint line_event_quote_lines_version_nonnegative check (version >= 0),
  constraint line_event_quote_lines_block_reason check (
    (state = 'blocked') = (nullif(btrim(coalesce(block_reason, '')), '') is not null)
  ),
  constraint line_event_quote_lines_cancel_reason check (
    (state = 'cancelled') = (nullif(btrim(coalesce(cancel_reason, '')), '') is not null)
  ),
  constraint line_event_quote_lines_manufacturer_when_active check (
    state = 'draft' or manufacturer is not null
  )
);

create table if not exists line_event.events (
  id uuid primary key default gen_random_uuid(),
  schema_id text not null default '805-line-event/v1',
  line_id uuid not null references line_event.quote_lines (line_id),
  line_version bigint not null,
  manufacturer text not null,
  from_state text not null,
  to_state text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  idempotency_key text generated always as (line_id::text || ':' || line_version::text) stored,
  constraint line_event_events_schema_id check (schema_id = '805-line-event/v1'),
  constraint line_event_events_version_positive check (line_version > 0),
  constraint line_event_events_manufacturer_known check (
    manufacturer in ('norman', 'onyx', 'sundance', 'lotus')
  ),
  constraint line_event_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint line_event_events_claim_pair check ((claimed_by is null) = (claimed_at is null)),
  constraint line_event_events_transition_fk
    foreign key (from_state, to_state) references line_event.transitions (from_state, to_state),
  constraint line_event_events_idempotency_key_unique unique (idempotency_key)
);

create index if not exists line_event_events_unclaimed_idx
  on line_event.events (manufacturer, created_at, id)
  where claimed_at is null and completed_at is null;

comment on table line_event.events is
  '805-line-event/v1. One row per line version. Idempotency key is line_id:version. Append-only except claimed_by, claimed_at, and completed_at, which only the queue functions set.';

comment on column line_event.events.idempotency_key is
  'Unique key <line_id>:<version>. A second enqueue of the same key is a no-op.';

alter table line_event.transitions enable row level security;
alter table line_event.quote_lines enable row level security;
alter table line_event.events enable row level security;

revoke all on line_event.transitions, line_event.quote_lines, line_event.events from public;

create or replace function line_event.transitions_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  raise exception 'line event transitions are append-only';
end
$fn$;

create trigger line_event_transitions_append_only
before update or delete on line_event.transitions
for each row execute function line_event.transitions_append_only();

create or replace function line_event.quote_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'line queue rows cannot be deleted';
  end if;
  if current_setting('line_event.via_function', true) is distinct from 'on' then
    raise exception 'line state changes only through line event functions';
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'draft'
      or new.version <> 0
      or new.manufacturer is not null
      or new.block_reason is not null
      or new.cancel_reason is not null then
      raise exception 'new line queue rows start at draft';
    end if;
    return new;
  end if;
  if new.line_id is distinct from old.line_id then
    raise exception 'line_id is immutable';
  end if;
  if new.manufacturer is distinct from old.manufacturer and old.manufacturer is not null then
    raise exception 'manufacturer is fixed for a line';
  end if;
  if new.version is distinct from old.version
    and (new.version <> old.version + 1 or new.state <> 'queued') then
    raise exception 'line version must increase by one when the line is queued';
  end if;
  if new.state is distinct from old.state
    and not exists (
      select 1 from line_event.transitions t
      where t.from_state = old.state and t.to_state = new.state
    ) then
    raise exception 'invalid line transition from % to %', old.state, new.state;
  end if;
  if new.state = 'blocked' and nullif(btrim(coalesce(new.block_reason, '')), '') is null then
    raise exception 'blocked requires a reason';
  end if;
  if new.state = 'cancelled' and nullif(btrim(coalesce(new.cancel_reason, '')), '') is null then
    raise exception 'cancelled requires a reason';
  end if;
  if new.state <> 'blocked' and new.block_reason is not null then
    raise exception 'block_reason is only stored while blocked';
  end if;
  if new.state <> 'cancelled' and new.cancel_reason is not null then
    raise exception 'cancel_reason is only stored while cancelled';
  end if;
  return new;
end
$fn$;

create trigger line_event_quote_lines_guard
before insert or update or delete on line_event.quote_lines
for each row execute function line_event.quote_lines_guard();

create or replace function line_event.events_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'line events are append-only';
  end if;
  if current_setting('line_event.via_function', true) is distinct from 'on' then
    if tg_op = 'INSERT' then
      raise exception 'line events can only be inserted by enqueue_line_event';
    end if;
    raise exception 'line events cannot be updated directly';
  end if;
  if tg_op = 'INSERT' then
    if new.claimed_at is not null or new.claimed_by is not null or new.completed_at is not null then
      raise exception 'new line events are unclaimed';
    end if;
    return new;
  end if;
  if (new.id, new.schema_id, new.line_id, new.line_version, new.manufacturer, new.from_state, new.to_state, new.payload, new.created_at)
    is distinct from
    (old.id, old.schema_id, old.line_id, old.line_version, old.manufacturer, old.from_state, old.to_state, old.payload, old.created_at) then
    raise exception 'only claim and complete fields can change';
  end if;
  if old.claimed_at is not null
    and (new.claimed_by, new.claimed_at) is distinct from (old.claimed_by, old.claimed_at) then
    raise exception 'claim fields are immutable once set';
  end if;
  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception 'completed_at is immutable once set';
  end if;
  return new;
end
$fn$;

create trigger line_event_events_guard
before insert or update or delete on line_event.events
for each row execute function line_event.events_guard();

create or replace function line_event.require_manufacturer(p_manufacturer text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_manufacturer text := lower(btrim(coalesce(p_manufacturer, '')));
begin
  if v_manufacturer not in ('norman', 'onyx', 'sundance', 'lotus') then
    raise exception 'manufacturer must be norman, onyx, sundance, or lotus';
  end if;
  return v_manufacturer;
end
$fn$;

create or replace function line_event.event_json(p_event line_event.events, p_duplicate boolean, p_wake jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  select jsonb_build_object(
    'schema', p_event.schema_id,
    'duplicate', p_duplicate,
    'event_id', p_event.id,
    'line_id', p_event.line_id,
    'line_version', p_event.line_version,
    'manufacturer', p_event.manufacturer,
    'from_state', p_event.from_state,
    'to_state', p_event.to_state,
    'idempotency_key', p_event.idempotency_key,
    'payload', p_event.payload,
    'created_at', p_event.created_at,
    'claimed_by', p_event.claimed_by,
    'claimed_at', p_event.claimed_at,
    'completed_at', p_event.completed_at,
    'state', q.state,
    'block_reason', q.block_reason,
    'cancel_reason', q.cancel_reason,
    'wake', p_wake
  )
  from line_event.quote_lines q
  where q.line_id = p_event.line_id;
$fn$;

create or replace function line_event.apply_transition(p_line_id uuid, p_to_state text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_from text;
begin
  perform set_config('line_event.via_function', 'on', true);
  select state into v_from
  from line_event.quote_lines
  where line_id = p_line_id
  for update;
  if not found then
    raise exception 'line queue row % is missing', p_line_id;
  end if;
  if not exists (
    select 1 from line_event.transitions t
    where t.from_state = v_from and t.to_state = p_to_state
  ) then
    raise exception 'invalid line transition from % to %', v_from, p_to_state;
  end if;
  if p_to_state in ('blocked', 'cancelled')
    and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '% requires a reason', p_to_state;
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) > 500 then
    raise exception 'reason is too long';
  end if;
  update line_event.quote_lines
  set state = p_to_state,
      block_reason = case when p_to_state = 'blocked' then btrim(p_reason) else null end,
      cancel_reason = case when p_to_state = 'cancelled' then btrim(p_reason) else null end,
      updated_at = now()
  where line_id = p_line_id;
end
$fn$;

-- The one wake. enqueue_line_event is the only caller.
-- Documented no-op: no HTTP, no pg_net, no Telegram, no Twilio, no worker route.
-- No switch is created or turned on.
create or replace function public.wake_line_event_worker(p_manufacturer text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  return jsonb_build_object(
    'woken', false,
    'reason', 'wake_disabled',
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'schema', '805-line-event/v1'
  );
end
$fn$;

comment on function public.wake_line_event_worker(text, uuid) is
  'No-op wake for one manufacturer line worker. enqueue_line_event is the only caller. Live outbound calls stay off.';

create or replace function line_event.enqueue_line_event(
  p_line_id uuid,
  p_version bigint,
  p_manufacturer text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_line line_event.quote_lines%rowtype;
  v_event line_event.events%rowtype;
  v_state text;
  v_from text;
  v_wake jsonb;
begin
  if p_line_id is null then
    raise exception 'line_id is required';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'line version must be a positive integer';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a json object';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  insert into line_event.quote_lines (line_id)
  values (p_line_id)
  on conflict (line_id) do nothing;
  select * into v_line
  from line_event.quote_lines
  where line_id = p_line_id
  for update;
  select * into v_event
  from line_event.events
  where idempotency_key = p_line_id::text || ':' || p_version::text;
  if found then
    return line_event.event_json(v_event, true, null);
  end if;
  if p_version <> v_line.version + 1 then
    raise exception 'line version % is not the next version after %', p_version, v_line.version;
  end if;
  if v_line.manufacturer is not null and v_line.manufacturer <> v_manufacturer then
    raise exception 'manufacturer does not match this line';
  end if;
  if v_line.manufacturer is null then
    update line_event.quote_lines
    set manufacturer = v_manufacturer,
        updated_at = now()
    where line_id = p_line_id;
  end if;
  v_state := v_line.state;
  if v_state = 'draft' then
    perform line_event.apply_transition(p_line_id, 'ready', null);
    v_state := 'ready';
  end if;
  if v_state not in ('ready', 'blocked', 'priced') then
    raise exception 'invalid line transition from % to queued', v_state;
  end if;
  v_from := v_state;
  perform line_event.apply_transition(p_line_id, 'queued', null);
  update line_event.quote_lines
  set version = p_version,
      updated_at = now()
  where line_id = p_line_id;
  insert into line_event.events (line_id, line_version, manufacturer, from_state, to_state, payload)
  values (p_line_id, p_version, v_manufacturer, v_from, 'queued', p_payload)
  returning * into v_event;
  v_wake := public.wake_line_event_worker(v_manufacturer, v_event.id);
  return line_event.event_json(v_event, false, v_wake);
end
$fn$;

create or replace function line_event.claim_next_line_event(p_manufacturer text, p_claimed_by text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_actor text := coalesce(nullif(btrim(coalesce(p_claimed_by, '')), ''), v_manufacturer);
  v_event line_event.events%rowtype;
  v_state text;
begin
  if char_length(v_actor) > 200 then
    raise exception 'claimed_by is too long';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select e.* into v_event
  from line_event.events e
  where e.manufacturer = v_manufacturer
    and e.claimed_at is null
    and e.completed_at is null
  order by e.created_at, e.id
  for update skip locked
  limit 1;
  if not found then
    return null;
  end if;
  select state into v_state
  from line_event.quote_lines
  where line_id = v_event.line_id
  for update;
  if v_state is distinct from 'queued' then
    raise exception 'invalid line transition from % to entering', coalesce(v_state, 'missing');
  end if;
  update line_event.events
  set claimed_by = v_actor,
      claimed_at = now()
  where id = v_event.id
  returning * into v_event;
  perform line_event.apply_transition(v_event.line_id, 'entering', null);
  return line_event.event_json(v_event, false, null);
end
$fn$;

create or replace function line_event.complete_line_event(
  p_event_id uuid,
  p_manufacturer text,
  p_to_state text,
  p_claimed_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_to text := lower(btrim(coalesce(p_to_state, '')));
  v_actor text := coalesce(nullif(btrim(coalesce(p_claimed_by, '')), ''), v_manufacturer);
  v_event line_event.events%rowtype;
  v_line line_event.quote_lines%rowtype;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if v_to not in ('entered', 'priced', 'built') then
    raise exception 'complete_line_event only accepts entered, priced, or built';
  end if;
  if char_length(v_actor) > 200 then
    raise exception 'claimed_by is too long';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event from line_event.events where id = p_event_id for update;
  if not found then
    raise exception 'line event % not found', p_event_id;
  end if;
  if v_event.manufacturer <> v_manufacturer then
    raise exception 'manufacturer does not match this event';
  end if;
  select * into v_line from line_event.quote_lines where line_id = v_event.line_id for update;
  if v_line.version <> v_event.line_version then
    raise exception 'event version is not the current line version';
  end if;
  if v_event.claimed_at is null or v_event.claimed_by is distinct from v_actor then
    raise exception 'complete requires the claimer';
  end if;
  perform line_event.apply_transition(v_event.line_id, v_to, null);
  if v_to = 'entered' and v_event.completed_at is null then
    update line_event.events
    set completed_at = now()
    where id = v_event.id
    returning * into v_event;
  end if;
  return line_event.event_json(v_event, false, null);
end
$fn$;

create or replace function line_event.block_line_event(
  p_event_id uuid,
  p_manufacturer text,
  p_reason text,
  p_to_state text,
  p_claimed_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_to text := lower(btrim(coalesce(p_to_state, 'blocked')));
  v_actor text := coalesce(nullif(btrim(coalesce(p_claimed_by, '')), ''), v_manufacturer);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_event line_event.events%rowtype;
  v_line line_event.quote_lines%rowtype;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if v_to not in ('blocked', 'cancelled') then
    raise exception 'block_line_event only accepts blocked or cancelled';
  end if;
  if v_reason = '' then
    raise exception '% requires a reason', v_to;
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'reason is too long';
  end if;
  if char_length(v_actor) > 200 then
    raise exception 'claimed_by is too long';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event from line_event.events where id = p_event_id for update;
  if not found then
    raise exception 'line event % not found', p_event_id;
  end if;
  if v_event.manufacturer <> v_manufacturer then
    raise exception 'manufacturer does not match this event';
  end if;
  select * into v_line from line_event.quote_lines where line_id = v_event.line_id for update;
  if v_line.version <> v_event.line_version then
    raise exception 'event version is not the current line version';
  end if;
  if v_to = 'blocked' and v_event.claimed_at is null then
    raise exception 'block requires a claim';
  end if;
  if v_event.claimed_at is not null and v_event.claimed_by is distinct from v_actor then
    raise exception 'claimed_by does not match this event';
  end if;
  perform line_event.apply_transition(v_event.line_id, v_to, v_reason);
  if v_event.completed_at is null then
    update line_event.events
    set completed_at = now()
    where id = v_event.id
    returning * into v_event;
  end if;
  return line_event.event_json(v_event, false, null);
end
$fn$;

create or replace function public.enqueue_line_event(
  p_line_id uuid,
  p_version bigint,
  p_manufacturer text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.enqueue_line_event(p_line_id, p_version, p_manufacturer, coalesce(p_payload, '{}'::jsonb));
$fn$;

create or replace function public.claim_next_line_event(
  p_manufacturer text,
  p_claimed_by text default null
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.claim_next_line_event(p_manufacturer, p_claimed_by);
$fn$;

create or replace function public.complete_line_event(
  p_event_id uuid,
  p_manufacturer text,
  p_to_state text,
  p_claimed_by text default null
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.complete_line_event(p_event_id, p_manufacturer, p_to_state, p_claimed_by);
$fn$;

create or replace function public.block_line_event(
  p_event_id uuid,
  p_manufacturer text,
  p_reason text,
  p_to_state text default 'blocked',
  p_claimed_by text default null
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.block_line_event(p_event_id, p_manufacturer, p_reason, p_to_state, p_claimed_by);
$fn$;

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'manufacturer_bot') then
    create role manufacturer_bot nologin;
  end if;
end
$role$;

comment on role manufacturer_bot is
  '805 manufacturer workers. Execute on the line-event functions only. No login and no direct table writes.';

revoke all on function line_event.transitions_append_only() from public;
revoke all on function line_event.quote_lines_guard() from public;
revoke all on function line_event.events_guard() from public;
revoke all on function line_event.require_manufacturer(text) from public;
revoke all on function line_event.event_json(line_event.events, boolean, jsonb) from public;
revoke all on function line_event.apply_transition(uuid, text, text) from public;
revoke all on function line_event.enqueue_line_event(uuid, bigint, text, jsonb) from public;
revoke all on function line_event.claim_next_line_event(text, text) from public;
revoke all on function line_event.complete_line_event(uuid, text, text, text) from public;
revoke all on function line_event.block_line_event(uuid, text, text, text, text) from public;

revoke all on function public.wake_line_event_worker(text, uuid) from public;
revoke all on function public.enqueue_line_event(uuid, bigint, text, jsonb) from public;
revoke all on function public.claim_next_line_event(text, text) from public;
revoke all on function public.complete_line_event(uuid, text, text, text) from public;
revoke all on function public.block_line_event(uuid, text, text, text, text) from public;

grant execute on function public.wake_line_event_worker(text, uuid) to service_role;
grant execute on function public.enqueue_line_event(uuid, bigint, text, jsonb) to service_role, manufacturer_bot;
grant execute on function public.claim_next_line_event(text, text) to service_role, manufacturer_bot;
grant execute on function public.complete_line_event(uuid, text, text, text) to service_role, manufacturer_bot;
grant execute on function public.block_line_event(uuid, text, text, text, text) to service_role, manufacturer_bot;

-- Security definer bodies run as the migration owner and call the private functions.
grant execute on function line_event.require_manufacturer(text) to current_user;
grant execute on function line_event.event_json(line_event.events, boolean, jsonb) to current_user;
grant execute on function line_event.apply_transition(uuid, text, text) to current_user;
grant execute on function line_event.enqueue_line_event(uuid, bigint, text, jsonb) to current_user;
grant execute on function line_event.claim_next_line_event(text, text) to current_user;
grant execute on function line_event.complete_line_event(uuid, text, text, text) to current_user;
grant execute on function line_event.block_line_event(uuid, text, text, text, text) to current_user;
grant execute on function public.wake_line_event_worker(text, uuid) to current_user;
grant execute on function public.enqueue_line_event(uuid, bigint, text, jsonb) to current_user;
grant execute on function public.claim_next_line_event(text, text) to current_user;
grant execute on function public.complete_line_event(uuid, text, text, text) to current_user;
grant execute on function public.block_line_event(uuid, text, text, text, text) to current_user;

do $revoke$
declare
  target text;
  fn text;
begin
  foreach target in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = target) then
      foreach fn in array array[
        'public.wake_line_event_worker(text, uuid)',
        'public.enqueue_line_event(uuid, bigint, text, jsonb)',
        'public.claim_next_line_event(text, text)',
        'public.complete_line_event(uuid, text, text, text)',
        'public.block_line_event(uuid, text, text, text, text)'
      ] loop
        execute format('revoke all on function %s from %I', fn, target);
      end loop;
    end if;
  end loop;
end
$revoke$;

notify pgrst, 'reload schema';
