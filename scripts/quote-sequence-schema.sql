-- Quote sequence guide for 805 Quote (Quoter).
-- Field order is the order-form schema list indexed by the measure-form manifest.
-- catalog_version is `order-form:<routing_key>:v<schema_version>` from that schema.
-- sales_quote_v2_catalog_versions is empty in production and is not referenced.
-- sales_quote_v2_manufacturers does not list Onyx or Sundance and is not referenced.
-- This migration does not drop, truncate, or delete existing data.
--
-- Permissions. anon, authenticated, and service_role may SELECT and may
-- EXECUTE the read functions only. service_role bypasses row level security
-- in Supabase, so write grants are revoked as well. A BEFORE trigger rejects
-- every insert, update, and delete unless the admin function has set the
-- transaction-local flag quote_sequence.admin_write. That function is
-- security definer, granted only to authenticated, and it allows the write
-- only when auth.uid() is an active crm_profiles row for Mike
-- (805shutters@gmail.com) or Jessica (jessica@805shutters.com). That is the
-- same allow-list as public.is_805_crm_writer(). Deletes are rejected even
-- on the admin path. The table owner can still write only by setting that
-- flag; the admin function is the only path that sets it, and only after the
-- profile check.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create table if not exists public.quote_category_field_sequence (
  manufacturer text not null,
  category text not null,
  field_key text not null,
  ask_order integer not null check (ask_order > 0),
  required boolean not null,
  input_kind text not null check (input_kind in ('buttons', 'typed')),
  depends_on text[] not null default '{}',
  catalog_version text not null,
  inferred boolean not null,
  set_by text not null check (set_by in ('mike', 'jessica', 'seed')),
  set_at timestamptz not null default now(),
  constraint quote_category_field_sequence_pkey
    primary key (manufacturer, category, field_key, catalog_version)
);

create table if not exists public.quote_catalog_field_choice (
  id bigint generated always as identity primary key,
  manufacturer text not null,
  category text not null,
  field_key text not null,
  choice_value text not null,
  choice_label text not null,
  catalog_version text not null,
  when_spec jsonb not null default '{}'::jsonb,
  min_width numeric,
  max_width numeric,
  min_height numeric,
  max_height numeric,
  size_rule text not null default 'none'
    check (size_rule in ('none', 'max_width', 'fabric_valance', 'wrapped_fabric')),
  constraint quote_catalog_field_choice_unique
    unique (manufacturer, category, field_key, choice_value, when_spec, catalog_version)
);

create index if not exists quote_category_field_sequence_lookup
  on public.quote_category_field_sequence (manufacturer, category, catalog_version, ask_order);

create index if not exists quote_catalog_field_choice_lookup
  on public.quote_catalog_field_choice (manufacturer, category, field_key, catalog_version);

create table if not exists public.quote_sequence_field_alias (
  manufacturer text not null,
  category text not null,
  schema_field_key text not null,
  saved_key text not null,
  saved_location text not null check (saved_location in ('options_json', 'line_item')),
  catalog_version text not null,
  constraint quote_sequence_field_alias_pkey
    primary key (manufacturer, category, schema_field_key, saved_key, catalog_version)
);

comment on table public.quote_sequence_field_alias is
  'Explicit rename from an order-form schema field to the key saved on sales_quote_designs or the line. The lookup accepts either key and does not guess when they disagree.';

comment on table public.quote_category_field_sequence is
  'Ask order for 805 Quote. inferred is true when the order or the field is not published by the catalog.';
comment on table public.quote_catalog_field_choice is
  'Catalog button values the sequence lookup may return. Rows are seeded from existing option lists.';

