-- Correct the quote sequence seed from supabase/seed-sources/805-order-entry-fields.json.
-- Source sha256: 2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd
-- Additive only. Deletes stay rejected. Wrong rows are marked active = false and superseded_at is set.
-- The table owner (this migration) may write only while quote_sequence_begin_migration has set the
-- transaction-local flag for this sha256. App roles are not granted that function.
-- Column changes on quote_category_field_sequence are applies_when, active, and superseded_at.


alter table public.quote_category_field_sequence
  add column if not exists applies_when jsonb not null default '{}'::jsonb,
  add column if not exists active boolean not null default true,
  add column if not exists superseded_at timestamptz;
alter table public.quote_catalog_field_choice
  add column if not exists active boolean not null default true,
  add column if not exists superseded_at timestamptz;
alter table public.quote_sequence_field_alias
  add column if not exists active boolean not null default true,
  add column if not exists superseded_at timestamptz;

comment on column public.quote_category_field_sequence.applies_when is
  'When this object matches the answers, the field is required. {} means always. pending waits for an earlier field; no skips the field.';
comment on column public.quote_category_field_sequence.active is
  'False once a later migration supersedes the row. Inactive rows stay for the audit trail.';
comment on column public.quote_category_field_sequence.superseded_at is
  'When this row stopped being the current seed value.';

do $check$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.quote_category_field_sequence'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%set_by%'
  loop
    execute format('alter table public.quote_category_field_sequence drop constraint %I', constraint_name);
  end loop;
end
$check$;

alter table public.quote_category_field_sequence
  add constraint quote_category_field_sequence_set_by_check
  check (set_by in ('mike', 'jessica', 'seed', 'migration'));

create table if not exists public.quote_sequence_seed_audit (
  id bigint generated always as identity primary key,
  table_name text not null,
  action text not null check (action in ('supersede', 'replace', 'insert', 'applies_when')),
  row_key jsonb not null,
  old_row jsonb,
  new_row jsonb,
  actor text not null default 'migration' check (actor = 'migration'),
  source_sha256 text not null,
  created_at timestamptz not null default now()
);
comment on table public.quote_sequence_seed_audit is
  'Old and new quote-sequence seed values. actor is the migration. source_sha256 is the field file.';

create table if not exists public.quote_sequence_catalog_gap (
  id bigint generated always as identity primary key,
  manufacturer text not null,
  category text not null,
  field_key text,
  catalog_version text,
  status text not null check (status in ('blocked', 'incomplete')),
  reason text not null,
  source_sha256 text not null,
  created_at timestamptz not null default now()
);
comment on table public.quote_sequence_catalog_gap is
  'Catalog holes the field file left open. A null field_key blocks the product. Sundance uses category *.';

drop trigger if exists quote_sequence_seed_audit_no_direct_write on public.quote_sequence_seed_audit;
create trigger quote_sequence_seed_audit_no_direct_write
  before insert or update or delete on public.quote_sequence_seed_audit
  for each row execute function public.quote_sequence_reject_direct_write();
drop trigger if exists quote_sequence_catalog_gap_no_direct_write on public.quote_sequence_catalog_gap;
create trigger quote_sequence_catalog_gap_no_direct_write
  before insert or update or delete on public.quote_sequence_catalog_gap
  for each row execute function public.quote_sequence_reject_direct_write();


create or replace function public.quote_sequence_applies_state(
  rule jsonb,
  answers jsonb,
  p_manufacturer text,
  p_category text,
  p_version text,
  p_depth integer default 0
) returns text
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  op text;
  field text;
  raw jsonb;
  child jsonb;
  child_state text;
  saw_pending boolean := false;
  saw_yes boolean := false;
  saw_no boolean := false;
  ref_rule jsonb;
  ref_active boolean;
  answer_text text;
  wanted text;
  fabric_width numeric;
  ordered_width numeric;
begin
  if p_depth > 8 then
    return 'pending';
  end if;
  if rule is null or rule = 'null'::jsonb or rule = '{}'::jsonb then
    return 'yes';
  end if;
  op := coalesce(rule->>'op', '');
  if op = '' then
    return 'yes';
  end if;
  if op = 'not' then
    child_state := public.quote_sequence_applies_state(rule->'rule', answers, p_manufacturer, p_category, p_version, p_depth + 1);
    if child_state = 'pending' then return 'pending'; end if;
    if child_state = 'yes' then return 'no'; end if;
    return 'yes';
  end if;
  if op in ('any', 'all') then
    for child in select value from jsonb_array_elements(coalesce(rule->'rules', '[]'::jsonb)) loop
      child_state := public.quote_sequence_applies_state(child, answers, p_manufacturer, p_category, p_version, p_depth + 1);
      if child_state = 'yes' then saw_yes := true; end if;
      if child_state = 'no' then saw_no := true; end if;
      if child_state = 'pending' then saw_pending := true; end if;
    end loop;
    if op = 'any' then
      if saw_yes then return 'yes'; end if;
      if saw_pending then return 'pending'; end if;
      return 'no';
    end if;
    if saw_no then return 'no'; end if;
    if saw_pending then return 'pending'; end if;
    return 'yes';
  end if;
  if op = 'wider_than_fabric' then
    if public.quote_sequence_value_blank(answers->'ordered_width') or public.quote_sequence_value_blank(answers->'color_code') then
      return 'pending';
    end if;
    if (answers->>'ordered_width') !~ '^[0-9]+(\.[0-9]+)?$' then
      return 'no';
    end if;
    ordered_width := (answers->>'ordered_width')::numeric;
    select c.max_width into fabric_width
    from public.quote_catalog_field_choice c
    where c.manufacturer = p_manufacturer
      and c.category = p_category
      and c.catalog_version = p_version
      and c.field_key = 'color_code'
      and c.choice_value = answers->>'color_code'
      and c.active
      and c.size_rule = 'max_width'
      and public.quote_sequence_when_matches(c.when_spec, answers)
    order by c.id
    limit 1;
    if fabric_width is null then
      return 'no';
    end if;
    if ordered_width > fabric_width then return 'yes'; end if;
    return 'no';
  end if;

  field := rule->>'field';
  raw := public.quote_sequence_field_answer(answers, p_manufacturer, p_category, p_version, field);
  if public.quote_sequence_value_blank(raw) then
    select s.applies_when, s.active into ref_rule, ref_active
    from public.quote_category_field_sequence s
    where s.manufacturer = p_manufacturer
      and s.category = p_category
      and s.catalog_version = p_version
      and s.field_key = field
    limit 1;
    if ref_active is distinct from true then
      return 'no';
    end if;
    child_state := public.quote_sequence_applies_state(coalesce(ref_rule, '{}'::jsonb), answers, p_manufacturer, p_category, p_version, p_depth + 1);
    if child_state = 'no' then return 'no'; end if;
    return 'pending';
  end if;

  if jsonb_typeof(raw) = 'boolean' then
    answer_text := case when raw = 'true'::jsonb then 'true' else 'false' end;
  elsif jsonb_typeof(raw) = 'array' then
    answer_text := raw::text;
  else
    answer_text := raw #>> '{}';
  end if;

  if op = 'answered' then
    return 'yes';
  end if;
  if op = 'eq' then
    return case when lower(answer_text) = lower(coalesce(rule->>'value', '')) then 'yes' else 'no' end;
  end if;
  if op = 'neq' then
    return case when lower(answer_text) is distinct from lower(coalesce(rule->>'value', '')) then 'yes' else 'no' end;
  end if;
  if op = 'in' then
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(rule->'values', '[]'::jsonb)) as item
      where lower(item) = lower(answer_text)
    ) then
      return 'yes';
    end if;
    return 'no';
  end if;
  if op = 'not_in' then
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(rule->'values', '[]'::jsonb)) as item
      where lower(item) = lower(answer_text)
    ) then
      return 'no';
    end if;
    return 'yes';
  end if;
  if op = 'contains' then
    wanted := coalesce(rule->>'value', '');
    if jsonb_typeof(raw) = 'array' then
      if exists (
        select 1 from jsonb_array_elements_text(raw) as item
        where position(lower(wanted) in lower(item)) > 0
      ) then
        return 'yes';
      end if;
      return 'no';
    end if;
    if position(lower(wanted) in lower(answer_text)) > 0 then
      return 'yes';
    end if;
    return 'no';
  end if;
  return 'pending';
