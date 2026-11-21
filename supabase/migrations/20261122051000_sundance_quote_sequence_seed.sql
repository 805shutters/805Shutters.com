-- Seed Sundance from data/order-entry/805-sundance-order-fields.json.
-- Source sha256: e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656
-- Stacked on the #113 audited write path. Insert and upsert only.
-- The #113 Sundance wildcard gap stays. A category with active rows is no longer
-- hidden by that wildcard. Product-level gaps still block products the file marks blocked.
-- Account numbers are not seeded.

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
  if p_sha256 not in ('2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656') then
    raise exception 'quote sequence migration source sha256 does not match the field file'
      using errcode = '22023';
  end if;
  perform set_config('quote_sequence.admin_write', 'on', true);
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
    and (
      lower(g.category) = lower(btrim(requested_category))
      or (
        g.category = '*'
        and not exists (
          select 1
          from public.quote_category_field_sequence seeded
          where lower(seeded.manufacturer) = lower(btrim(requested_manufacturer))
            and lower(seeded.category) = lower(btrim(requested_category))
            and seeded.active
        )
      )
    )
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
    and (
      lower(g.category) = lower(btrim(requested_category))
      or (
        g.category = '*'
        and not exists (
          select 1
          from public.quote_category_field_sequence seeded
          where lower(seeded.manufacturer) = lower(btrim(requested_manufacturer))
            and lower(seeded.category) = lower(btrim(requested_category))
            and seeded.active
        )
      )
    )
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

do $sundance$
declare
  sha text := 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656';
begin
  perform public.quote_sequence_begin_migration(sha);

  create temporary table sundance_seed_sequence_counts as
    select manufacturer, count(*)::bigint as rows
    from public.quote_category_field_sequence
    where manufacturer <> 'Sundance'
    group by manufacturer;
  create temporary table sundance_seed_choice_counts as
    select manufacturer, count(*)::bigint as rows
    from public.quote_catalog_field_choice
    where manufacturer <> 'Sundance'
    group by manufacturer;
  create temporary table sundance_seed_alias_counts as
    select manufacturer, count(*)::bigint as rows
    from public.quote_sequence_field_alias
    where manufacturer <> 'Sundance'
    group by manufacturer;
  create temporary table sundance_seed_gap_counts as
    select manufacturer, count(*)::bigint as rows
    from public.quote_sequence_catalog_gap
    where manufacturer <> 'Sundance'
    group by manufacturer;

insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_sheerview', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'vane_size', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'light_control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'headrail', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'headrail_finish', 24, true, 'buttons', array['headrail']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"answered","field":"headrail"}'::jsonb),
('Sundance', 'sundance_sheerview', 'control', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'motor_type', 26, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_sheerview', 'cord_option', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"continuous cord loop"}'::jsonb),
('Sundance', 'sundance_sheerview', 'control_side', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_sheerview', 'charger', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_sheerview', 'remote_control', 30, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_sheerview', 'mount_depth_flush', 31, true, 'typed', array['mount_type','headrail']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"eq","field":"mount_type","value":"Inside"},{"op":"answered","field":"headrail"}]}'::jsonb),
('Sundance', 'sundance_sheerview', 'line_note', 32, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_zebra', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'chain_color', 22, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"beaded chain"}'::jsonb),
('Sundance', 'sundance_zebra', 'control_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'cassette', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'cassette_color', 25, true, 'buttons', array['cassette']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'assembly', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'alignment_group', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'cutouts', 28, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_zebra', 'charger_qty', 29, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"}]}'::jsonb),
('Sundance', 'sundance_zebra', 'remote_qty', 30, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_zebra', 'line_note', 31, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_louvolite_zebra', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 22, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"beaded chain"}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'control_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'cassette', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'cassette_color', 25, true, 'buttons', array['cassette']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'assembly', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'alignment_group', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'cutouts', 28, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'charger_qty', 29, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"}]}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'remote_qty', 30, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_louvolite_zebra', 'line_note', 31, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'control_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'chain_color', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"beaded chain"},{"op":"contains","field":"control","value":"clutch"}]}'::jsonb),
('Sundance', 'sundance_roller', 'roll', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'top_treatment', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'top_finish', 26, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"top_treatment","value":"Open roll"}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_roller', 'fabric_insert', 27, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"top_treatment","value":"round cassette"}'::jsonb),
('Sundance', 'sundance_roller', 'bottomrail', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'bottomrail_color', 29, true, 'buttons', array['bottomrail']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"bottomrail","value":"exposed"}'::jsonb),
('Sundance', 'sundance_roller', 'tube', 30, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_roller', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'railroad', 32, true, 'buttons', array['fabric_color','width']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'privacy', 33, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'privacy_color', 34, true, 'buttons', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'sundance_roller', 'privacy_length', 35, true, 'typed', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'sundance_roller', 'assembly', 36, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_roller', 'dual_bracket', 37, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"assembly","value":"dual"}'::jsonb),
('Sundance', 'sundance_roller', 'remote', 38, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_roller', 'charger_power', 39, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_roller', 'line_note', 40, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'control_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"beaded chain"},{"op":"contains","field":"control","value":"clutch"}]}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'roll', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'top_finish', 26, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"top_treatment","value":"Open roll"}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_louvolite_roller', 'fabric_insert', 27, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"top_treatment","value":"round cassette"}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'bottomrail', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'bottomrail_color', 29, true, 'buttons', array['bottomrail']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"bottomrail","value":"exposed"}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'tube', 30, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'railroad', 32, true, 'buttons', array['fabric_color','width']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'privacy', 33, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'privacy_color', 34, true, 'buttons', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'privacy_length', 35, true, 'typed', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'assembly', 36, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'dual_bracket', 37, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"assembly","value":"dual"}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'remote', 38, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 39, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_louvolite_roller', 'line_note', 40, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'control_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'chain_color', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"beaded chain"},{"op":"contains","field":"control","value":"clutch"}]}'::jsonb),
('Sundance', 'sundance_flat_roman', 'hold_down', 24, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'railroad', 25, true, 'buttons', array['fabric_color','width']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'assembly', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_flat_roman', 'remote', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_flat_roman', 'charger_power', 28, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_flat_roman', 'line_note', 29, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_flat_roman', 'valance', 30, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'control_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"beaded chain"},{"op":"contains","field":"control","value":"clutch"}]}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'hold_down', 24, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'railroad', 25, true, 'buttons', array['fabric_color','width']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'assembly', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'remote', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 28, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'line_note', 29, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_flat_roman', 'valance', 30, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_europanels', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'panel_count', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'track_channels', 22, true, 'buttons', array['panel_count']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'wand_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'draw', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'valance', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_europanels', 'panel_layout', 26, true, 'typed', array['panel_count','width']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"answered","field":"panel_count"},{"op":"answered","field":"width"}]}'::jsonb),
('Sundance', 'sundance_europanels', 'line_note', 27, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_louvolite_europanels', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'panel_count', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'track_channels', 22, true, 'buttons', array['panel_count']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'wand_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'draw', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'valance', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'panel_layout', 26, true, 'typed', array['panel_count','width']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"answered","field":"panel_count"},{"op":"answered","field":"width"}]}'::jsonb),
('Sundance', 'sundance_louvolite_europanels', 'line_note', 27, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'light_control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'system', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'headrail_color', 23, true, 'buttons', array['fabric_color','system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'recess', 24, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_cellular', 'mount_depth', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_cellular', 'bottom_fabric', 26, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"day/night"}'::jsonb),
('Sundance', 'sundance_cellular', 'verticell_stack', 27, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"verticell"}'::jsonb),
('Sundance', 'sundance_cellular', 'motor_type', 28, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"system","value":"motor"},{"op":"contains","field":"system","value":"somfy"},{"op":"contains","field":"system","value":"simphony"},{"op":"contains","field":"system","value":"alpha"},{"op":"contains","field":"system","value":"li-ion"},{"op":"contains","field":"system","value":"li-on"},{"op":"contains","field":"system","value":"rechargeable"},{"op":"contains","field":"system","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular', 'charger', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular', 'solar_panel', 30, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular', 'remote', 31, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular', 'assembly', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_cellular', 'cutouts', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'shape', 34, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"specialty"}'::jsonb),
('Sundance', 'sundance_cellular', 'shape_geometry', 35, true, 'buttons', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"answered","field":"shape"}'::jsonb),
('Sundance', 'sundance_cellular', 'shape_sides', 36, true, 'typed', array['shape_geometry']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"shape_geometry","value":"Non-perfect"}'::jsonb),
('Sundance', 'sundance_cellular', 'template_reference', 37, true, 'typed', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"shape","value":"specialty"}'::jsonb),
('Sundance', 'sundance_cellular', 'motor_size_limit', 38, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular', 'line_note', 39, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'light_control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'system', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'headrail_color', 23, true, 'buttons', array['fabric_color','system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'recess', 24, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_verticell', 'mount_depth', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_verticell', 'bottom_fabric', 26, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"day/night"}'::jsonb),
('Sundance', 'sundance_verticell', 'verticell_stack', 27, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"verticell"}'::jsonb),
('Sundance', 'sundance_verticell', 'motor_type', 28, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"system","value":"motor"},{"op":"contains","field":"system","value":"somfy"},{"op":"contains","field":"system","value":"simphony"},{"op":"contains","field":"system","value":"alpha"},{"op":"contains","field":"system","value":"li-ion"},{"op":"contains","field":"system","value":"li-on"},{"op":"contains","field":"system","value":"rechargeable"},{"op":"contains","field":"system","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_verticell', 'charger', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_verticell', 'solar_panel', 30, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_verticell', 'remote', 31, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_verticell', 'assembly', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'cutouts', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_verticell', 'shape', 34, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"specialty"}'::jsonb),
('Sundance', 'sundance_verticell', 'shape_geometry', 35, true, 'buttons', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"answered","field":"shape"}'::jsonb),
('Sundance', 'sundance_verticell', 'shape_sides', 36, true, 'typed', array['shape_geometry']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"shape_geometry","value":"Non-perfect"}'::jsonb),
('Sundance', 'sundance_verticell', 'template_reference', 37, true, 'typed', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"shape","value":"specialty"}'::jsonb),
('Sundance', 'sundance_verticell', 'motor_size_limit', 38, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_verticell', 'line_note', 39, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'light_control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'system', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'headrail_color', 23, true, 'buttons', array['fabric_color','system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'recess', 24, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'mount_depth', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'bottom_fabric', 26, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"day/night"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'verticell_stack', 27, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"verticell"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'motor_type', 28, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"system","value":"motor"},{"op":"contains","field":"system","value":"somfy"},{"op":"contains","field":"system","value":"simphony"},{"op":"contains","field":"system","value":"alpha"},{"op":"contains","field":"system","value":"li-ion"},{"op":"contains","field":"system","value":"li-on"},{"op":"contains","field":"system","value":"rechargeable"},{"op":"contains","field":"system","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'charger', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'solar_panel', 30, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'remote', 31, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'assembly', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'cutouts', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'shape', 34, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"specialty"}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_cellular_shapes', 'shape_geometry', 35, true, 'buttons', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"answered","field":"shape"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'shape_sides', 36, true, 'typed', array['shape_geometry']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"shape_geometry","value":"Non-perfect"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'template_reference', 37, true, 'typed', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"shape","value":"specialty"}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'motor_size_limit', 38, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_cellular_shapes', 'line_note', 39, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_advantage_ii_2', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_advantage_ii_2_5', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_advantage_ii_2_5', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_premium_ii_2', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_premium_ii_2', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_premium_ii_2_5', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_premium_ii_2_5', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_aluminum_1', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'grade', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'cutout_sides', 22, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'extension_pole_qty', 23, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'lift_system', 24, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'wand_tilt_side', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'valance', 26, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'valance_corners', 27, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'valance_size_return', 28, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'ladder', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'tape_code', 30, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'assembly', 31, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'connection', 32, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'hold_down', 33, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'spacer', 34, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'flush_depth', 35, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_aluminum_1', 'line_note', 36, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'lift_system', 21, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'wand_tilt_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'valance', 23, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_aluminum_2', 'valance_corners', 24, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'valance_size_return', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'ladder', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'tape_code', 27, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'assembly', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'connection', 29, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'hold_down', 30, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'spacer', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'flush_depth', 32, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_aluminum_2', 'line_note', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'lift_system', 21, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'wand_tilt_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'valance', 23, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'valance_corners', 24, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'valance_size_return', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_basicvue', 'ladder', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'tape_code', 27, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_basicvue', 'assembly', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'connection', 29, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_basicvue', 'hold_down', 30, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_basicvue', 'spacer', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_basicvue', 'flush_depth', 32, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_basicvue', 'line_note', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'lift_system', 21, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'wand_tilt_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'valance', 23, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'valance_corners', 24, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'valance_size_return', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'ladder', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'tape_code', 27, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'assembly', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'connection', 29, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'hold_down', 30, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'spacer', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'flush_depth', 32, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_chateau_woods', 'line_note', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_vertical_essence', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'stack', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'stack_side', 22, true, 'buttons', array['stack']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'control', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'bracket', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'valance', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'valance_returns', 26, true, 'buttons', array['valance','mount_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"neq","field":"valance","value":"None"},{"op":"eq","field":"mount_type","value":"Outside"}]}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'flush', 27, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'fulfillment', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'vane_count', 29, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'deductions', 30, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vertical_essence', 'line_note', 31, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_stock_vertical', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'stack', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'stack_side', 22, true, 'buttons', array['stack']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'control', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'flush', 24, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'vane_count', 25, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'deductions', 26, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'line_note', 27, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'square_corner_valance', 28, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'cut_down', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_stock_vertical', 'pickup', 30, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'style', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'control_side', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"clutch"},{"op":"contains","field":"control","value":"wand"},{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_walden_premier', 'chain', 24, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"clutch and loop"}'::jsonb),
('Sundance', 'sundance_walden_premier', 'wand_length', 25, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"pro wand"}'::jsonb),
('Sundance', 'sundance_walden_premier', 'wand_color', 26, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"pro wand"}'::jsonb),
('Sundance', 'sundance_walden_premier', 'motor_type', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_premier', 'charger', 28, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_premier', 'remote', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_premier', 'lining', 30, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'edge_binding', 31, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"answered","field":"fabric_color"}]}'::jsonb),
('Sundance', 'sundance_walden_premier', 'twin_shade', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'front_mount', 33, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'multi_blind', 34, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'returns', 35, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'return_material', 36, true, 'buttons', array['returns']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"returns","value":"None"}'::jsonb),
('Sundance', 'sundance_walden_premier', 'flush_depth', 37, true, 'typed', array['mount_type','control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_walden_premier', 'assembly', 38, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'interior_valance', 39, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'valance_headrail', 40, true, 'buttons', array['style']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"style","value":"Valance Only"}'::jsonb),
('Sundance', 'sundance_walden_premier', 'cutout_qty', 41, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'hold_down', 42, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_premier', 'line_note', 43, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_walden_select', 'style', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'control_side', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"clutch"},{"op":"contains","field":"control","value":"wand"},{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_select', 'chain', 24, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"clutch and loop"}'::jsonb),
('Sundance', 'sundance_walden_select', 'wand_length', 25, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"pro wand"}'::jsonb),
('Sundance', 'sundance_walden_select', 'wand_color', 26, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"pro wand"}'::jsonb),
('Sundance', 'sundance_walden_select', 'motor_type', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_select', 'charger', 28, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_select', 'remote', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_walden_select', 'lining', 30, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'edge_binding', 31, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"answered","field":"fabric_color"}]}'::jsonb),
('Sundance', 'sundance_walden_select', 'twin_shade', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'front_mount', 33, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'multi_blind', 34, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'returns', 35, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'return_material', 36, true, 'buttons', array['returns']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"returns","value":"None"}'::jsonb),
('Sundance', 'sundance_walden_select', 'flush_depth', 37, true, 'typed', array['mount_type','control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_walden_select', 'assembly', 38, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'interior_valance', 39, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'valance_headrail', 40, true, 'buttons', array['style']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"style","value":"Valance Only"}'::jsonb),
('Sundance', 'sundance_walden_select', 'cutout_qty', 41, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'hold_down', 42, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_walden_select', 'line_note', 43, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_portfolio_roman', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'shade_style', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'drop', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'control', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'control_side', 24, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"clutch"},{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'wand_length_color', 25, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"wand"}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'charger_qty', 26, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"}]}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'remote', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'liner', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'panel_alignment', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'returns', 30, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'front_valance', 31, true, 'buttons', array['drop']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"drop","value":"Waterfall"}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'back_valance', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'interior_valance', 33, true, 'buttons', array['drop']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"drop","value":"Waterfall"}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'valance_depth_length', 34, true, 'typed', array['front_valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"front_valance","value":"Added"}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'mount_depth', 35, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'assembly', 36, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_portfolio_roman', 'line_note', 37, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_exterior_zip', 'price_class', 21, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'motor_remote_accessories', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'housing_color_mount_detail', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_zip', 'line_note', 25, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_exterior_cable', 'line_note', 20, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_drapery_track', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'track_width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'motor_type', 18, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'headrail_color', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'motor_position', 20, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"motor_type","value":"No"}'::jsonb),
('Sundance', 'sundance_drapery_track', 'curved_track', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'stack_type', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'drapery_style', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'remote_control', 24, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"motor_type","value":"No"}'::jsonb),
('Sundance', 'sundance_drapery_track', 'mount_type', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_drapery_track', 'line_note', 26, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'shutter_options', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_wood_shutters', 'line_note', 21, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'sundance_vinyl_shutters', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'shutter_options', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'sundance_vinyl_shutters', 'line_note', 21, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'shade_style', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'drop', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'control_side', 24, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"clutch"},{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'wand_length_color', 25, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"wand"}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'charger_qty', 26, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"}]}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'remote', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:portfolio_soft_roman', 'liner', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'panel_alignment', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'returns', 30, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'front_valance', 31, true, 'buttons', array['drop']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"drop","value":"Waterfall"}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'back_valance', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'interior_valance', 33, true, 'buttons', array['drop']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"drop","value":"Waterfall"}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'valance_depth_length', 34, true, 'typed', array['front_valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"front_valance","value":"Added"}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'mount_depth', 35, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'assembly', 36, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:portfolio_soft_roman', 'line_note', 37, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'style', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'control_side', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"clutch"},{"op":"contains","field":"control","value":"wand"},{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:wovenwood', 'chain', 24, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"clutch and loop"}'::jsonb),
('Sundance', 'order_type:wovenwood', 'wand_length', 25, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"pro wand"}'::jsonb),
('Sundance', 'order_type:wovenwood', 'wand_color', 26, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"pro wand"}'::jsonb),
('Sundance', 'order_type:wovenwood', 'motor_type', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:wovenwood', 'charger', 28, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:wovenwood', 'remote', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:wovenwood', 'lining', 30, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:wovenwood', 'edge_binding', 31, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"answered","field":"fabric_color"}]}'::jsonb),
('Sundance', 'order_type:wovenwood', 'twin_shade', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'front_mount', 33, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'multi_blind', 34, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'returns', 35, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'return_material', 36, true, 'buttons', array['returns']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"returns","value":"None"}'::jsonb),
('Sundance', 'order_type:wovenwood', 'flush_depth', 37, true, 'typed', array['mount_type','control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:wovenwood', 'assembly', 38, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'interior_valance', 39, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'valance_headrail', 40, true, 'buttons', array['style']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"style","value":"Valance Only"}'::jsonb),
('Sundance', 'order_type:wovenwood', 'cutout_qty', 41, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'hold_down', 42, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:wovenwood', 'line_note', 43, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'panel_count', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'track_channels', 22, true, 'buttons', array['panel_count']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'wand_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'draw', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'valance', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:euro_panel', 'panel_layout', 26, true, 'typed', array['panel_count','width']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"answered","field":"panel_count"},{"op":"answered","field":"width"}]}'::jsonb),
('Sundance', 'order_type:euro_panel', 'line_note', 27, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:cellular_shade', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'light_control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'system', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'headrail_color', 23, true, 'buttons', array['fabric_color','system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'recess', 24, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'mount_depth', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'bottom_fabric', 26, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"day/night"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'verticell_stack', 27, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"verticell"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'motor_type', 28, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"system","value":"motor"},{"op":"contains","field":"system","value":"somfy"},{"op":"contains","field":"system","value":"simphony"},{"op":"contains","field":"system","value":"alpha"},{"op":"contains","field":"system","value":"li-ion"},{"op":"contains","field":"system","value":"li-on"},{"op":"contains","field":"system","value":"rechargeable"},{"op":"contains","field":"system","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'charger', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'solar_panel', 30, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'remote', 31, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'assembly', 32, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'cutouts', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'shape', 34, true, 'buttons', array['system']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"system","value":"specialty"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'shape_geometry', 35, true, 'buttons', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"answered","field":"shape"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'shape_sides', 36, true, 'typed', array['shape_geometry']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"shape_geometry","value":"Non-perfect"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'template_reference', 37, true, 'typed', array['shape']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"shape","value":"specialty"}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'motor_size_limit', 38, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:cellular_shade', 'line_note', 39, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:clutch_roller', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'control_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'chain_color', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"beaded chain"},{"op":"contains","field":"control","value":"clutch"}]}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'roll', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'top_treatment', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'top_finish', 26, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"top_treatment","value":"Open roll"}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'fabric_insert', 27, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"top_treatment","value":"round cassette"}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'bottomrail', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'bottomrail_color', 29, true, 'buttons', array['bottomrail']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"bottomrail","value":"exposed"}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'tube', 30, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'railroad', 32, true, 'buttons', array['fabric_color','width']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'privacy', 33, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'privacy_color', 34, true, 'buttons', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'privacy_length', 35, true, 'typed', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'assembly', 36, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'dual_bracket', 37, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"assembly","value":"dual"}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'remote', 38, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'charger_power', 39, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:clutch_roller', 'line_note', 40, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:caress_zebra', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'chain_color', 22, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"beaded chain"}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'control_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'cassette', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'cassette_color', 25, true, 'buttons', array['cassette']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'assembly', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'alignment_group', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'cutouts', 28, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'charger_qty', 29, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"}]}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'remote_qty', 30, true, 'typed', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:caress_zebra', 'line_note', 31, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:sheerview_plus', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'vane_size', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'light_control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'headrail', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 24, true, 'buttons', array['headrail']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"answered","field":"headrail"}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'control', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'motor_type', 26, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'cord_option', 27, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"control","value":"continuous cord loop"}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'control_side', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'charger', 29, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'remote_control', 30, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"motor_type","value":"motor"},{"op":"contains","field":"motor_type","value":"somfy"},{"op":"contains","field":"motor_type","value":"simphony"},{"op":"contains","field":"motor_type","value":"alpha"},{"op":"contains","field":"motor_type","value":"li-ion"},{"op":"contains","field":"motor_type","value":"li-on"},{"op":"contains","field":"motor_type","value":"rechargeable"},{"op":"contains","field":"motor_type","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'mount_depth_flush', 31, true, 'typed', array['mount_type','headrail']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"eq","field":"mount_type","value":"Inside"},{"op":"answered","field":"headrail"}]}'::jsonb),
('Sundance', 'order_type:sheerview_plus', 'line_note', 32, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:motorized_roller', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'control', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'control_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'chain_color', 23, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"beaded chain"},{"op":"contains","field":"control","value":"clutch"}]}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'roll', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'top_treatment', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'top_finish', 26, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"top_treatment","value":"Open roll"}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'fabric_insert', 27, true, 'buttons', array['top_treatment']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"top_treatment","value":"round cassette"}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'bottomrail', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'bottomrail_color', 29, true, 'buttons', array['bottomrail']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"bottomrail","value":"exposed"}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'tube', 30, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'railroad', 32, true, 'buttons', array['fabric_color','width']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'privacy', 33, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'privacy_color', 34, true, 'buttons', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'privacy_length', 35, true, 'typed', array['privacy']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"privacy","value":"None"}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'assembly', 36, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'dual_bracket', 37, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"assembly","value":"dual"}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'remote', 38, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'charger_power', 39, true, 'buttons', array['control']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"contains","field":"control","value":"motor"},{"op":"contains","field":"control","value":"somfy"},{"op":"contains","field":"control","value":"simphony"},{"op":"contains","field":"control","value":"alpha"},{"op":"contains","field":"control","value":"li-ion"},{"op":"contains","field":"control","value":"li-on"},{"op":"contains","field":"control","value":"rechargeable"},{"op":"contains","field":"control","value":"wirefree"}]}'::jsonb),
('Sundance', 'order_type:motorized_roller', 'line_note', 40, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:zipper_screen_exterior', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'price_class', 21, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'control', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'motor_remote_accessories', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'housing_color_mount_detail', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:zipper_screen_exterior', 'line_note', 25, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'grade', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'cutout_sides', 22, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'extension_pole_qty', 23, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'lift_system', 24, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'wand_tilt_side', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'valance', 26, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'valance_corners', 27, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'valance_size_return', 28, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'ladder', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'tape_code', 30, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'assembly', 31, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'connection', 32, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'hold_down', 33, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:1_inch_aluminum', 'spacer', 34, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'flush_depth', 35, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:1_inch_aluminum', 'line_note', 36, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'lift_system', 21, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'wand_tilt_side', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'valance', 23, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'valance_corners', 24, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'valance_size_return', 25, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'ladder', 26, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'tape_code', 27, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'assembly', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'connection', 29, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'hold_down', 30, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'spacer', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'flush_depth', 32, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:2_inch_aluminum', 'line_note', 33, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:vertical_essence', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'stack', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'stack_side', 22, true, 'buttons', array['stack']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'control', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'bracket', 24, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'valance', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'valance_returns', 26, true, 'buttons', array['valance','mount_type']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"all","rules":[{"op":"neq","field":"valance","value":"None"},{"op":"eq","field":"mount_type","value":"Outside"}]}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'flush', 27, true, 'buttons', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'fulfillment', 28, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'vane_count', 29, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'deductions', 30, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:vertical_essence', 'line_note', 31, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:2_inch_advantage', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:2_inch_advantage', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:2_5_inch_advantage', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:2_5_inch_advantage', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:2_inch_wood', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:2_inch_wood', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'height', 18, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'mount_type', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'fabric_color', 20, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'extra_valance', 21, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'lift_system', 22, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'wand_tilt_side', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'valance', 24, true, 'buttons', array['fabric_color']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'valance_corners', 25, false, 'buttons', array['valance']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'valance_size_return', 26, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"any","rules":[{"op":"eq","field":"mount_type","value":"Outside"},{"op":"contains","field":"mount_type","value":"custom"}]}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'ladder', 27, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'tape_code', 28, true, 'buttons', array['ladder']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"contains","field":"ladder","value":"tape"}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'assembly', 29, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'connection', 30, true, 'buttons', array['assembly']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"assembly","value":"Single"}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'hold_down', 31, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';
insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at, applies_when) values
('Sundance', 'order_type:2_5_inch_wood', 'spacer', 32, false, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'flush_depth', 33, true, 'typed', array['mount_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"eq","field":"mount_type","value":"Inside"}'::jsonb),
('Sundance', 'order_type:2_5_inch_wood', 'line_note', 34, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'customer_name', 1, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'quote_number', 2, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'order_draft_name', 3, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'account_number', 4, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'po_number', 5, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'sidemark', 6, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'delivery_method', 7, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'ship_to_name', 8, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'ship_to_address', 9, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'ship_to_zip', 10, true, 'typed', array['ship_to_name']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'bill_to', 11, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'contact_phone_email', 12, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'special_instructions', 13, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'order_date', 14, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'room_name', 15, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'quantity', 16, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'track_width', 17, true, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'motor_type', 18, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'headrail_color', 19, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'motor_position', 20, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"motor_type","value":"No"}'::jsonb),
('Sundance', 'order_type:glydea_track', 'curved_track', 21, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'stack_type', 22, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'drapery_style', 23, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'remote_control', 24, true, 'buttons', array['motor_type']::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{"op":"neq","field":"motor_type","value":"No"}'::jsonb),
('Sundance', 'order_type:glydea_track', 'mount_type', 25, true, 'buttons', '{}'::text[], 'sundance-assortment-2026-09-26-r15', true, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb),
('Sundance', 'order_type:glydea_track', 'line_note', 26, false, 'typed', '{}'::text[], 'sundance-assortment-2026-09-26-r15', false, 'migration', timestamptz '2026-11-21 18:18:00+00', '{}'::jsonb)
on conflict (manufacturer, category, field_key, catalog_version) do update set
  ask_order = excluded.ask_order,
  required = excluded.required,
  input_kind = excluded.input_kind,
  depends_on = excluded.depends_on,
  catalog_version = excluded.catalog_version,
  inferred = excluded.inferred,
  set_by = excluded.set_by,
  set_at = excluded.set_at,
  applies_when = excluded.applies_when
where public.quote_category_field_sequence.manufacturer = 'Sundance';

insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_sheerview', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'vane_size', '2"', '2"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'vane_size', '2.5"', '2.5"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'vane_size', '3"', '3"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'light_control', 'Light Filtering (LF)', 'Light Filtering (LF)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'light_control', 'Room Darkening', 'Room Darkening', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'S113 Snow White', 'S113 Snow White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-322 Beige', 'LD-322 Beige', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-L334 Pecan', 'LD-L334 Pecan', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-S113 White', 'LD-S113 White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-S302 Sesame', 'LD-S302 Sesame', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-S378 Cocoa', 'LD-S378 Cocoa', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-S414 Cornsilk', 'LD-S414 Cornsilk', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-S503 Dolphin Gray', 'LD-S503 Dolphin Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-S823 Rattan', 'LD-S823 Rattan', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-V110 Night Sky', 'LD-V110 Night Sky', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-V113 Blueberry', 'LD-V113 Blueberry', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'headrail_finish', 'LD-ZY090 Sage', 'LD-ZY090 Sage', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'control', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'control', 'Continuous Cord Loop', 'Continuous Cord Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'control', 'Rechargeable Motor with Wand', 'Rechargeable Motor with Wand', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'motor_type', 'SIMPHONY 30 Li-On MOTOR (Rechargeable)', 'SIMPHONY 30 Li-On MOTOR (Rechargeable)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'motor_type', 'SONESSE 30 Somfy rechargeable', 'SONESSE 30 Somfy rechargeable', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_sheerview', 'remote_control', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette', '3-inch Small Rounded with Fabric Insert (std 3" round)', '3-inch Small Rounded with Fabric Insert (std 3" round)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette', '3-inch Square Aluminum', '3-inch Square Aluminum', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'cassette_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_zebra', 'assembly', 'multi-shade', 'multi-shade', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_louvolite_zebra', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette', '3-inch Small Rounded with Fabric Insert (std 3" round)', '3-inch Small Rounded with Fabric Insert (std 3" round)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette', '3-inch Square Aluminum', '3-inch Square Aluminum', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'cassette_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_zebra', 'assembly', 'multi-shade', 'multi-shade', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'roll', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'roll', 'Reverse', 'Reverse', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', 'Open roll', 'Open roll', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', 'Fascia 3" / 4" / 5"', 'Fascia 3" / 4" / 5"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', '5" Contractor''s box', '5" Contractor''s box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', '3" Sm round cassette', '3" Sm round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', '4" Lg round cassette', '4" Lg round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', '3" Square cassette', '3" Square cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'top_treatment', '4" Tuscany', '4" Tuscany', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'fabric_insert', 'Y', 'Y', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'fabric_insert', 'N', 'N', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail', 'Standard Hem Pocket (default)', 'Standard Hem Pocket (default)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail', 'Exposed', 'Exposed', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail', 'Wrap-around', 'Wrap-around', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail', 'Enhanced Fabric-Wrapped', 'Enhanced Fabric-Wrapped', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_roller', 'bottomrail_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'bottomrail_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'railroad', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'railroad', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'privacy', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'privacy', 'Aluminum side channels', 'Aluminum side channels', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'privacy', 'Solar bar', 'Solar bar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'assembly', 'Dual independent', 'Dual independent', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'assembly', 'Coupled motorized', 'Coupled motorized', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'dual_bracket', 'Vertical', 'Vertical', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'dual_bracket', 'Small 45-degree', 'Small 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'dual_bracket', 'Large 45-degree', 'Large 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Somfy Li-ion V2 charger', 'Somfy Li-ion V2 charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Somfy 24V supply', 'Somfy 24V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Somfy 12V supply', 'Somfy 12V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Somfy battery', 'Somfy battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Somfy solar kit', 'Somfy solar kit', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Alpha charger/battery', 'Alpha charger/battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Simphony charger/solar', 'Simphony charger/solar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Simphony 24V transformer', 'Simphony 24V transformer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_roller', 'charger_power', 'Simphony 24V distribution box', 'Simphony 24V distribution box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'roll', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'roll', 'Reverse', 'Reverse', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', 'Open roll', 'Open roll', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', 'Fascia 3" / 4" / 5"', 'Fascia 3" / 4" / 5"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', '5" Contractor''s box', '5" Contractor''s box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', '3" Sm round cassette', '3" Sm round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', '4" Lg round cassette', '4" Lg round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', '3" Square cassette', '3" Square cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'top_treatment', '4" Tuscany', '4" Tuscany', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'fabric_insert', 'Y', 'Y', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_louvolite_roller', 'fabric_insert', 'N', 'N', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail', 'Standard Hem Pocket (default)', 'Standard Hem Pocket (default)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail', 'Exposed', 'Exposed', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail', 'Wrap-around', 'Wrap-around', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail', 'Enhanced Fabric-Wrapped', 'Enhanced Fabric-Wrapped', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'bottomrail_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'railroad', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'railroad', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'privacy', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'privacy', 'Aluminum side channels', 'Aluminum side channels', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'privacy', 'Solar bar', 'Solar bar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'assembly', 'Dual independent', 'Dual independent', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'assembly', 'Coupled motorized', 'Coupled motorized', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'dual_bracket', 'Vertical', 'Vertical', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'dual_bracket', 'Small 45-degree', 'Small 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'dual_bracket', 'Large 45-degree', 'Large 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Somfy Li-ion V2 charger', 'Somfy Li-ion V2 charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Somfy 24V supply', 'Somfy 24V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Somfy 12V supply', 'Somfy 12V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Somfy battery', 'Somfy battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Somfy solar kit', 'Somfy solar kit', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Alpha charger/battery', 'Alpha charger/battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Simphony charger/solar', 'Simphony charger/solar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Simphony 24V transformer', 'Simphony 24V transformer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_roller', 'charger_power', 'Simphony 24V distribution box', 'Simphony 24V distribution box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'railroad', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'railroad', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_flat_roman', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'assembly', 'Dual independent', 'Dual independent', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'assembly', 'Coupled motorized', 'Coupled motorized', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Somfy Li-ion V2 charger', 'Somfy Li-ion V2 charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Somfy 24V supply', 'Somfy 24V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Somfy 12V supply', 'Somfy 12V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Somfy battery', 'Somfy battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Somfy solar kit', 'Somfy solar kit', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Alpha charger/battery', 'Alpha charger/battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Simphony charger/solar', 'Simphony charger/solar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Simphony 24V transformer', 'Simphony 24V transformer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'charger_power', 'Simphony 24V distribution box', 'Simphony 24V distribution box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_flat_roman', 'valance', 'Rounded-corner valance', 'Rounded-corner valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'railroad', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'railroad', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'assembly', 'Dual independent', 'Dual independent', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'assembly', 'Coupled motorized', 'Coupled motorized', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Somfy Li-ion V2 charger', 'Somfy Li-ion V2 charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Somfy 24V supply', 'Somfy 24V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Somfy 12V supply', 'Somfy 12V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Somfy battery', 'Somfy battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Somfy solar kit', 'Somfy solar kit', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Alpha charger/battery', 'Alpha charger/battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Simphony charger/solar', 'Simphony charger/solar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Simphony 24V transformer', 'Simphony 24V transformer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'charger_power', 'Simphony 24V distribution box', 'Simphony 24V distribution box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_flat_roman', 'valance', 'Rounded-corner valance', 'Rounded-corner valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'panel_count', '2', '2', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_europanels', 'panel_count', '3', '3', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'panel_count', '4', '4', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'panel_count', '5', '5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'wand_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'wand_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'draw', '1-way Left', '1-way Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'draw', '1-way Right', '1-way Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_europanels', 'valance', 'Round', 'Round', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'panel_count', '2', '2', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'panel_count', '3', '3', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'panel_count', '4', '4', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'panel_count', '5', '5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'wand_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'wand_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'draw', '1-way Left', '1-way Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'draw', '1-way Right', '1-way Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_louvolite_europanels', 'valance', 'Round', 'Round', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'light_control', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'light_control', 'Blackout', 'Blackout', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Cordless Top Down/Bottom Up', 'Cordless Top Down/Bottom Up', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Cordless Day/Night', 'Cordless Day/Night', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Cordloop', 'Cordloop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Skylight', 'Skylight', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Verticell', 'Verticell', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Somfy Cord Lift WireFree TL25', 'Somfy Cord Lift WireFree TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Simphony Cell Shade WireFree', 'Simphony Cell Shade WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Simphony Concerto TDBU', 'Simphony Concerto TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'system', 'Specialty Shape', 'Specialty Shape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'recess', 'Flush', 'Flush', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'recess', 'Partial recess', 'Partial recess', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'verticell_stack', 'Left Stack', 'Left Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'verticell_stack', 'Right Stack', 'Right Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'verticell_stack', 'Center Split', 'Center Split', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'motor_type', 'Somfy TL25', 'Somfy TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'motor_type', 'Simphony WireFree', 'Simphony WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'motor_type', 'Simphony Concerto', 'Simphony Concerto', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'charger', 'Somfy charger', 'Somfy charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'solar_panel', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_cellular', 'solar_panel', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape', 'Standard Arch', 'Standard Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape', 'Quarter Arch', 'Quarter Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape', 'Circle', 'Circle', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape', 'Hexagon', 'Hexagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape', 'Octagon', 'Octagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape_geometry', 'Perfect', 'Perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular', 'shape_geometry', 'Non-perfect', 'Non-perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'light_control', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'light_control', 'Blackout', 'Blackout', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Cordless Top Down/Bottom Up', 'Cordless Top Down/Bottom Up', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Cordless Day/Night', 'Cordless Day/Night', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Cordloop', 'Cordloop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Skylight', 'Skylight', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Verticell', 'Verticell', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Somfy Cord Lift WireFree TL25', 'Somfy Cord Lift WireFree TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Simphony Cell Shade WireFree', 'Simphony Cell Shade WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Simphony Concerto TDBU', 'Simphony Concerto TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'system', 'Specialty Shape', 'Specialty Shape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'recess', 'Flush', 'Flush', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'recess', 'Partial recess', 'Partial recess', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'verticell_stack', 'Left Stack', 'Left Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'verticell_stack', 'Right Stack', 'Right Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'verticell_stack', 'Center Split', 'Center Split', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'motor_type', 'Somfy TL25', 'Somfy TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'motor_type', 'Simphony WireFree', 'Simphony WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'motor_type', 'Simphony Concerto', 'Simphony Concerto', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'charger', 'Somfy charger', 'Somfy charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'solar_panel', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'solar_panel', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape', 'Standard Arch', 'Standard Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape', 'Quarter Arch', 'Quarter Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape', 'Circle', 'Circle', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape', 'Hexagon', 'Hexagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape', 'Octagon', 'Octagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape_geometry', 'Perfect', 'Perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_verticell', 'shape_geometry', 'Non-perfect', 'Non-perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_cellular_shapes', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'light_control', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'light_control', 'Blackout', 'Blackout', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Cordless Top Down/Bottom Up', 'Cordless Top Down/Bottom Up', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Cordless Day/Night', 'Cordless Day/Night', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Cordloop', 'Cordloop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Skylight', 'Skylight', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Verticell', 'Verticell', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Somfy Cord Lift WireFree TL25', 'Somfy Cord Lift WireFree TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Simphony Cell Shade WireFree', 'Simphony Cell Shade WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Simphony Concerto TDBU', 'Simphony Concerto TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'system', 'Specialty Shape', 'Specialty Shape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'recess', 'Flush', 'Flush', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'recess', 'Partial recess', 'Partial recess', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'verticell_stack', 'Left Stack', 'Left Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'verticell_stack', 'Right Stack', 'Right Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'verticell_stack', 'Center Split', 'Center Split', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'motor_type', 'Somfy TL25', 'Somfy TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'motor_type', 'Simphony WireFree', 'Simphony WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'motor_type', 'Simphony Concerto', 'Simphony Concerto', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'charger', 'Somfy charger', 'Somfy charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'solar_panel', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'solar_panel', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape', 'Standard Arch', 'Standard Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape', 'Quarter Arch', 'Quarter Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape', 'Circle', 'Circle', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape', 'Hexagon', 'Hexagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape', 'Octagon', 'Octagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape_geometry', 'Perfect', 'Perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_cellular_shapes', 'shape_geometry', 'Non-perfect', 'Non-perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_advantage_ii_2', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_advantage_ii_2_5', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_premium_ii_2', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_premium_ii_2_5', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'grade', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'grade', 'Premium', 'Premium', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_1', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_aluminum_2', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_aluminum_2', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_basicvue', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_chateau_woods', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_chateau_woods', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'stack', 'One Way', 'One Way', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'stack', 'Split', 'Split', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'control', 'Wand Right', 'Wand Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'control', 'Wand Left', 'Wand Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'bracket', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'bracket', '3-inch extension', '3-inch extension', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'bracket', '4-inch extension', '4-inch extension', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'bracket', '4 5/8-inch L-bracket', '4 5/8-inch L-bracket', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'valance', 'No Valance', 'No Valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'valance', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'valance', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'valance', 'Crown only ($7/ft net)', 'Crown only ($7/ft net)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'valance', 'Crown with dust cover', 'Crown with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'flush', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'flush', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'fulfillment', 'Complete blind', 'Complete blind', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'fulfillment', 'Track only ($0.95/in, 3 ft min)', 'Track only ($0.95/in, 3 ft min)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vertical_essence', 'fulfillment', 'Vanes only', 'Vanes only', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'stack', 'One Way only', 'One Way only', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'control', 'Wand Right', 'Wand Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'control', 'Wand Left', 'Wand Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'flush', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'flush', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'square_corner_valance', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'square_corner_valance', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'cut_down', 'Stock size', 'Stock size', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'cut_down', 'Cut width', 'Cut width', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'cut_down', 'Cut height', 'Cut height', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_stock_vertical', 'cut_down', 'Cut both', 'Cut both', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'style', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'style', 'Waterfall', 'Waterfall', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'style', 'Valance Only', 'Valance Only', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control', 'Cordless (15-96")', 'Cordless (15-96")', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control', 'Cordless TDBU', 'Cordless TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control', 'Clutch and Loop', 'Clutch and Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control', 'Pro Wand', 'Pro Wand', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control', 'Standard LI Motor', 'Standard LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control', 'Power Lift LI Motor', 'Power Lift LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_walden_premier', 'control', 'Somfy Sonesse Ultra 30', 'Somfy Sonesse Ultra 30', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'wand_length', '24', '24', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'wand_length', '36', '36', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'wand_length', '48', '48', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'wand_length', '60 in', '60 in', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'motor_type', 'Standard Lift', 'Standard Lift', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'motor_type', 'Ultra 30 Somfy Li-ion', 'Ultra 30 Somfy Li-ion', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'charger', 'charger16', 'charger16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'remote', 'Standard Lift 1- or 15-ch', 'Standard Lift 1- or 15-ch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'remote', 'Somfy Situo 1/5/16', 'Somfy Situo 1/5/16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'lining', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'lining', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'twin_shade', 'NO', 'NO', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'twin_shade', 'YES', 'YES', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'multi_blind', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'multi_blind', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'returns', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'returns', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'returns', 'Extended', 'Extended', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'return_material', 'Shade fabric', 'Shade fabric', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'return_material', 'Edge binding fabric', 'Edge binding fabric', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'interior_valance', 'Standard when unlined or light-filtering', 'Standard when unlined or light-filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'interior_valance', 'Requested interior valance', 'Requested interior valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'valance_headrail', 'Loose', 'Loose', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'valance_headrail', '1', '1', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'valance_headrail', '1.5', '1.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'valance_headrail', '2.5', '2.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'valance_headrail', '3.5', '3.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'valance_headrail', '5', '5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_premier', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'style', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'style', 'Waterfall', 'Waterfall', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'style', 'Valance Only', 'Valance Only', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control', 'Cordless (15-96")', 'Cordless (15-96")', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control', 'Cordless TDBU', 'Cordless TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control', 'Clutch and Loop', 'Clutch and Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control', 'Pro Wand', 'Pro Wand', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_walden_select', 'control', 'Standard LI Motor', 'Standard LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control', 'Somfy Sonesse Ultra 30', 'Somfy Sonesse Ultra 30', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'wand_length', '24', '24', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'wand_length', '36', '36', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'wand_length', '48', '48', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'wand_length', '60 in', '60 in', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'motor_type', 'Standard Lift', 'Standard Lift', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'motor_type', 'Ultra 30 Somfy Li-ion', 'Ultra 30 Somfy Li-ion', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'charger', 'charger16', 'charger16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'remote', 'Standard Lift 1- or 15-ch', 'Standard Lift 1- or 15-ch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'remote', 'Somfy Situo 1/5/16', 'Somfy Situo 1/5/16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'lining', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'lining', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'twin_shade', 'NO', 'NO', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'twin_shade', 'YES', 'YES', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'multi_blind', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'multi_blind', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'returns', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'returns', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'returns', 'Extended', 'Extended', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'return_material', 'Shade fabric', 'Shade fabric', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'return_material', 'Edge binding fabric', 'Edge binding fabric', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'interior_valance', 'Standard when unlined or light-filtering', 'Standard when unlined or light-filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'interior_valance', 'Requested interior valance', 'Requested interior valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'valance_headrail', 'Loose', 'Loose', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'valance_headrail', '1', '1', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'valance_headrail', '1.5', '1.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'valance_headrail', '2.5', '2.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'valance_headrail', '3.5', '3.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'valance_headrail', '5', '5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_walden_select', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'shade_style', 'Flat', 'Flat', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'shade_style', 'Flat with Ribs', 'Flat with Ribs', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'shade_style', 'Knife Pleat', 'Knife Pleat', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'shade_style', 'Front Slat', 'Front Slat', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'shade_style', 'Hobbled', 'Hobbled', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'drop', 'Standard (w/ valance)', 'Standard (w/ valance)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_portfolio_roman', 'drop', 'Waterfall', 'Waterfall', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control', 'Cordless TDBU', 'Cordless TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control', 'Clutch and Loop', 'Clutch and Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control', 'Somfy Sonesse Ultra 30', 'Somfy Sonesse Ultra 30', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control', 'Standard LI Motor', 'Standard LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control', 'Power Lift', 'Power Lift', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'remote', '15-channel', '15-channel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'remote', 'Somfy Situo 1/5/16', 'Somfy Situo 1/5/16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'liner', 'LF03 Light-Filtering Ivory', 'LF03 Light-Filtering Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'liner', 'LF02 Light-Filtering Snow White', 'LF02 Light-Filtering Snow White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'liner', 'BO01 Black-Out White', 'BO01 Black-Out White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'returns', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'returns', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'returns', 'Extended', 'Extended', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'front_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'front_valance', 'Added', 'Added', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'back_valance', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'back_valance', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'interior_valance', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'interior_valance', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_portfolio_roman', 'assembly', 'multi', 'multi', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_zip', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_zip', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_zip', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_zip', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_zip', 'price_class', 'standard', 'standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_zip', 'price_class', 'premium', 'premium', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_cable', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_cable', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_cable', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_exterior_cable', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_type', 'GLYDEA MOTOR /1.O NM/ 110 VOLTS', 'GLYDEA MOTOR /1.O NM/ 110 VOLTS', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_type', 'GLYDEA MOTOR/ 0.6 NM /110 VOLTS', 'GLYDEA MOTOR/ 0.6 NM /110 VOLTS', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_type', 'IRISMO 35/ 24VOLTS/ 0.6 NM (WITH TRANSFORMER)', 'IRISMO 35/ 24VOLTS/ 0.6 NM (WITH TRANSFORMER)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_type', 'IRISMO 45/LI-ON RECHARGEABLE/0.8 NM', 'IRISMO 45/LI-ON RECHARGEABLE/0.8 NM', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'headrail_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'headrail_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_position', 'Motor Left', 'Motor Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'motor_position', 'Motor Right', 'Motor Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'curved_track', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'curved_track', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'stack_type', 'ONE WAY LEFT', 'ONE WAY LEFT', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'stack_type', 'ONE WAY RIGHT', 'ONE WAY RIGHT', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'sundance_drapery_track', 'stack_type', 'Split.', 'Split.', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'drapery_style', 'Pinch Pleat Drapery Style', 'Pinch Pleat Drapery Style', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'drapery_style', 'Ripple Fold Drapery style.', 'Ripple Fold Drapery style.', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'remote_control', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'remote_control', 'Situo 1 (Single Line)', 'Situo 1 (Single Line)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'remote_control', 'Situo 5 (5 Lines)', 'Situo 5 (5 Lines)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_drapery_track', 'remote_control', 'Telis 16', 'Telis 16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_wood_shutters', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_wood_shutters', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_wood_shutters', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_wood_shutters', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vinyl_shutters', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vinyl_shutters', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vinyl_shutters', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'sundance_vinyl_shutters', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'shade_style', 'Flat', 'Flat', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'shade_style', 'Flat with Ribs', 'Flat with Ribs', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'shade_style', 'Knife Pleat', 'Knife Pleat', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'shade_style', 'Front Slat', 'Front Slat', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'shade_style', 'Hobbled', 'Hobbled', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'drop', 'Standard (w/ valance)', 'Standard (w/ valance)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'drop', 'Waterfall', 'Waterfall', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 'Cordless TDBU', 'Cordless TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 'Clutch and Loop', 'Clutch and Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 'Somfy Sonesse Ultra 30', 'Somfy Sonesse Ultra 30', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 'Standard LI Motor', 'Standard LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control', 'Power Lift', 'Power Lift', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'remote', '15-channel', '15-channel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'remote', 'Somfy Situo 1/5/16', 'Somfy Situo 1/5/16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'liner', 'LF03 Light-Filtering Ivory', 'LF03 Light-Filtering Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'liner', 'LF02 Light-Filtering Snow White', 'LF02 Light-Filtering Snow White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'liner', 'BO01 Black-Out White', 'BO01 Black-Out White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'returns', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'returns', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'returns', 'Extended', 'Extended', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'front_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'front_valance', 'Added', 'Added', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'back_valance', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'back_valance', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'interior_valance', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'interior_valance', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:portfolio_soft_roman', 'assembly', 'multi', 'multi', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:wovenwood', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'style', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'style', 'Waterfall', 'Waterfall', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'style', 'Valance Only', 'Valance Only', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Cordless (15-96")', 'Cordless (15-96")', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Cordless TDBU', 'Cordless TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Clutch and Loop', 'Clutch and Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Pro Wand', 'Pro Wand', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Standard LI Motor', 'Standard LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Power Lift LI Motor', 'Power Lift LI Motor', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control', 'Somfy Sonesse Ultra 30', 'Somfy Sonesse Ultra 30', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'wand_length', '24', '24', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'wand_length', '36', '36', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'wand_length', '48', '48', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'wand_length', '60 in', '60 in', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'motor_type', 'Standard Lift', 'Standard Lift', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'motor_type', 'Ultra 30 Somfy Li-ion', 'Ultra 30 Somfy Li-ion', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'charger', 'charger16', 'charger16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'remote', 'Standard Lift 1- or 15-ch', 'Standard Lift 1- or 15-ch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'remote', 'Somfy Situo 1/5/16', 'Somfy Situo 1/5/16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'lining', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'lining', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'twin_shade', 'NO', 'NO', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'twin_shade', 'YES', 'YES', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'multi_blind', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'multi_blind', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'returns', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'returns', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'returns', 'Extended', 'Extended', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'return_material', 'Shade fabric', 'Shade fabric', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'return_material', 'Edge binding fabric', 'Edge binding fabric', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'interior_valance', 'Standard when unlined or light-filtering', 'Standard when unlined or light-filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'interior_valance', 'Requested interior valance', 'Requested interior valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'valance_headrail', 'Loose', 'Loose', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'valance_headrail', '1', '1', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'valance_headrail', '1.5', '1.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'valance_headrail', '2.5', '2.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'valance_headrail', '3.5', '3.5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'valance_headrail', '5', '5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:wovenwood', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:wovenwood', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'panel_count', '2', '2', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'panel_count', '3', '3', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'panel_count', '4', '4', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'panel_count', '5', '5', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'wand_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'wand_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'draw', '1-way Left', '1-way Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'draw', '1-way Right', '1-way Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:euro_panel', 'valance', 'Round', 'Round', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'light_control', 'Light Filtering', 'Light Filtering', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'light_control', 'Blackout', 'Blackout', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Cordless Top Down/Bottom Up', 'Cordless Top Down/Bottom Up', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Cordless Day/Night', 'Cordless Day/Night', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Cordloop', 'Cordloop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Skylight', 'Skylight', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Verticell', 'Verticell', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Somfy Cord Lift WireFree TL25', 'Somfy Cord Lift WireFree TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Simphony Cell Shade WireFree', 'Simphony Cell Shade WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Simphony Concerto TDBU', 'Simphony Concerto TDBU', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'system', 'Specialty Shape', 'Specialty Shape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'recess', 'Flush', 'Flush', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'recess', 'Partial recess', 'Partial recess', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'verticell_stack', 'Left Stack', 'Left Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'verticell_stack', 'Right Stack', 'Right Stack', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'verticell_stack', 'Center Split', 'Center Split', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'motor_type', 'Somfy TL25', 'Somfy TL25', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'motor_type', 'Simphony WireFree', 'Simphony WireFree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'motor_type', 'Simphony Concerto', 'Simphony Concerto', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'charger', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'charger', 'Somfy charger', 'Somfy charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'charger', 'Charger (Li-On) Ultra Somfy', 'Charger (Li-On) Ultra Somfy', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'solar_panel', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'solar_panel', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'shape', 'Standard Arch', 'Standard Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'shape', 'Quarter Arch', 'Quarter Arch', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'shape', 'Circle', 'Circle', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'shape', 'Hexagon', 'Hexagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:cellular_shade', 'shape', 'Octagon', 'Octagon', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'shape_geometry', 'Perfect', 'Perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:cellular_shade', 'shape_geometry', 'Non-perfect', 'Non-perfect', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'roll', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'roll', 'Reverse', 'Reverse', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', 'Open roll', 'Open roll', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', 'Fascia 3" / 4" / 5"', 'Fascia 3" / 4" / 5"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', '5" Contractor''s box', '5" Contractor''s box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', '3" Sm round cassette', '3" Sm round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', '4" Lg round cassette', '4" Lg round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', '3" Square cassette', '3" Square cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'top_treatment', '4" Tuscany', '4" Tuscany', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'fabric_insert', 'Y', 'Y', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'fabric_insert', 'N', 'N', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail', 'Standard Hem Pocket (default)', 'Standard Hem Pocket (default)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail', 'Exposed', 'Exposed', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail', 'Wrap-around', 'Wrap-around', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail', 'Enhanced Fabric-Wrapped', 'Enhanced Fabric-Wrapped', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'bottomrail_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'railroad', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'railroad', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'privacy', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'privacy', 'Aluminum side channels', 'Aluminum side channels', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'privacy', 'Solar bar', 'Solar bar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'assembly', 'Dual independent', 'Dual independent', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'assembly', 'Coupled motorized', 'Coupled motorized', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'dual_bracket', 'Vertical', 'Vertical', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'dual_bracket', 'Small 45-degree', 'Small 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'dual_bracket', 'Large 45-degree', 'Large 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Somfy Li-ion V2 charger', 'Somfy Li-ion V2 charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Somfy 24V supply', 'Somfy 24V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Somfy 12V supply', 'Somfy 12V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Somfy battery', 'Somfy battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Somfy solar kit', 'Somfy solar kit', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Alpha charger/battery', 'Alpha charger/battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Simphony charger/solar', 'Simphony charger/solar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Simphony 24V transformer', 'Simphony 24V transformer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:clutch_roller', 'charger_power', 'Simphony 24V distribution box', 'Simphony 24V distribution box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette', '3-inch Small Rounded with Fabric Insert (std 3" round)', '3-inch Small Rounded with Fabric Insert (std 3" round)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette', '3-inch Square Aluminum', '3-inch Square Aluminum', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'cassette_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:caress_zebra', 'assembly', 'multi-shade', 'multi-shade', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'vane_size', '2"', '2"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'vane_size', '2.5"', '2.5"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'vane_size', '3"', '3"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'light_control', 'Light Filtering (LF)', 'Light Filtering (LF)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'light_control', 'Room Darkening', 'Room Darkening', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'S113 Snow White', 'S113 Snow White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-322 Beige', 'LD-322 Beige', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-L334 Pecan', 'LD-L334 Pecan', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-S113 White', 'LD-S113 White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-S302 Sesame', 'LD-S302 Sesame', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-S378 Cocoa', 'LD-S378 Cocoa', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-S414 Cornsilk', 'LD-S414 Cornsilk', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-S503 Dolphin Gray', 'LD-S503 Dolphin Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-S823 Rattan', 'LD-S823 Rattan', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-V110 Night Sky', 'LD-V110 Night Sky', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-V113 Blueberry', 'LD-V113 Blueberry', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'headrail_finish', 'LD-ZY090 Sage', 'LD-ZY090 Sage', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'control', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'control', 'Continuous Cord Loop', 'Continuous Cord Loop', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'control', 'Rechargeable Motor with Wand', 'Rechargeable Motor with Wand', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'motor_type', 'SIMPHONY 30 Li-On MOTOR (Rechargeable)', 'SIMPHONY 30 Li-On MOTOR (Rechargeable)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'motor_type', 'SONESSE 30 Somfy rechargeable', 'SONESSE 30 Somfy rechargeable', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:sheerview_plus', 'remote_control', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'control_side', 'Left', 'Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'control_side', 'Right', 'Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'Gray', 'Gray', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'Nickel Plated', 'Nickel Plated', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'chain_color', 'Stainless Steel', 'Stainless Steel', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'roll', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'roll', 'Reverse', 'Reverse', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', 'Open roll', 'Open roll', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', 'Fascia 3" / 4" / 5"', 'Fascia 3" / 4" / 5"', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', '5" Contractor''s box', '5" Contractor''s box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', '3" Sm round cassette', '3" Sm round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', '4" Lg round cassette', '4" Lg round cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', '3" Square cassette', '3" Square cassette', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'top_treatment', '4" Tuscany', '4" Tuscany', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'fabric_insert', 'Y', 'Y', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'fabric_insert', 'N', 'N', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail', 'Standard Hem Pocket (default)', 'Standard Hem Pocket (default)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail', 'Exposed', 'Exposed', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail', 'Wrap-around', 'Wrap-around', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail', 'Enhanced Fabric-Wrapped', 'Enhanced Fabric-Wrapped', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail_color', 'Ivory', 'Ivory', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail_color', 'Silver', 'Silver', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'bottomrail_color', 'Black', 'Black', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'railroad', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'railroad', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'privacy', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'privacy', 'Aluminum side channels', 'Aluminum side channels', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'privacy', 'Solar bar', 'Solar bar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:motorized_roller', 'assembly', 'Dual independent', 'Dual independent', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'assembly', 'Coupled motorized', 'Coupled motorized', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'dual_bracket', 'Vertical', 'Vertical', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'dual_bracket', 'Small 45-degree', 'Small 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'dual_bracket', 'Large 45-degree', 'Large 45-degree', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Somfy Li-ion V2 charger', 'Somfy Li-ion V2 charger', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Somfy 24V supply', 'Somfy 24V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Somfy 12V supply', 'Somfy 12V supply', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Somfy battery', 'Somfy battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Somfy solar kit', 'Somfy solar kit', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Alpha charger/battery', 'Alpha charger/battery', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Simphony charger/solar', 'Simphony charger/solar', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Simphony 24V transformer', 'Simphony 24V transformer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:motorized_roller', 'charger_power', 'Simphony 24V distribution box', 'Simphony 24V distribution box', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:zipper_screen_exterior', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:zipper_screen_exterior', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:zipper_screen_exterior', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:zipper_screen_exterior', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:zipper_screen_exterior', 'price_class', 'standard', 'standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:zipper_screen_exterior', 'price_class', 'premium', 'premium', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'grade', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'grade', 'Premium', 'Premium', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:1_inch_aluminum', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:2_inch_aluminum', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_aluminum', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'stack', 'One Way', 'One Way', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'stack', 'Split', 'Split', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'control', 'Wand Right', 'Wand Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'control', 'Wand Left', 'Wand Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'bracket', 'Standard', 'Standard', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'bracket', '3-inch extension', '3-inch extension', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'bracket', '4-inch extension', '4-inch extension', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'bracket', '4 5/8-inch L-bracket', '4 5/8-inch L-bracket', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'valance', 'No Valance', 'No Valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'valance', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'valance', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'valance', 'Crown only ($7/ft net)', 'Crown only ($7/ft net)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'valance', 'Crown with dust cover', 'Crown with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'flush', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'flush', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'fulfillment', 'Complete blind', 'Complete blind', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'fulfillment', 'Track only ($0.95/in, 3 ft min)', 'Track only ($0.95/in, 3 ft min)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:vertical_essence', 'fulfillment', 'Vanes only', 'Vanes only', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:2_inch_advantage', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_advantage', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_advantage', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_inch_wood', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'mount_type', 'Inside', 'Inside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'mount_type', 'Outside', 'Outside', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';
insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values
('Sundance', 'order_type:2_5_inch_wood', 'extra_valance', 'None', 'None', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'extra_valance', 'Extra valance', 'Extra valance', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'extra_valance', 'Valance with dust cover', 'Valance with dust cover', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'lift_system', 'Cordless', 'Cordless', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'valance_corners', 'Rounded', 'Rounded', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'valance_corners', 'Square', 'Square', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'ladder', 'Standard Ladder', 'Standard Ladder', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'ladder', 'Solid 1-inch tape', 'Solid 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'ladder', 'Decorative 1-inch tape', 'Decorative 1-inch tape', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'assembly', 'Single', 'Single', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'assembly', 'Two on one', 'Two on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'assembly', 'Three on one', 'Three on one', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'connection', 'Keystone', 'Keystone', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'connection', 'Edge-joint', 'Edge-joint', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'hold_down', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'hold_down', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'spacer', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:2_5_inch_wood', 'spacer', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'ship_to_name', '805 SHUTTERS (default, used on every past order)', '805 SHUTTERS (default, used on every past order)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'ship_to_name', 'customer', 'customer', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_type', 'GLYDEA MOTOR /1.O NM/ 110 VOLTS', 'GLYDEA MOTOR /1.O NM/ 110 VOLTS', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_type', 'GLYDEA MOTOR/ 0.6 NM /110 VOLTS', 'GLYDEA MOTOR/ 0.6 NM /110 VOLTS', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_type', 'IRISMO 35/ 24VOLTS/ 0.6 NM (WITH TRANSFORMER)', 'IRISMO 35/ 24VOLTS/ 0.6 NM (WITH TRANSFORMER)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_type', 'IRISMO 45/LI-ON RECHARGEABLE/0.8 NM', 'IRISMO 45/LI-ON RECHARGEABLE/0.8 NM', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_type', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'headrail_color', 'Bronze', 'Bronze', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'headrail_color', 'White', 'White', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_position', 'Motor Left', 'Motor Left', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'motor_position', 'Motor Right', 'Motor Right', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'curved_track', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'curved_track', 'Yes', 'Yes', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'stack_type', 'ONE WAY LEFT', 'ONE WAY LEFT', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'stack_type', 'ONE WAY RIGHT', 'ONE WAY RIGHT', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'stack_type', 'Split.', 'Split.', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'drapery_style', 'Pinch Pleat Drapery Style', 'Pinch Pleat Drapery Style', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'drapery_style', 'Ripple Fold Drapery style.', 'Ripple Fold Drapery style.', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'remote_control', 'No', 'No', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'remote_control', 'Situo 1 (Single Line)', 'Situo 1 (Single Line)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'remote_control', 'Situo 5 (5 Lines)', 'Situo 5 (5 Lines)', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none'),
('Sundance', 'order_type:glydea_track', 'remote_control', 'Telis 16', 'Telis 16', 'sundance-assortment-2026-09-26-r15', '{}'::jsonb, null, null, null, null, 'none')
on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set
  choice_label = excluded.choice_label
where public.quote_catalog_field_choice.manufacturer = 'Sundance';

insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'sundance_sheerview', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'headrail', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'cord_option', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'control_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'charger', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_sheerview', 'mount_depth_flush', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_zebra', 'alignment_group', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_zebra', 'alignment_group', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'top_finish', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'tube', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'privacy_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_roller', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'sundance_louvolite_roller', 'top_finish', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'tube', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'privacy_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_roller', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: current dealer portal has no flat-Roman ordering type; repo hard-blocks ''confirm current orderability''.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_flat_roman', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: current dealer portal has no flat-Roman ordering type; repo hard-blocks ''confirm current orderability''.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_flat_roman', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'track_channels', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_europanels', 'panel_layout', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'track_channels', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_louvolite_europanels', 'panel_layout', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'sundance_cellular', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'headrail_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'bottom_fabric', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'headrail_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'bottom_fabric', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_verticell', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'headrail_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'bottom_fabric', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_cellular_shapes', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_advantage_ii_2_5', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'sundance_premium_ii_2', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_premium_ii_2_5', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_1', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_aluminum_2', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: no ordering type on the dealer portal; offered in price guide only.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_basicvue', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: no ordering type on the dealer portal; offered in price guide only.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'sundance_chateau_woods', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_chateau_woods', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'stack_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vertical_essence', 'valance_returns', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_stock_vertical', 'stack_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'chain', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'wand_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'edge_binding', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_premier', 'front_mount', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'chain', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'wand_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'edge_binding', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_walden_select', 'front_mount', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_portfolio_roman', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'sundance_portfolio_roman', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_portfolio_roman', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_portfolio_roman', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_portfolio_roman', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_portfolio_roman', 'wand_length_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_portfolio_roman', 'panel_alignment', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'motor_remote_accessories', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_zip', 'housing_color_mount_detail', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_cable', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: no portal ordering type; E4 unproven program.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_cable', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_cable', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_cable', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_exterior_cable', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_drapery_track', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_drapery_track', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_drapery_track', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_drapery_track', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_drapery_track', 'track_width', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_drapery_track', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_wood_shutters', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: no dealer portal ordering type; shutter rates/offerings unproven (E4). 805 normally sources shutters from Norman/Onyx/Polar.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_wood_shutters', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_wood_shutters', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_wood_shutters', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_wood_shutters', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_wood_shutters', 'shutter_options', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vinyl_shutters', null, 'sundance-assortment-2026-09-26-r15', 'blocked', 'BLOCKED: no dealer portal ordering type; shutter rates/offerings unproven (E4). 805 normally sources shutters from Norman/Onyx/Polar.', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vinyl_shutters', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vinyl_shutters', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vinyl_shutters', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vinyl_shutters', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'sundance_vinyl_shutters', 'shutter_options', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:portfolio_soft_roman', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:portfolio_soft_roman', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:portfolio_soft_roman', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'order_type:portfolio_soft_roman', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:portfolio_soft_roman', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:portfolio_soft_roman', 'wand_length_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:portfolio_soft_roman', 'panel_alignment', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'chain', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'wand_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'edge_binding', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:wovenwood', 'front_mount', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'track_channels', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:euro_panel', 'panel_layout', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'headrail_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'bottom_fabric', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:cellular_shade', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'top_finish', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'tube', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'privacy_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:clutch_roller', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:caress_zebra', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'order_type:caress_zebra', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:caress_zebra', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:caress_zebra', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:caress_zebra', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:caress_zebra', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:caress_zebra', 'alignment_group', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'headrail', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'cord_option', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'control_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'charger', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:sheerview_plus', 'mount_depth_flush', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'top_finish', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'tube', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'privacy_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:motorized_roller', 'remote', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'control', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'motor_remote_accessories', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:zipper_screen_exterior', 'housing_color_mount_detail', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'order_type:1_inch_aluminum', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:1_inch_aluminum', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_aluminum', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'stack_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:vertical_essence', 'valance_returns', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_advantage', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_advantage', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');
insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values
('Sundance', 'order_type:2_inch_wood', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_inch_wood', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'fabric_color', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'wand_tilt_side', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'valance', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:2_5_inch_wood', 'tape_code', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'no closed list in the field file', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:glydea_track', 'account_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:glydea_track', 'po_number', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:glydea_track', 'delivery_method', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:glydea_track', 'ship_to_address', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:glydea_track', 'track_width', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
('Sundance', 'order_type:glydea_track', 'mount_type', 'sundance-assortment-2026-09-26-r15', 'incomplete', 'needs live form check', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');


insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
values
  ('quote_category_field_sequence', 'insert', '{"manufacturer":"Sundance","scope":"products_and_order_types"}'::jsonb, null, '{"sequence_rows":1549,"products":30,"order_types":17}'::jsonb, 'migration', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
  ('quote_catalog_field_choice', 'insert', '{"manufacturer":"Sundance"}'::jsonb, null, '{"choice_rows":1240}'::jsonb, 'migration', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656'),
  ('quote_sequence_catalog_gap', 'insert', '{"manufacturer":"Sundance"}'::jsonb, null, '{"gap_rows":376}'::jsonb, 'migration', 'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656');


  if (
    select count(distinct category)
    from public.quote_category_field_sequence
    where manufacturer = 'Sundance' and category not like 'order_type:%' and active
  ) <> 30 then
    raise exception 'Sundance seed did not keep 30 products';
  end if;
  if (
    select count(distinct category)
    from public.quote_category_field_sequence
    where manufacturer = 'Sundance' and category like 'order_type:%' and active
  ) <> 17 then
    raise exception 'Sundance seed did not keep 17 order types';
  end if;
  if exists (
    select 1
    from (
      select manufacturer, count(*)::bigint as rows
      from public.quote_category_field_sequence
      where manufacturer <> 'Sundance'
      group by manufacturer
    ) after
    full join sundance_seed_sequence_counts before using (manufacturer)
    where after.rows is distinct from before.rows
  ) or exists (
    select 1
    from (
      select manufacturer, count(*)::bigint as rows
      from public.quote_catalog_field_choice
      where manufacturer <> 'Sundance'
      group by manufacturer
    ) after
    full join sundance_seed_choice_counts before using (manufacturer)
    where after.rows is distinct from before.rows
  ) or exists (
    select 1
    from (
      select manufacturer, count(*)::bigint as rows
      from public.quote_sequence_field_alias
      where manufacturer <> 'Sundance'
      group by manufacturer
    ) after
    full join sundance_seed_alias_counts before using (manufacturer)
    where after.rows is distinct from before.rows
  ) or exists (
    select 1
    from (
      select manufacturer, count(*)::bigint as rows
      from public.quote_sequence_catalog_gap
      where manufacturer <> 'Sundance'
      group by manufacturer
    ) after
    full join sundance_seed_gap_counts before using (manufacturer)
    where after.rows is distinct from before.rows
  ) then
    raise exception 'Sundance seed changed another manufacturer';
  end if;

  perform public.quote_sequence_end_migration();
end
$sundance$;