create or replace function public.quote_sequence_when_matches(when_spec jsonb, answers jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select coalesce(bool_and(
    answers ? key and answers->>key is not distinct from when_spec->>key
  ), true)
  from jsonb_object_keys(coalesce(when_spec, '{}'::jsonb)) as key;
$fn$;

create or replace function public.quote_sequence_matching_choices(
  p_manufacturer text,
  p_category text,
  p_version text,
  p_field_key text,
  p_answers jsonb
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with size as (
    select
      case
        when jsonb_typeof(p_answers->'ordered_width') = 'number'
          and (p_answers->>'ordered_width') ~ '^[0-9]+(\.[0-9]+)?$'
        then (p_answers->>'ordered_width')::numeric
      end as width,
      case
        when jsonb_typeof(p_answers->'ordered_height') = 'number'
          and (p_answers->>'ordered_height') ~ '^[0-9]+(\.[0-9]+)?$'
        then (p_answers->>'ordered_height')::numeric
      end as height
  ),
  fabric as (
    select c.max_width as fabric_width
    from public.quote_catalog_field_choice c
    where c.manufacturer = p_manufacturer
      and c.category = p_category
      and c.catalog_version = p_version
      and c.field_key = 'color_code'
      and c.choice_value = p_answers->>'color_code'
      and c.size_rule = 'max_width'
      and public.quote_sequence_when_matches(c.when_spec, p_answers)
    order by c.id
    limit 1
  ),
  matched as (
    select distinct on (c.choice_value)
      c.id, c.choice_value, c.choice_label
    from public.quote_catalog_field_choice c
    cross join size
    left join fabric on true
    where c.manufacturer = p_manufacturer
      and c.category = p_category
      and c.catalog_version = p_version
      and c.field_key = p_field_key
      and public.quote_sequence_when_matches(c.when_spec, p_answers)
      and (
        c.size_rule = 'none'
        or (
          c.size_rule = 'max_width'
          and (size.width is null or (
            (c.min_width is null or size.width >= c.min_width)
            and (c.max_width is null or size.width <= c.max_width)
          ))
          and (size.height is null or (
            (c.min_height is null or size.height >= c.min_height)
            and (c.max_height is null or size.height <= c.max_height)
          ))
        )
        or (
          c.size_rule = 'fabric_valance'
          and fabric.fabric_width is not null
          and size.width is not null
          and size.width <= least(95, fabric.fabric_width - 7)
        )
        or (
          c.size_rule = 'wrapped_fabric'
          and fabric.fabric_width is not null
          and size.width is not null
          and size.width <= least(95, fabric.fabric_width)
        )
      )
    order by c.choice_value, c.id
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('value', choice_value, 'label', choice_label) order by id),
    '[]'::jsonb
  )
  from matched;
$fn$;

create or replace function public.quote_sequence_resolve_version(
  p_manufacturer text,
  p_category text,
  p_requested text
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  version_count integer;
  resolved text;
begin
  if p_manufacturer is null or btrim(p_manufacturer) = '' or p_category is null or btrim(p_category) = '' then
    return jsonb_build_object('status', 'blocked', 'reason', 'unknown manufacturer or category');
  end if;
  select count(*) into version_count from (
    select distinct catalog_version
    from public.quote_category_field_sequence
    where lower(manufacturer) = lower(btrim(p_manufacturer))
      and lower(category) = lower(btrim(p_category))
  ) versions;
  if version_count = 0 then
    return jsonb_build_object('status', 'blocked', 'reason', 'unknown manufacturer or category');
  end if;
  if p_requested is not null and btrim(p_requested) <> '' then
    select catalog_version into resolved
    from public.quote_category_field_sequence
    where lower(manufacturer) = lower(btrim(p_manufacturer))
      and lower(category) = lower(btrim(p_category))
      and catalog_version = btrim(p_requested)
    limit 1;
    if resolved is null then
      return jsonb_build_object('status', 'blocked', 'reason', 'catalog version is not seeded for this category');
    end if;
    return jsonb_build_object('status', 'ok', 'catalog_version', resolved, 'manufacturer', (
      select manufacturer from public.quote_category_field_sequence
      where catalog_version = resolved and lower(manufacturer) = lower(btrim(p_manufacturer))
        and lower(category) = lower(btrim(p_category)) limit 1
    ), 'category', (
      select category from public.quote_category_field_sequence
      where catalog_version = resolved and lower(manufacturer) = lower(btrim(p_manufacturer))
        and lower(category) = lower(btrim(p_category)) limit 1
    ));
  end if;
  if version_count <> 1 then
    return jsonb_build_object('status', 'blocked', 'reason', 'catalog version is required');
  end if;
  return (
    select jsonb_build_object(
      'status', 'ok',
      'manufacturer', manufacturer,
      'category', category,
      'catalog_version', catalog_version
    )
    from public.quote_category_field_sequence
    where lower(manufacturer) = lower(btrim(p_manufacturer))
      and lower(category) = lower(btrim(p_category))
    limit 1
  );
end;
$fn$;

create or replace function public.quote_sequence_value_blank(raw jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select raw is null
    or raw = 'null'::jsonb
    or (jsonb_typeof(raw) = 'string' and btrim(raw #>> '{}') = '');
$fn$;

create or replace function public.quote_sequence_field_answer(
  p_answers jsonb, p_manufacturer text, p_category text, p_version text, p_field text
) returns jsonb
language sql stable
set search_path = public, pg_temp
as $fn$
  select case
    when p_answers ? p_field and not public.quote_sequence_value_blank(p_answers->p_field) then p_answers->p_field
    else (
      select p_answers->alias.saved_key
      from public.quote_sequence_field_alias alias
      where alias.manufacturer = p_manufacturer
        and alias.category = p_category
        and alias.catalog_version = p_version
        and alias.schema_field_key = p_field
        and p_answers ? alias.saved_key
        and not public.quote_sequence_value_blank(p_answers->alias.saved_key)
      order by alias.saved_key
      limit 1
    )
  end;
$fn$;

create or replace function public.quote_sequence_answer_conflict(
  p_answers jsonb, p_manufacturer text, p_category text, p_version text, p_field text
) returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select (
    select count(distinct present.value::text)
    from (
      select p_answers->p_field as value
      where p_answers ? p_field and not public.quote_sequence_value_blank(p_answers->p_field)
      union all
      select p_answers->alias.saved_key
      from public.quote_sequence_field_alias alias
      where alias.manufacturer = p_manufacturer
        and alias.category = p_category
        and alias.catalog_version = p_version
        and alias.schema_field_key = p_field
        and p_answers ? alias.saved_key
        and not public.quote_sequence_value_blank(p_answers->alias.saved_key)
    ) present
  ) > 1;
$fn$;

create or replace function public.quote_sequence_typed_valid(p_field text, raw jsonb, p_choice_count integer)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  width numeric;
  height numeric;
begin
  if p_field in ('ordered_width', 'ordered_height') then
    if jsonb_typeof(raw) <> 'number' or (raw::text) !~ '^[0-9]+(\.[0-9]+)?$' then
      return jsonb_build_object('ok', false, 'reason', p_field || ' must be inches to the nearest 1/8 inch');
    end if;
    width := (raw::text)::numeric;
    if width <= 0 or width * 8 <> trunc(width * 8) then
      return jsonb_build_object('ok', false, 'reason', p_field || ' must be inches to the nearest 1/8 inch');
    end if;
    return jsonb_build_object('ok', true);
  end if;
  if p_field in ('quantity', 'portal_line_quantity') then
    if (jsonb_typeof(raw) = 'number' and (raw::text)::numeric >= 1 and (raw::text)::numeric = trunc((raw::text)::numeric))
      or (jsonb_typeof(raw) = 'string' and (raw #>> '{}') ~ '^[1-9][0-9]*$') then
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'quantity must be a whole number of at least 1');
  end if;
  if jsonb_typeof(raw) = 'boolean' then
    return jsonb_build_object('ok', true);
  end if;
  if jsonb_typeof(raw) = 'object' and p_choice_count > 0 then
    if coalesce(raw->>'whole', '') ~ '^[0-9]+$' and raw->>'fraction' is not null then
      return jsonb_build_object('ok', true, 'fraction', raw->>'fraction');
    end if;
    return jsonb_build_object('ok', false, 'reason', p_field || ' must use a schema dimension');
  end if;
  if jsonb_typeof(raw) = 'string' and length(btrim(raw #>> '{}')) > 0 then
    return jsonb_build_object('ok', true);
  end if;
  if jsonb_typeof(raw) = 'number' then
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'value is not valid for ' || p_field);
end;
$fn$;

create or replace function public.quote_next_required_field(spec jsonb, manufacturer text, category text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  answers jsonb := coalesce(spec->'answers', '{}'::jsonb);
  resolved jsonb;
  version text;
  maker text;
  line text;
  product_switch boolean := false;
  kept jsonb := '{}'::jsonb;
  invalidated text[] := array[]::text[];
  rec record;
  raw jsonb;
  deps_ok boolean;
  dep text;
  valid boolean;
  reason text;
  choices jsonb := '[]'::jsonb;
  next_key text;
  next_kind text;
  next_required boolean;
  next_order integer;
  next_status text;
  next_reason text;
  next_choices jsonb;
  shared text[] := array[
    'customer_name', 'crm_customer_id', 'contract_number', 'order_packet_id', 'project_address',
    'customer_phone', 'customer_email', 'salesperson', 'measure_status', 'final_order_source',
    'line_item_number', 'room_location', 'quantity', 'side_mark_po', 'mount_type',
    'ordered_width', 'ordered_height'
  ];
  optional_key text;
  optional_choices jsonb;
  typed jsonb;
  choice_count integer;
  saved_key text;
begin
  resolved := public.quote_sequence_resolve_version(manufacturer, category, spec->>'catalog_version');
  if resolved->>'status' = 'blocked' then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', resolved->>'reason',
      'field_key', null,
      'input_kind', null,
      'required', null,
      'ask_order', null,
      'choices', '[]'::jsonb,
      'invalidated', '[]'::jsonb,
      'kept', '{}'::jsonb,
      'optional_field', null,
      'catalog_version', null
    );
  end if;
  maker := resolved->>'manufacturer';
  line := resolved->>'category';
  version := resolved->>'catalog_version';
  product_switch := spec ? 'previous' and (
    lower(coalesce(spec#>>'{previous,category}', '')) is distinct from lower(line)
    or lower(coalesce(spec#>>'{previous,manufacturer}', '')) is distinct from lower(maker)
  );

  for dep in select jsonb_object_keys(answers) loop
    if not exists (
      select 1 from public.quote_category_field_sequence s
      where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.field_key = dep
    ) and not exists (
      select 1 from public.quote_sequence_field_alias alias
      where alias.manufacturer = maker and alias.category = line and alias.catalog_version = version and alias.saved_key = dep
    ) then
      invalidated := array_append(invalidated, dep);
    end if;
  end loop;

  for rec in
    select *
    from public.quote_category_field_sequence s
    where s.manufacturer = maker and s.category = line and s.catalog_version = version
    order by s.ask_order, s.field_key
  loop
    raw := public.quote_sequence_field_answer(answers, maker, line, version, rec.field_key);
    deps_ok := true;
    if rec.depends_on is not null then
      foreach dep in array rec.depends_on loop
        if not (kept ? dep) then
          deps_ok := false;
        end if;
      end loop;
    end if;

    if product_switch and not (rec.field_key = any (shared)) then
      if not public.quote_sequence_value_blank(raw) then
        invalidated := array_append(invalidated, rec.field_key);
        for saved_key in
          select alias.saved_key from public.quote_sequence_field_alias alias
          where alias.manufacturer = maker and alias.category = line and alias.catalog_version = version
            and alias.schema_field_key = rec.field_key and answers ? alias.saved_key
        loop
          invalidated := array_append(invalidated, saved_key);
        end loop;
      end if;
      if rec.required and deps_ok and next_key is null then
        next_key := rec.field_key;
        next_kind := rec.input_kind;
        next_required := rec.required;
        next_order := rec.ask_order;
        next_status := 'ask';
        next_reason := null;
      end if;
      continue;
    end if;

    if public.quote_sequence_value_blank(raw) then
      if rec.required and deps_ok and next_key is null then
        next_key := rec.field_key;
        next_kind := rec.input_kind;
        next_required := rec.required;
        next_order := rec.ask_order;
        next_status := 'ask';
        next_reason := null;
      end if;
      continue;
    end if;

    if not deps_ok then
      invalidated := array_append(invalidated, rec.field_key);
      continue;
    end if;

    valid := true;
    reason := null;
    choices := '[]'::jsonb;
    if public.quote_sequence_answer_conflict(answers, maker, line, version, rec.field_key) then
      valid := false;
      reason := 'schema field and saved option disagree';
    elsif rec.input_kind = 'typed' then
      select count(*) into choice_count
      from public.quote_catalog_field_choice c
      where c.manufacturer = maker and c.category = line and c.catalog_version = version and c.field_key = rec.field_key;
      typed := public.quote_sequence_typed_valid(rec.field_key, raw, choice_count);
      valid := coalesce((typed->>'ok')::boolean, false);
      reason := typed->>'reason';
      if valid and choice_count > 0 and jsonb_typeof(raw) = 'object' then
        if not exists (
          select 1 from public.quote_catalog_field_choice c
          where c.manufacturer = maker and c.category = line and c.catalog_version = version
            and c.field_key = rec.field_key and c.choice_value = raw->>'fraction'
        ) then
          valid := false;
          reason := rec.field_key || ' fraction is not in the schema';
        end if;
      elsif valid and choice_count > 0 and jsonb_typeof(raw) in ('string', 'number') then
        if not exists (
          select 1 from public.quote_catalog_field_choice c
          where c.manufacturer = maker and c.category = line and c.catalog_version = version
            and c.field_key = rec.field_key and c.choice_value = raw #>> '{}'
        ) then
          valid := false;
          reason := 'value is not a catalog choice';
        end if;
      end if;
    else
      choices := public.quote_sequence_matching_choices(maker, line, version, rec.field_key, kept);
      if choices = '[]'::jsonb then
        valid := false;
        reason := 'no catalog choices for ' || rec.field_key;
      elsif not exists (
        select 1 from jsonb_array_elements(choices) element where element->>'value' = raw #>> '{}'
      ) then
        valid := false;
        reason := 'value is not a catalog choice';
      end if;
    end if;

    if valid then
      kept := kept || jsonb_build_object(rec.field_key, raw);
    else
      invalidated := array_append(invalidated, rec.field_key);
      for saved_key in
        select alias.saved_key from public.quote_sequence_field_alias alias
        where alias.manufacturer = maker and alias.category = line and alias.catalog_version = version
          and alias.schema_field_key = rec.field_key and answers ? alias.saved_key
      loop
        invalidated := array_append(invalidated, saved_key);
      end loop;
      if next_key is null then
        next_key := rec.field_key;
        next_kind := rec.input_kind;
        next_required := rec.required;
        next_order := rec.ask_order;
        next_status := case when reason like 'no catalog choices%' then 'blocked' else 'needs_input' end;
        next_reason := reason;
        next_choices := choices;
      end if;
    end if;
  end loop;

  if next_key is not null then
    if next_status = 'ask' then
      if next_kind = 'buttons' then
        next_choices := public.quote_sequence_matching_choices(maker, line, version, next_key, kept);
        if next_choices = '[]'::jsonb then
          next_status := 'blocked';
          next_reason := 'no catalog choices for ' || next_key;
        end if;
      else
        next_choices := '[]'::jsonb;
      end if;
    end if;
    return jsonb_build_object(
      'status', next_status,
      'reason', next_reason,
      'field_key', next_key,
      'input_kind', next_kind,
      'required', next_required,
      'ask_order', next_order,
      'choices', coalesce(next_choices, '[]'::jsonb),
      'invalidated', to_jsonb(invalidated),
      'kept', kept,
      'optional_field', null,
      'catalog_version', version
    );
  end if;

  optional_key := null;
  optional_choices := null;
  for rec in
    select *
    from public.quote_category_field_sequence s
    where s.manufacturer = maker and s.category = line and s.catalog_version = version and not s.required
    order by s.ask_order, s.field_key
  loop
    if kept ? rec.field_key then
      continue;
    end if;
    deps_ok := true;
    if rec.depends_on is not null then
      foreach dep in array rec.depends_on loop
        if not (kept ? dep) then
          deps_ok := false;
        end if;
      end loop;
    end if;
    if not deps_ok or rec.input_kind <> 'buttons' then
      continue;
    end if;
    choices := public.quote_sequence_matching_choices(maker, line, version, rec.field_key, kept);
    if choices <> '[]'::jsonb then
      optional_key := rec.field_key;
      optional_choices := choices;
      exit;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'complete',
    'reason', null,
    'field_key', null,
    'input_kind', null,
    'required', null,
    'ask_order', null,
    'choices', '[]'::jsonb,
    'invalidated', to_jsonb(invalidated),
    'kept', kept,
    'optional_field', case when optional_key is null then null else jsonb_build_object(
      'field_key', optional_key,
      'input_kind', 'buttons',
      'choices', optional_choices
    ) end,
    'catalog_version', version
  );
end;
$fn$;

create or replace function public.quote_validate_tapped_value(
  spec jsonb,
  manufacturer text,
  category text,
  p_field_key text,
  p_value jsonb
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  resolved jsonb;
  maker text;
  line text;
  version text;
  rec record;
  answers jsonb := coalesce(spec->'answers', '{}'::jsonb);
  dep text;
  choices jsonb;
  typed jsonb;
  choice_count integer;
  prior record;
begin
  resolved := public.quote_sequence_resolve_version(manufacturer, category, spec->>'catalog_version');
  if resolved->>'status' = 'blocked' then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', resolved->>'reason', 'choices', '[]'::jsonb);
  end if;
  maker := resolved->>'manufacturer';
  line := resolved->>'category';
  version := resolved->>'catalog_version';
  for prior in
    select s.field_key from public.quote_category_field_sequence s
    where s.manufacturer = maker and s.category = line and s.catalog_version = version
  loop
    if public.quote_sequence_value_blank(answers->prior.field_key) then
      typed := public.quote_sequence_field_answer(answers, maker, line, version, prior.field_key);
      if not public.quote_sequence_value_blank(typed) then
        answers := answers || jsonb_build_object(prior.field_key, typed);
      end if;
    end if;
  end loop;
  select * into rec
  from public.quote_category_field_sequence s
  where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.field_key = p_field_key;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'field is not in the sequence', 'choices', '[]'::jsonb);
  end if;
  if rec.depends_on is not null then
    foreach dep in array rec.depends_on loop
      if public.quote_sequence_value_blank(answers->dep) then
        return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', 'earlier field is missing: ' || dep, 'choices', '[]'::jsonb);
      end if;
    end loop;
  end if;
  if public.quote_sequence_value_blank(p_value) then
    return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', 'value is empty', 'choices', '[]'::jsonb);
  end if;
  if rec.input_kind = 'typed' then
    select count(*) into choice_count from public.quote_catalog_field_choice c
    where c.manufacturer = maker and c.category = line and c.catalog_version = version and c.field_key = p_field_key;
    typed := public.quote_sequence_typed_valid(p_field_key, p_value, choice_count);
    if coalesce((typed->>'ok')::boolean, false) is not true then
      return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', typed->>'reason', 'choices', '[]'::jsonb);
    end if;
    if choice_count > 0 and jsonb_typeof(p_value) = 'object' and not exists (
      select 1 from public.quote_catalog_field_choice c
      where c.manufacturer = maker and c.category = line and c.catalog_version = version
        and c.field_key = p_field_key and c.choice_value = p_value->>'fraction'
    ) then
      return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', p_field_key || ' fraction is not in the schema', 'choices', '[]'::jsonb);
    end if;
    return jsonb_build_object('ok', true, 'status', 'ok', 'reason', null, 'choices', '[]'::jsonb);
  end if;
  choices := public.quote_sequence_matching_choices(maker, line, version, p_field_key, answers);
  if choices = '[]'::jsonb then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'no catalog choices for ' || p_field_key, 'choices', '[]'::jsonb);
  end if;
  if not exists (select 1 from jsonb_array_elements(choices) element where element->>'value' = p_value #>> '{}') then
    return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', 'value is not a catalog choice', 'choices', choices);
  end if;
  return jsonb_build_object('ok', true, 'status', 'ok', 'reason', null, 'choices', choices);
end;
$fn$;

create or replace function public.quote_sequence_reject_direct_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if coalesce(current_setting('quote_sequence.admin_write', true), '') is distinct from 'on' then
    raise exception 'quote sequence writes require the Mike or Jessica admin path'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'quote sequence rows are not deleted'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create or replace function public.quote_category_field_sequence_write(p_target text, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  actor_email text;
  actor_set_by text;
  result jsonb;
begin
  select lower(email) into actor_email
  from public.crm_profiles
  where id = auth.uid()
    and active is true
    and lower(email) in ('805shutters@gmail.com', 'jessica@805shutters.com');
  if actor_email is null then
    raise exception 'quote sequence writes require Mike or Jessica'
      using errcode = '42501';
  end if;
  actor_set_by := case when actor_email = '805shutters@gmail.com' then 'mike' else 'jessica' end;
  if p_target is null or p_target not in ('sequence', 'choice') then
    raise exception 'unknown quote sequence target' using errcode = '22023';
  end if;
  perform set_config('quote_sequence.admin_write', 'on', true);
  if p_target = 'sequence' then
    insert into public.quote_category_field_sequence (
      manufacturer, category, field_key, ask_order, required, input_kind, depends_on,
      catalog_version, inferred, set_by, set_at
    ) values (
      p_row->>'manufacturer',
      p_row->>'category',
      p_row->>'field_key',
      (p_row->>'ask_order')::integer,
      (p_row->>'required')::boolean,
      p_row->>'input_kind',
      coalesce(array(select jsonb_array_elements_text(p_row->'depends_on')), '{}'),
      p_row->>'catalog_version',
      (p_row->>'inferred')::boolean,
      actor_set_by,
      now()
    )
    on conflict (manufacturer, category, field_key, catalog_version) do update
      set ask_order = excluded.ask_order,
          required = excluded.required,
          input_kind = excluded.input_kind,
          depends_on = excluded.depends_on,
          inferred = excluded.inferred,
          set_by = excluded.set_by,
          set_at = excluded.set_at
    returning to_jsonb(public.quote_category_field_sequence.*) into result;
  else
    insert into public.quote_catalog_field_choice (
      manufacturer, category, field_key, choice_value, choice_label, catalog_version,
      when_spec, min_width, max_width, min_height, max_height, size_rule
    ) values (
      p_row->>'manufacturer',
      p_row->>'category',
      p_row->>'field_key',
      p_row->>'choice_value',
      p_row->>'choice_label',
      p_row->>'catalog_version',
      coalesce(p_row->'when_spec', '{}'::jsonb),
      (p_row->>'min_width')::numeric,
      (p_row->>'max_width')::numeric,
      (p_row->>'min_height')::numeric,
      (p_row->>'max_height')::numeric,
      coalesce(p_row->>'size_rule', 'none')
    )
    on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update
      set choice_label = excluded.choice_label,
          min_width = excluded.min_width,
          max_width = excluded.max_width,
          min_height = excluded.min_height,
          max_height = excluded.max_height,
          size_rule = excluded.size_rule
    returning to_jsonb(public.quote_catalog_field_choice.*) into result;
  end if;
  perform set_config('quote_sequence.admin_write', 'off', true);
  return result;
end;
$fn$;

revoke all on function public.quote_sequence_reject_direct_write() from public, anon, authenticated, service_role;
revoke all on function public.quote_category_field_sequence_write(text, jsonb) from public, anon, service_role;
grant execute on function public.quote_category_field_sequence_write(text, jsonb) to authenticated;

-- Seed rows are inserted below, before the write trigger is attached.