end;
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
      and c.active
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
      and c.active
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
      and lower(category) = lower(btrim(p_category)) and active
  ) versions;
  if version_count = 0 then
    return jsonb_build_object('status', 'blocked', 'reason', 'unknown manufacturer or category');
  end if;
  if p_requested is not null and btrim(p_requested) <> '' then
    select catalog_version into resolved
    from public.quote_category_field_sequence
    where lower(manufacturer) = lower(btrim(p_manufacturer))
      and lower(category) = lower(btrim(p_category)) and active
      and catalog_version = btrim(p_requested)
    limit 1;
    if resolved is null then
      return jsonb_build_object('status', 'blocked', 'reason', 'catalog version is not seeded for this category');
    end if;
    return jsonb_build_object('status', 'ok', 'catalog_version', resolved, 'manufacturer', (
      select manufacturer from public.quote_category_field_sequence
      where catalog_version = resolved and lower(manufacturer) = lower(btrim(p_manufacturer))
        and lower(category) = lower(btrim(p_category)) and active limit 1
    ), 'category', (
      select category from public.quote_category_field_sequence
      where catalog_version = resolved and lower(manufacturer) = lower(btrim(p_manufacturer))
        and lower(category) = lower(btrim(p_category)) and active limit 1
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
      and lower(category) = lower(btrim(p_category)) and active
    limit 1
  );
end;
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
        and alias.schema_field_key = p_field and alias.active
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
        and alias.schema_field_key = p_field and alias.active
        and p_answers ? alias.saved_key
        and not public.quote_sequence_value_blank(p_answers->alias.saved_key)
    ) present
  ) > 1;
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
  applies_state text;
  gap_reason text;
  requested_manufacturer text := manufacturer;
  requested_category text := category;
begin
  select g.reason into gap_reason
  from public.quote_sequence_catalog_gap g
  where requested_manufacturer is not null and btrim(requested_manufacturer) <> ''
    and requested_category is not null and btrim(requested_category) <> ''
    and lower(g.manufacturer) = lower(btrim(requested_manufacturer))
    and g.field_key is null
    and (g.category = '*' or lower(g.category) = lower(btrim(requested_category)))
  order by case when g.category = '*' then 1 else 0 end
  limit 1;
  if gap_reason is not null then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', gap_reason,
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
      where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and s.field_key = dep
    ) and not exists (
      select 1 from public.quote_sequence_field_alias alias
      where alias.manufacturer = maker and alias.category = line and alias.catalog_version = version and alias.active and alias.saved_key = dep
    ) then
      invalidated := array_append(invalidated, dep);
    end if;
  end loop;

  for rec in
    select *
    from public.quote_category_field_sequence s
    where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active
    order by s.ask_order, s.field_key
  loop
    raw := public.quote_sequence_field_answer(answers, maker, line, version, rec.field_key);
    applies_state := public.quote_sequence_applies_state(coalesce(rec.applies_when, '{}'::jsonb), kept, maker, line, version, 0);
    if applies_state = 'pending' then
      continue;
    end if;
    if applies_state = 'no' then
      if not public.quote_sequence_value_blank(raw) then
        invalidated := array_append(invalidated, rec.field_key);
        for saved_key in
          select alias.saved_key from public.quote_sequence_field_alias alias
          where alias.manufacturer = maker and alias.category = line and alias.catalog_version = version
            and alias.schema_field_key = rec.field_key and alias.active and answers ? alias.saved_key
        loop
          invalidated := array_append(invalidated, saved_key);
        end loop;
      end if;
      continue;
    end if;
    select g.reason into gap_reason
    from public.quote_sequence_catalog_gap g
    where g.manufacturer = maker and g.category = line and g.field_key = rec.field_key
      and (g.catalog_version is null or g.catalog_version = version)
    limit 1;
    if gap_reason is not null then
      return jsonb_build_object(
        'status', 'blocked',
        'reason', gap_reason,
        'field_key', rec.field_key,
        'input_kind', rec.input_kind,
        'required', rec.required,
        'ask_order', rec.ask_order,
        'choices', '[]'::jsonb,
        'invalidated', to_jsonb(invalidated),
        'kept', kept,
        'optional_field', null,
        'catalog_version', version
      );
    end if;
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
            and alias.schema_field_key = rec.field_key and alias.active and answers ? alias.saved_key
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
      where c.manufacturer = maker and c.category = line and c.catalog_version = version and c.field_key = rec.field_key and c.active;
      typed := public.quote_sequence_typed_valid(rec.field_key, raw, choice_count);
      valid := coalesce((typed->>'ok')::boolean, false);
      reason := typed->>'reason';
      if valid and choice_count > 0 and jsonb_typeof(raw) = 'object' then
        if not exists (
          select 1 from public.quote_catalog_field_choice c
          where c.manufacturer = maker and c.category = line and c.catalog_version = version
            and c.field_key = rec.field_key and c.active and c.choice_value = raw->>'fraction'
        ) then
          valid := false;
          reason := rec.field_key || ' fraction is not in the schema';
        end if;
      elsif valid and choice_count > 0 and jsonb_typeof(raw) in ('string', 'number') then
        if not exists (
          select 1 from public.quote_catalog_field_choice c
          where c.manufacturer = maker and c.category = line and c.catalog_version = version
            and c.field_key = rec.field_key and c.active and c.choice_value = raw #>> '{}'
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
          and alias.schema_field_key = rec.field_key and alias.active and answers ? alias.saved_key
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

  if next_key is null then
    for rec in
      select *
      from public.quote_category_field_sequence s
      where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and s.required
      order by s.ask_order, s.field_key
    loop
      if public.quote_sequence_applies_state(coalesce(rec.applies_when, '{}'::jsonb), kept, maker, line, version, 0) = 'pending' then
        return jsonb_build_object(
          'status', 'needs_input',
          'reason', 'conditional field is waiting on an earlier answer',
          'field_key', rec.field_key,
          'input_kind', rec.input_kind,
          'required', rec.required,
          'ask_order', rec.ask_order,
          'choices', '[]'::jsonb,
          'invalidated', to_jsonb(invalidated),
          'kept', kept,
          'optional_field', null,
          'catalog_version', version
        );
      end if;
    end loop;
  end if;

  optional_key := null;
  optional_choices := null;
  for rec in
    select *
    from public.quote_category_field_sequence s
    where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and not s.required
    order by s.ask_order, s.field_key
  loop
    if kept ? rec.field_key then
      continue;
    end if;
    if public.quote_sequence_applies_state(coalesce(rec.applies_when, '{}'::jsonb), kept, maker, line, version, 0) <> 'yes' then
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
  applies_state text;
  gap_reason text;
  requested_manufacturer text := manufacturer;
  requested_category text := category;
begin
  select g.reason into gap_reason
  from public.quote_sequence_catalog_gap g
  where requested_manufacturer is not null and btrim(requested_manufacturer) <> ''
    and requested_category is not null and btrim(requested_category) <> ''
    and lower(g.manufacturer) = lower(btrim(requested_manufacturer))
    and g.field_key is null
    and (g.category = '*' or lower(g.category) = lower(btrim(requested_category)))
  order by case when g.category = '*' then 1 else 0 end
  limit 1;
  if gap_reason is not null then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', gap_reason, 'choices', '[]'::jsonb);
  end if;
  resolved := public.quote_sequence_resolve_version(manufacturer, category, spec->>'catalog_version');
  if resolved->>'status' = 'blocked' then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', resolved->>'reason', 'choices', '[]'::jsonb);
  end if;
  maker := resolved->>'manufacturer';
  line := resolved->>'category';
  version := resolved->>'catalog_version';
  for prior in
    select s.field_key from public.quote_category_field_sequence s
    where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active
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
  where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and s.field_key = p_field_key;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'field is not in the sequence', 'choices', '[]'::jsonb);
  end if;
  select g.reason into gap_reason
  from public.quote_sequence_catalog_gap g
  where g.manufacturer = maker and g.category = line and g.field_key = p_field_key
    and (g.catalog_version is null or g.catalog_version = version)
  limit 1;
  if gap_reason is not null then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', gap_reason, 'choices', '[]'::jsonb);
  end if;
  applies_state := public.quote_sequence_applies_state(coalesce(rec.applies_when, '{}'::jsonb), answers, maker, line, version, 0);
  if applies_state = 'pending' then
    return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', 'earlier field is missing', 'choices', '[]'::jsonb);
  end if;
  if applies_state = 'no' then
    return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', 'field does not apply', 'choices', '[]'::jsonb);
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
    where c.manufacturer = maker and c.category = line and c.catalog_version = version and c.field_key = p_field_key and c.active;
    typed := public.quote_sequence_typed_valid(p_field_key, p_value, choice_count);
    if coalesce((typed->>'ok')::boolean, false) is not true then
      return jsonb_build_object('ok', false, 'status', 'needs_input', 'reason', typed->>'reason', 'choices', '[]'::jsonb);
    end if;
    if choice_count > 0 and jsonb_typeof(p_value) = 'object' and not exists (
      select 1 from public.quote_catalog_field_choice c
      where c.manufacturer = maker and c.category = line and c.catalog_version = version
        and c.field_key = p_field_key and c.active and c.choice_value = p_value->>'fraction'
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
      catalog_version, inferred, set_by, set_at, applies_when
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
      now(),
      case when p_row ? 'applies_when' then coalesce(p_row->'applies_when', '{}'::jsonb) else '{}'::jsonb end
    )
    on conflict (manufacturer, category, field_key, catalog_version) do update
      set ask_order = excluded.ask_order,
          required = excluded.required,
          input_kind = excluded.input_kind,
          depends_on = excluded.depends_on,
          inferred = excluded.inferred,
          set_by = excluded.set_by,
          set_at = excluded.set_at,
          applies_when = case
            when p_row ? 'applies_when' then excluded.applies_when
            else public.quote_category_field_sequence.applies_when
          end
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

create or replace function public.quote_sequence_begin_migration(p_sha256 text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  owner name;
begin
  select pg_get_userbyid(cls.relowner) into owner
  from pg_class cls
  join pg_namespace nsp on nsp.oid = cls.relnamespace
  where nsp.nspname = 'public' and cls.relname = 'quote_category_field_sequence';
  if owner is null or current_user is distinct from owner then
    raise exception 'quote sequence migration writes are limited to the table owner'
      using errcode = '42501';
  end if;
  if p_sha256 is distinct from '2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd' then
    raise exception 'quote sequence migration source sha256 does not match the field file'
      using errcode = '22023';
  end if;
  perform set_config('quote_sequence.admin_write', 'on', true);
end;
$fn$;

create or replace function public.quote_sequence_end_migration()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  owner name;
begin
  select pg_get_userbyid(cls.relowner) into owner
  from pg_class cls
  join pg_namespace nsp on nsp.oid = cls.relnamespace
  where nsp.nspname = 'public' and cls.relname = 'quote_category_field_sequence';
  if owner is null or current_user is distinct from owner then
    raise exception 'quote sequence migration writes are limited to the table owner'
      using errcode = '42501';
  end if;
  perform set_config('quote_sequence.admin_write', 'off', true);
end;
$fn$;

revoke all on function public.quote_sequence_begin_migration(text) from public, anon, authenticated, service_role;
revoke all on function public.quote_sequence_end_migration() from public, anon, authenticated, service_role;
revoke all on function public.quote_sequence_applies_state(jsonb, jsonb, text, text, text, integer) from public;
grant execute on function public.quote_sequence_applies_state(jsonb, jsonb, text, text, text, integer) to anon, authenticated, service_role;


do $correction$
declare
  sha text := '2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd';
  rule_count integer;
  matched_rules integer;
  prior_count integer;
  updated_count integer;
begin
  perform public.quote_sequence_begin_migration(sha);

  create temporary table field_file_rules (
    manufacturer text,
    category text,
    field_key text,
    rule jsonb
  ) on commit drop;
  insert into field_file_rules (manufacturer, category, field_key, rule)
  select manufacturer, category, field_key, rule
  from jsonb_to_recordset('[{"manufacturer":"Norman","category":"brightwood","field_key":"t_post_location","rule":{"op":"contains","field":"panel_configuration","value":"T"}},{"manufacturer":"Norman","category":"brightwood","field_key":"divider_rail_height","rule":{"op":"contains","field":"divider_panel_layout","value":"divider"}},{"manufacturer":"Norman","category":"brightwood","field_key":"build_out","rule":{"op":"contains","field":"frame_type","value":"build-out"}},{"manufacturer":"Norman","category":"brightwood","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"tilt_side","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"cord_wand_length","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"returns","rule":{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside Mount"},{"op":"all","rules":[{"op":"answered","field":"valance_type"},{"op":"not_in","field":"valance_type","values":["No","None","No Valance"]}]}]}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"side_mount_brackets","rule":{"op":"eq","field":"mount_type","value":"Inside Mount"}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"cut_out","rule":{"op":"eq","field":"obstruction","value":"Yes"}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"keystone","rule":{"op":"eq","field":"valance_splice","value":"Yes"}},{"manufacturer":"Norman","category":"citylights_aluminum","field_key":"shim_quantity","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"faux_wood","field_key":"tilt_side","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"faux_wood","field_key":"cord_wand_length","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"faux_wood","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"faux_wood","field_key":"returns","rule":{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside Mount"},{"op":"all","rules":[{"op":"answered","field":"valance_type"},{"op":"not_in","field":"valance_type","values":["No","None","No Valance"]}]}]}},{"manufacturer":"Norman","category":"faux_wood","field_key":"side_mount_brackets","rule":{"op":"eq","field":"mount_type","value":"Inside Mount"}},{"manufacturer":"Norman","category":"faux_wood","field_key":"cut_out","rule":{"op":"eq","field":"obstruction","value":"Yes"}},{"manufacturer":"Norman","category":"faux_wood","field_key":"keystone","rule":{"op":"eq","field":"valance_splice","value":"Yes"}},{"manufacturer":"Norman","category":"faux_wood","field_key":"shim_quantity","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"honeycomb","field_key":"day_night","rule":{"op":"any","rules":[{"op":"contains","field":"lift_system","value":"Day & Night"},{"op":"contains","field":"lift_system","value":"Day and Night"}]}},{"manufacturer":"Norman","category":"honeycomb","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"honeycomb","field_key":"side_mount_bracket","rule":{"op":"eq","field":"mount_type","value":"Inside Mount"}},{"manufacturer":"Norman","category":"honeycomb","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"honeycomb","field_key":"motor_power","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"normandy_painted","field_key":"t_post_location","rule":{"op":"contains","field":"panel_configuration","value":"T"}},{"manufacturer":"Norman","category":"normandy_painted","field_key":"divider_rail_height","rule":{"op":"contains","field":"divider_panel_layout","value":"divider"}},{"manufacturer":"Norman","category":"normandy_painted","field_key":"build_out","rule":{"op":"contains","field":"frame_type","value":"build-out"}},{"manufacturer":"Norman","category":"normandy_painted","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"normandy_stained","field_key":"t_post_location","rule":{"op":"contains","field":"panel_configuration","value":"T"}},{"manufacturer":"Norman","category":"normandy_stained","field_key":"divider_rail_height","rule":{"op":"contains","field":"divider_panel_layout","value":"divider"}},{"manufacturer":"Norman","category":"normandy_stained","field_key":"build_out","rule":{"op":"contains","field":"frame_type","value":"build-out"}},{"manufacturer":"Norman","category":"normandy_stained","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"palladian_shelf","field_key":"opening_angle_arch","rule":{"op":"in","field":"opening_shape","values":["Arch","Angle"]}},{"manufacturer":"Norman","category":"palladian_shelf","field_key":"mounted_product_line_item","rule":{"op":"eq","field":"shelf_ordered_with_product","value":"Yes"}},{"manufacturer":"Norman","category":"perfectsheer","field_key":"motor_power","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"perfectsheer","field_key":"remote_channel","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"perfectsheer","field_key":"valance_fabric_color","rule":{"op":"all","rules":[{"op":"answered","field":"valance_fascia"},{"op":"not_in","field":"valance_fascia","values":["No","None","No Valance"]}]}},{"manufacturer":"Norman","category":"perfectsheer","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"roller","field_key":"railroad_seam_placement","rule":{"op":"wider_than_fabric"}},{"manufacturer":"Norman","category":"roller","field_key":"clutch_motor_type","rule":{"op":"not_in","field":"control_type","values":["Cordless"]}},{"manufacturer":"Norman","category":"roller","field_key":"chain_cord_type","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Norman","category":"roller","field_key":"chain_cord_length","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Norman","category":"roller","field_key":"valance_fascia_color","rule":{"op":"neq","field":"valance_fascia_type","value":"No Valance"}},{"manufacturer":"Norman","category":"roller","field_key":"motor_brand_series","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Norman","category":"roller","field_key":"power_source","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Norman","category":"roller","field_key":"remote_channel","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Norman","category":"roller","field_key":"charging_wiring_option","rule":{"op":"any","rules":[{"op":"eq","field":"power_source","value":"Battery"},{"op":"contains","field":"power_source","value":"battery"}]}},{"manufacturer":"Norman","category":"roller","field_key":"home_automation_notes","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Norman","category":"roman","field_key":"motor_power","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"roman","field_key":"remote_channel","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"roman","field_key":"valance_fabric_color","rule":{"op":"all","rules":[{"op":"answered","field":"valance_fascia"},{"op":"not_in","field":"valance_fascia","values":["No","None","No Valance"]}]}},{"manufacturer":"Norman","category":"roman","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"smartdrape","field_key":"remote_channel","rule":{"op":"eq","field":"wand_motor","value":"Motorized"}},{"manufacturer":"Norman","category":"smartdrape","field_key":"shim_quantity","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"smartfold","field_key":"motor_power","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"smartfold","field_key":"remote_channel","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"smartfold","field_key":"valance_fabric_color","rule":{"op":"all","rules":[{"op":"answered","field":"valance_fascia"},{"op":"not_in","field":"valance_fascia","values":["No","None","No Valance"]}]}},{"manufacturer":"Norman","category":"smartfold","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"tilt_side","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"cord_wand_length","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"returns","rule":{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside Mount"},{"op":"all","rules":[{"op":"answered","field":"valance_type"},{"op":"not_in","field":"valance_type","values":["No","None","No Valance"]}]}]}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"side_mount_brackets","rule":{"op":"eq","field":"mount_type","value":"Inside Mount"}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"cut_out","rule":{"op":"eq","field":"obstruction","value":"Yes"}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"keystone","rule":{"op":"eq","field":"valance_splice","value":"Yes"}},{"manufacturer":"Norman","category":"smartprivacy_faux","field_key":"shim_quantity","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"synchrony_vertical","field_key":"valance_color","rule":{"op":"all","rules":[{"op":"answered","field":"valance_type"},{"op":"not_in","field":"valance_type","values":["No","None","No Valance"]}]}},{"manufacturer":"Norman","category":"synchrony_vertical","field_key":"shim_quantity","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"vertical_honeycomb","field_key":"day_night","rule":{"op":"any","rules":[{"op":"contains","field":"lift_system","value":"Day & Night"},{"op":"contains","field":"lift_system","value":"Day and Night"}]}},{"manufacturer":"Norman","category":"vertical_honeycomb","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"vertical_honeycomb","field_key":"side_mount_bracket","rule":{"op":"eq","field":"mount_type","value":"Inside Mount"}},{"manufacturer":"Norman","category":"vertical_honeycomb","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"vertical_honeycomb","field_key":"motor_power","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"tilt_side","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"cord_wand_length","rule":{"op":"not","rule":{"op":"any","rules":[{"op":"eq","field":"lift_system","value":"Motorized"},{"op":"contains","field":"lift_system","value":"motor"}]}}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"hold_down_brackets","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"returns","rule":{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside Mount"},{"op":"all","rules":[{"op":"answered","field":"valance_type"},{"op":"not_in","field":"valance_type","values":["No","None","No Valance"]}]}]}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"side_mount_brackets","rule":{"op":"eq","field":"mount_type","value":"Inside Mount"}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"cut_out","rule":{"op":"eq","field":"obstruction","value":"Yes"}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"keystone","rule":{"op":"eq","field":"valance_splice","value":"Yes"}},{"manufacturer":"Norman","category":"wood_blinds","field_key":"shim_quantity","rule":{"op":"eq","field":"mount_type","value":"Outside Mount"}},{"manufacturer":"Norman","category":"woodlore","field_key":"t_post_location","rule":{"op":"contains","field":"panel_configuration","value":"T"}},{"manufacturer":"Norman","category":"woodlore","field_key":"divider_rail_height","rule":{"op":"contains","field":"divider_panel_layout","value":"divider"}},{"manufacturer":"Norman","category":"woodlore","field_key":"build_out","rule":{"op":"contains","field":"frame_type","value":"build-out"}},{"manufacturer":"Norman","category":"woodlore","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"woodlore_aquashield","field_key":"t_post_location","rule":{"op":"contains","field":"panel_configuration","value":"T"}},{"manufacturer":"Norman","category":"woodlore_aquashield","field_key":"divider_rail_height","rule":{"op":"contains","field":"divider_panel_layout","value":"divider"}},{"manufacturer":"Norman","category":"woodlore_aquashield","field_key":"build_out","rule":{"op":"contains","field":"frame_type","value":"build-out"}},{"manufacturer":"Norman","category":"woodlore_aquashield","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Norman","category":"woodlore_plus","field_key":"t_post_location","rule":{"op":"contains","field":"panel_configuration","value":"T"}},{"manufacturer":"Norman","category":"woodlore_plus","field_key":"divider_rail_height","rule":{"op":"contains","field":"divider_panel_layout","value":"divider"}},{"manufacturer":"Norman","category":"woodlore_plus","field_key":"build_out","rule":{"op":"contains","field":"frame_type","value":"build-out"}},{"manufacturer":"Norman","category":"woodlore_plus","field_key":"specialty_shape","rule":{"op":"eq","field":"specialty_shape_requested","value":"Yes"}},{"manufacturer":"Onyx","category":"ash","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"ash","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"ash","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"ash","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"ash","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"ash","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"onyx_us_made_vinyl","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"onyx_us_made_vinyl","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"onyx_us_made_vinyl","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"onyx_us_made_vinyl","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"onyx_us_made_vinyl","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"onyx_us_made_vinyl","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"painted_basswood","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"painted_basswood","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"painted_basswood","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"painted_basswood","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"painted_basswood","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"painted_basswood","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"poly_composite","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"poly_composite","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"poly_composite","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"poly_composite","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"poly_composite","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"poly_composite","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"secamore","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"secamore","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"secamore","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"secamore","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"secamore","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"secamore","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"stained_basswood","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"stained_basswood","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"stained_basswood","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"stained_basswood","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"stained_basswood","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"stained_basswood","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"vinyl","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"vinyl","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"vinyl","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"vinyl","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"vinyl","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"vinyl","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Onyx","category":"vlo_hybrid","field_key":"compatibility_verification","rule":{"op":"any","rules":[{"op":"eq","field":"hinge_color","value":"Paint to Match"},{"op":"eq","field":"stile","value":"Rabbet"},{"op":"contains","field":"other_options","value":"Hidden Hinge"}]}},{"manufacturer":"Onyx","category":"vlo_hybrid","field_key":"divider_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"vlo_hybrid","field_key":"divider_exact_position","rule":{"op":"eq","field":"divider_rail","value":"Custom"}},{"manufacturer":"Onyx","category":"vlo_hybrid","field_key":"split_position","rule":{"op":"eq","field":"split_tilt_rod","value":"Custom"}},{"manufacturer":"Onyx","category":"vlo_hybrid","field_key":"french_door","rule":{"op":"eq","field":"shutter_type","value":"French Door"}},{"manufacturer":"Onyx","category":"vlo_hybrid","field_key":"specialty_reference","rule":{"op":"in","field":"shutter_type","values":["ByPass-Close","ByPass-Open","Bi-Fold Tracking","Sunburst","Half Circle","Elongated Eyebrow","Eyebrow","Circle","Oval","Quarterburst","Octagon","Sunburst Shutters","Arch Shutters","Elongated Eyebrow Shutters","Half Rake L","Full Rake","Half Rake R","Barn Door"]}},{"manufacturer":"Polar","category":"all_seasons_retractable_screen","field_key":"motor_side","rule":{"op":"in","field":"motorized","values":["Yes","Motorized","true"]}},{"manufacturer":"Polar","category":"all_seasons_retractable_screen","field_key":"power_control","rule":{"op":"in","field":"motorized","values":["Yes","Motorized","true"]}},{"manufacturer":"Polar","category":"all_seasons_retractable_screen","field_key":"wind_option","rule":{"op":"in","field":"motorized","values":["Yes","Motorized","true"]}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"motor_side","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"motor_control_type","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"power_source","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"remote_channel","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"wind_sun_sensor","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"rafter_fascia_option","rule":{"op":"any","rules":[{"op":"contains","field":"mount_surface","value":"roof"},{"op":"contains","field":"mount_surface","value":"soffit"}]}},{"manufacturer":"Polar","category":"drop_arm_window_awning","field_key":"crank_length","rule":{"op":"eq","field":"manual_motorized","value":"Manual"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"railroad_seam_placement","rule":{"op":"wider_than_fabric"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"clutch_motor_type","rule":{"op":"not_in","field":"control_type","values":["Cordless"]}},{"manufacturer":"Polar","category":"elite_patio","field_key":"chain_cord_type","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"chain_cord_length","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"valance_fascia_color","rule":{"op":"neq","field":"valance_fascia_type","value":"No Valance"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"motor_brand_series","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"power_source","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"remote_channel","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"elite_patio","field_key":"charging_wiring_option","rule":{"op":"any","rules":[{"op":"eq","field":"power_source","value":"Battery"},{"op":"contains","field":"power_source","value":"battery"}]}},{"manufacturer":"Polar","category":"elite_patio","field_key":"home_automation_notes","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"railroad_seam_placement","rule":{"op":"wider_than_fabric"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"clutch_motor_type","rule":{"op":"not_in","field":"control_type","values":["Cordless"]}},{"manufacturer":"Polar","category":"interior_roller","field_key":"chain_cord_type","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"chain_cord_length","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"valance_fascia_color","rule":{"op":"neq","field":"valance_fascia_type","value":"No Valance"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"motor_brand_series","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"power_source","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"remote_channel","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"interior_roller","field_key":"charging_wiring_option","rule":{"op":"any","rules":[{"op":"eq","field":"power_source","value":"Battery"},{"op":"contains","field":"power_source","value":"battery"}]}},{"manufacturer":"Polar","category":"interior_roller","field_key":"home_automation_notes","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"railroad_seam_placement","rule":{"op":"wider_than_fabric"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"clutch_motor_type","rule":{"op":"not_in","field":"control_type","values":["Cordless"]}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"chain_cord_type","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"chain_cord_length","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"valance_fascia_color","rule":{"op":"neq","field":"valance_fascia_type","value":"No Valance"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"motor_brand_series","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"power_source","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"remote_channel","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"charging_wiring_option","rule":{"op":"any","rules":[{"op":"eq","field":"power_source","value":"Battery"},{"op":"contains","field":"power_source","value":"battery"}]}},{"manufacturer":"Polar","category":"mega_exterior","field_key":"home_automation_notes","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"motorized_drapery_track","field_key":"bend_template_id","rule":{"op":"eq","field":"straight_bent","value":"Bent"}},{"manufacturer":"Polar","category":"motorized_drapery_track","field_key":"remote_channel","rule":{"op":"answered","field":"motor_type"}},{"manufacturer":"Polar","category":"premium_awning","field_key":"motor_side","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_awning","field_key":"motor_control_type","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_awning","field_key":"power_source","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_awning","field_key":"remote_channel","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_awning","field_key":"wind_sun_sensor","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_awning","field_key":"rafter_fascia_option","rule":{"op":"any","rules":[{"op":"contains","field":"mount_surface","value":"roof"},{"op":"contains","field":"mount_surface","value":"soffit"}]}},{"manufacturer":"Polar","category":"premium_awning","field_key":"crank_length","rule":{"op":"eq","field":"manual_motorized","value":"Manual"}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"motor_side","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"motor_control_type","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"power_source","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"remote_channel","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"wind_sun_sensor","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"rafter_fascia_option","rule":{"op":"any","rules":[{"op":"contains","field":"mount_surface","value":"roof"},{"op":"contains","field":"mount_surface","value":"soffit"}]}},{"manufacturer":"Polar","category":"premium_plus_awning","field_key":"crank_length","rule":{"op":"eq","field":"manual_motorized","value":"Manual"}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"motor_side","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"motor_control_type","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"power_source","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"remote_channel","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"wind_sun_sensor","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"rafter_fascia_option","rule":{"op":"any","rules":[{"op":"contains","field":"mount_surface","value":"roof"},{"op":"contains","field":"mount_surface","value":"soffit"}]}},{"manufacturer":"Polar","category":"premium_pro_awning","field_key":"crank_length","rule":{"op":"eq","field":"manual_motorized","value":"Manual"}},{"manufacturer":"Polar","category":"select_awning","field_key":"motor_side","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"select_awning","field_key":"motor_control_type","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"select_awning","field_key":"power_source","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"select_awning","field_key":"remote_channel","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"select_awning","field_key":"wind_sun_sensor","rule":{"op":"eq","field":"manual_motorized","value":"Motorized"}},{"manufacturer":"Polar","category":"select_awning","field_key":"rafter_fascia_option","rule":{"op":"any","rules":[{"op":"contains","field":"mount_surface","value":"roof"},{"op":"contains","field":"mount_surface","value":"soffit"}]}},{"manufacturer":"Polar","category":"select_awning","field_key":"crank_length","rule":{"op":"eq","field":"manual_motorized","value":"Manual"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"railroad_seam_placement","rule":{"op":"wider_than_fabric"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"clutch_motor_type","rule":{"op":"not_in","field":"control_type","values":["Cordless"]}},{"manufacturer":"Polar","category":"titan_patio","field_key":"chain_cord_type","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"chain_cord_length","rule":{"op":"eq","field":"control_type","value":"Continuous Cord Loop"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"valance_fascia_color","rule":{"op":"neq","field":"valance_fascia_type","value":"No Valance"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"motor_brand_series","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"power_source","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"remote_channel","rule":{"op":"eq","field":"control_type","value":"Motorized"}},{"manufacturer":"Polar","category":"titan_patio","field_key":"charging_wiring_option","rule":{"op":"any","rules":[{"op":"eq","field":"power_source","value":"Battery"},{"op":"contains","field":"power_source","value":"battery"}]}},{"manufacturer":"Polar","category":"titan_patio","field_key":"home_automation_notes","rule":{"op":"eq","field":"control_type","value":"Motorized"}}]'::jsonb)
    as incoming(manufacturer text, category text, field_key text, rule jsonb);

  select count(*) into rule_count from field_file_rules;
  select count(*) into matched_rules
  from field_file_rules incoming
  join public.quote_category_field_sequence sequence
    on sequence.manufacturer = incoming.manufacturer
   and sequence.category = incoming.category
   and sequence.field_key = incoming.field_key;
  if matched_rules <> rule_count then
    raise exception 'field file conditional field is not in quote_category_field_sequence (% of %)', matched_rules, rule_count;
  end if;

  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_category_field_sequence', 'applies_when',
    jsonb_build_object('manufacturer', sequence.manufacturer, 'category', sequence.category, 'field_key', sequence.field_key, 'catalog_version', sequence.catalog_version),
    jsonb_build_object('applies_when', sequence.applies_when),
    jsonb_build_object('applies_when', incoming.rule),
    'migration', sha
  from public.quote_category_field_sequence sequence
  join field_file_rules incoming
    on sequence.manufacturer = incoming.manufacturer
   and sequence.category = incoming.category
   and sequence.field_key = incoming.field_key
  where sequence.applies_when is distinct from incoming.rule;

  update public.quote_category_field_sequence sequence
  set applies_when = incoming.rule
  from field_file_rules incoming
  where sequence.manufacturer = incoming.manufacturer
    and sequence.category = incoming.category
    and sequence.field_key = incoming.field_key;

  create temporary table polar_product_fields (field_key text primary key) on commit drop;
  insert into polar_product_fields (field_key) values ('collection'), ('pattern_style'), ('color_name'), ('color_code'), ('openness_opacity'), ('railroad_seam_placement'), ('roll_type'), ('control_type'), ('control_side'), ('clutch_motor_type'), ('chain_cord_type'), ('chain_cord_length'), ('valance_fascia_type'), ('valance_fascia_color'), ('end_caps'), ('light_channels'), ('hem_bar'), ('bottom_treatment'), ('motorized'), ('motor_brand_series'), ('power_source'), ('remote_channel'), ('charging_wiring_option'), ('home_automation_notes');

  with old_rows as (
    select * from public.quote_category_field_sequence
    where manufacturer = 'Polar'
      and category in ('elite_patio', 'interior_roller', 'mega_exterior', 'titan_patio')
      and field_key in (select field_key from polar_product_fields)
      and active
  ),
  new_rows as (
    update public.quote_category_field_sequence sequence
    set active = false, superseded_at = now()
    from old_rows
    where sequence.manufacturer = old_rows.manufacturer
      and sequence.category = old_rows.category
      and sequence.field_key = old_rows.field_key
      and sequence.catalog_version = old_rows.catalog_version
    returning sequence.*
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_category_field_sequence', 'supersede',
    jsonb_build_object('manufacturer', old_rows.manufacturer, 'category', old_rows.category, 'field_key', old_rows.field_key, 'catalog_version', old_rows.catalog_version),
    to_jsonb(old_rows), to_jsonb(new_rows), 'migration', sha
  from old_rows
  join new_rows
    on new_rows.manufacturer = old_rows.manufacturer
   and new_rows.category = old_rows.category
   and new_rows.field_key = old_rows.field_key
   and new_rows.catalog_version = old_rows.catalog_version;
  get diagnostics updated_count = row_count;
  if updated_count <> (select count(*) from polar_product_fields) * 4 then
    raise exception 'polar roller field supersede count was %', updated_count;
  end if;

  with old_rows as (
    select choice.*
    from public.quote_catalog_field_choice choice
    where choice.manufacturer = 'Polar'
      and choice.category in ('elite_patio', 'interior_roller', 'mega_exterior', 'titan_patio')
      and choice.field_key in (select field_key from polar_product_fields)
      and choice.active
  ),
  new_rows as (
    update public.quote_catalog_field_choice choice
    set active = false, superseded_at = now()
    from old_rows
    where choice.id = old_rows.id
    returning choice.*
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_catalog_field_choice', 'supersede',
    jsonb_build_object('id', old_rows.id, 'manufacturer', old_rows.manufacturer, 'category', old_rows.category, 'field_key', old_rows.field_key, 'choice_value', old_rows.choice_value),
    to_jsonb(old_rows), to_jsonb(new_rows), 'migration', sha
  from old_rows
  join new_rows on new_rows.id = old_rows.id;

  with old_rows as (
    select alias.*
    from public.quote_sequence_field_alias alias
    where alias.manufacturer = 'Polar'
      and alias.category in ('elite_patio', 'interior_roller', 'mega_exterior', 'titan_patio')
      and alias.schema_field_key in (select field_key from polar_product_fields)
  ),
  new_rows as (
    update public.quote_sequence_field_alias alias
    set active = false, superseded_at = now()
    from old_rows
    where alias.manufacturer = old_rows.manufacturer
      and alias.category = old_rows.category
      and alias.schema_field_key = old_rows.schema_field_key
      and alias.saved_key = old_rows.saved_key
      and alias.catalog_version = old_rows.catalog_version
    returning alias.*
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_sequence_field_alias', 'supersede',
    jsonb_build_object('manufacturer', old_rows.manufacturer, 'category', old_rows.category, 'schema_field_key', old_rows.schema_field_key, 'saved_key', old_rows.saved_key),
    to_jsonb(old_rows), to_jsonb(new_rows), 'migration', sha
  from old_rows
  join new_rows
    on new_rows.manufacturer = old_rows.manufacturer
   and new_rows.category = old_rows.category
   and new_rows.schema_field_key = old_rows.schema_field_key
   and new_rows.saved_key = old_rows.saved_key
   and new_rows.catalog_version = old_rows.catalog_version;

  create temporary table polar_new_fields (
    field_key text,
    ask_order integer,
    primary key (field_key)
  ) on commit drop;
  insert into polar_new_fields (field_key, ask_order) values ('guide', 42), ('motor', 43), ('valance', 44), ('hardware_color', 45);

  with inserted as (
    insert into public.quote_category_field_sequence (
      manufacturer, category, field_key, ask_order, required, input_kind, depends_on,
      catalog_version, inferred, set_by, set_at, applies_when, active
    )
    select 'Polar', versions.category, fields.field_key, fields.ask_order, true, 'buttons', '{}'::text[],
      versions.catalog_version, false, 'migration', now(), '{}'::jsonb, true
    from (
      select distinct category, catalog_version
      from public.quote_category_field_sequence
      where manufacturer = 'Polar' and category in ('elite_patio', 'interior_roller', 'mega_exterior', 'titan_patio')
    ) versions
    cross join polar_new_fields fields
    returning *
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_category_field_sequence', 'insert',
    jsonb_build_object('manufacturer', inserted.manufacturer, 'category', inserted.category, 'field_key', inserted.field_key),
    null, to_jsonb(inserted), 'migration', sha
  from inserted;
  get diagnostics updated_count = row_count;
  if updated_count <> 16 then
    raise exception 'polar replacement field insert count was %', updated_count;
  end if;

  create temporary table polar_new_choices (field_key text, choice_value text) on commit drop;
  insert into polar_new_choices (field_key, choice_value) values
    ('guide', 'Cable'),
    ('guide', 'Side Channel'),
    ('guide', 'ZipRite track'),
    ('motor', 'Somfy Standard'),
    ('motor', 'Somfy RTS'),
    ('motor', 'Somfy RS485'),
    ('valance', 'Cassette'),
    ('valance', 'Hood'),
    ('valance', 'Head pocket'),
    ('hardware_color', 'White'),
    ('hardware_color', 'Tan'),
    ('hardware_color', 'Bronze'),
    ('hardware_color', 'Sand'),
    ('hardware_color', 'Camel'),
    ('hardware_color', 'Black'),
    ('hardware_color', 'Custom RAL');

  with inserted as (
    insert into public.quote_catalog_field_choice (
      manufacturer, category, field_key, choice_value, choice_label, catalog_version,
      when_spec, min_width, max_width, min_height, max_height, size_rule, active
    )
    select 'Polar', versions.category, choices.field_key, choices.choice_value, choices.choice_value,
      versions.catalog_version, '{}'::jsonb, null, null, null, null, 'none', true
    from (
      select distinct category, catalog_version
      from public.quote_category_field_sequence
      where manufacturer = 'Polar' and category in ('elite_patio', 'interior_roller', 'mega_exterior', 'titan_patio') and active
    ) versions
    cross join polar_new_choices choices
    returning *
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_catalog_field_choice', 'insert',
    jsonb_build_object('id', inserted.id, 'manufacturer', inserted.manufacturer, 'category', inserted.category, 'field_key', inserted.field_key, 'choice_value', inserted.choice_value),
    null, to_jsonb(inserted), 'migration', sha
  from inserted;

  with old_rows as (
    select choice.*
    from public.quote_catalog_field_choice choice
    where choice.manufacturer = 'Norman'
      and choice.category in ('citylights_aluminum', 'faux_wood', 'honeycomb', 'palladian_shelf', 'smartprivacy_faux', 'vertical_honeycomb', 'wood_blinds')
      and choice.field_key in ('color_name', 'color_code')
      and choice.active
  ),
  new_rows as (
    update public.quote_catalog_field_choice choice
    set active = false, superseded_at = now()
    from old_rows
    where choice.id = old_rows.id
    returning choice.*
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_catalog_field_choice', 'supersede',
    jsonb_build_object('id', old_rows.id, 'manufacturer', old_rows.manufacturer, 'category', old_rows.category, 'field_key', old_rows.field_key, 'choice_value', old_rows.choice_value),
    to_jsonb(old_rows), to_jsonb(new_rows), 'migration', sha
  from old_rows
  join new_rows on new_rows.id = old_rows.id;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Norman blind and honeycomb roller colors were not superseded';
  end if;

  insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256)
  select 'Norman', sequence.category, sequence.field_key, sequence.catalog_version, 'incomplete',
    'color_name/color_code choices were the Norman roller fabric list. Real color list needed.', sha
  from public.quote_category_field_sequence sequence
  where sequence.manufacturer = 'Norman'
    and sequence.category in ('citylights_aluminum', 'faux_wood', 'honeycomb', 'palladian_shelf', 'smartprivacy_faux', 'vertical_honeycomb', 'wood_blinds')
    and sequence.field_key in ('color_name', 'color_code');

  create temporary table soluna_valance_map (old_value text, new_value text, new_label text) on commit drop;
  insert into soluna_valance_map (old_value, new_value, new_label) values
    ('Square Fascia*', 'F001', 'Square Fascia'),
    ('Plain Curved Fascia*', 'F002', 'Plain Curved Fascia'),
    ('Curved Fascia with Fabric*', 'F009', 'Curved Fascia with Fabric'),
    ('3 1/2" Fabric Valance*', 'F010', '3 1/2" Fabric Valance'),
    ('4 1/2" Fabric Valance*', 'F011', '4 1/2" Fabric Valance'),
    ('6" Fabric Valance*', 'F014', '6 inch Fabric Valance'),
    ('8" Fabric Valance*', 'F017', '8" Fabric Valance'),
    ('4 1/2" Modern Wood Valance*', 'MOD', '4 1/2" Modern Wood Valance'),
    ('Cassette*', 'F013', 'Cassette');

  select count(*) into prior_count from public.quote_catalog_field_choice choice
  join soluna_valance_map map on map.old_value = choice.choice_value
  where choice.manufacturer = 'Norman' and choice.category = 'roller' and choice.field_key = 'valance_fascia_type';
  if prior_count <> (select count(*) from soluna_valance_map) then
    raise exception 'Soluna valance rows did not match the Norman code map (% )', prior_count;
  end if;

  with old_rows as (
    select choice.*
    from public.quote_catalog_field_choice choice
    join soluna_valance_map map on map.old_value = choice.choice_value
    where choice.manufacturer = 'Norman' and choice.category = 'roller' and choice.field_key = 'valance_fascia_type'
  ),
  new_rows as (
    update public.quote_catalog_field_choice choice
    set choice_value = map.new_value, choice_label = map.new_label
    from soluna_valance_map map
    where choice.manufacturer = 'Norman' and choice.category = 'roller' and choice.field_key = 'valance_fascia_type'
      and choice.choice_value = map.old_value
    returning choice.*
  )
  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_catalog_field_choice', 'replace',
    jsonb_build_object('id', old_rows.id, 'manufacturer', 'Norman', 'category', 'roller', 'field_key', 'valance_fascia_type', 'choice_value', old_rows.choice_value),
    to_jsonb(old_rows), to_jsonb(new_rows), 'migration', sha
  from old_rows
  join new_rows on new_rows.id = old_rows.id;

  if exists (
    select 1 from public.quote_catalog_field_choice
    where manufacturer = 'Norman' and category = 'roller' and field_key = 'valance_fascia_type'
      and (choice_label like '%*' or choice_value like '%*')
  ) then
    raise exception 'Soluna valance still carries a surcharge asterisk';
  end if;
  if not exists (
    select 1 from public.quote_catalog_field_choice
    where manufacturer = 'Norman' and category = 'roller' and field_key = 'valance_fascia_type'
      and choice_value = 'F014' and choice_label = '6 inch Fabric Valance' and active
  ) then
    raise exception 'Soluna 6 inch fabric valance code F014 was not written';
  end if;

  insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256)
  select 'Onyx', 'onyx_us_made_vinyl', null, sequence.catalog_version, 'blocked', 'BLOCKED: Onyx US Made Vinyl has no portal material mapped (registry portal_material null). Shutter type, frame, color, louver lists unknown.', sha
  from public.quote_category_field_sequence sequence
  where sequence.manufacturer = 'Onyx' and sequence.category = 'onyx_us_made_vinyl'
  limit 1;
  insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256)
  select 'Onyx', 'poly_composite', null, sequence.catalog_version, 'incomplete', 'Check: registry maps Poly Composite to portal material ''Vinyl''; confirm on the portal that this is right, since there is no separate Poly material.', sha
  from public.quote_category_field_sequence sequence
  where sequence.manufacturer = 'Onyx' and sequence.category = 'poly_composite'
  limit 1;
  insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256)
  values ('Sundance', '*', null, null, 'blocked', 'No order schema in public/order-form-templates and nothing seeded in quote_category_field_sequence (seed script: "Sundance has no schema and is left unseeded"). Repo has pricing/assortment audits (docs/quote-audits/sundance-*) for cellular, roller, zebra, vertical (incl. stock), horizontal, Walden, privacy/portfolio, SheerView, EuroPanel, exterior zip, drapery track (src/lib/quote/sundance/drapery-track.portal.json), but no order-entry field list. Not counted in the 43.', sha);

  insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
  select 'quote_sequence_catalog_gap', 'insert',
    jsonb_build_object('manufacturer', gap.manufacturer, 'category', gap.category, 'field_key', gap.field_key),
    null, to_jsonb(gap), 'migration', sha
  from public.quote_sequence_catalog_gap gap;

  if exists (
    select 1
    from (values
      ('color_code', 'fabric_color_code'),
      ('color_name', 'fabric_color_name'),
      ('collection', 'fabric_collection'),
      ('collection', 'fabric_color_collection'),
      ('control_type', 'lift_system'),
      ('valance_fascia_type', 'valance'),
      ('valance_fascia_type', 'roller_top_treatment'),
      ('valance_fascia_type', 'top_treatment_class'),
      ('panel_configuration', 'panel_config'),
      ('room_location', 'room_name')
    ) as required(schema_field_key, saved_key)
    where not exists (
      select 1 from public.quote_sequence_field_alias alias
      where alias.schema_field_key = required.schema_field_key
        and alias.saved_key = required.saved_key
        and alias.active
    )
  ) then
    raise exception 'one of the seven CRM field aliases is missing';
  end if;

  if exists (
    select 1 from public.quote_catalog_field_choice
    where manufacturer = 'Norman'
      and category in ('citylights_aluminum', 'faux_wood', 'honeycomb', 'palladian_shelf', 'smartprivacy_faux', 'vertical_honeycomb', 'wood_blinds')
      and field_key in ('color_name', 'color_code')
      and active
  ) then
    raise exception 'an active Norman roller color remains on a blind or honeycomb';
  end if;

  perform public.quote_sequence_end_migration();
end
$correction$;


alter table public.quote_sequence_seed_audit enable row level security;
alter table public.quote_sequence_catalog_gap enable row level security;
alter table public.quote_sequence_seed_audit force row level security;
alter table public.quote_sequence_catalog_gap force row level security;
drop policy if exists quote_sequence_seed_audit_read on public.quote_sequence_seed_audit;
create policy quote_sequence_seed_audit_read on public.quote_sequence_seed_audit for select to anon, authenticated, service_role using (true);
drop policy if exists quote_sequence_catalog_gap_read on public.quote_sequence_catalog_gap;
create policy quote_sequence_catalog_gap_read on public.quote_sequence_catalog_gap for select to anon, authenticated, service_role using (true);
grant select on public.quote_sequence_seed_audit, public.quote_sequence_catalog_gap to anon, authenticated, service_role;
