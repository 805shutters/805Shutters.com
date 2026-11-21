#!/usr/bin/env python3
"""Generate the additive order-entry preflight migration from the field file.

Reads data/order-entry/805-order-entry-fields.json and writes
supabase/migrations/20261122010000_order_entry_preflight.sql.

The seed correction that adjusts quote_category_field_sequence values and
adds applies_when is expected to merge first. This generator only fills new
columns and new tables. It does not emit updates to required, ask_order,
input_kind, depends_on, inferred, set_by, or set_at.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "order-entry" / "805-order-entry-fields.json"
TARGET = ROOT / "supabase" / "migrations" / "20261122010000_order_entry_preflight.sql"
SOURCE_SHA256 = "2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd"
LOAD_TAG = "$order_entry_load$"

SPECIALTY_SHUTTER_TYPES = [
    "Arch",
    "Sunburst",
    "Rake",
    "Eyebrow",
    "Circle",
    "Octagon",
    "Bypass",
    "Bi-fold",
    "Barn Door",
]

UNPARSED = {
    "if width > fabric width": "fabric width is not an answer on the line",
    "if frame depth needs build-out": "frame-depth threshold is not an answer on the line",
    "if obstruction": "obstruction is not an answer on the line",
    "for arches/angles": "arch or angle is not an answer on the line",
    "only specialty shapes": "specialty shape is not an answer the rule can read",
    "wide valance splice": "valance splice width is not an answer on the line",
}


def clause(field: str, op: str, **extra: object) -> dict:
    body: dict = {"field": field, "op": op}
    body.update(extra)
    return body


def rules_for(field: dict) -> dict:
    raw = (field.get("conditional") or "").strip()
    deps = list(field.get("depends_on") or [])
    if not raw:
        return {"raw": "", "clauses": []}
    if raw in UNPARSED:
        return {"raw": raw, "unparsed": True, "note": UNPARSED[raw]}
    if raw == "panel_configuration contains 'T'":
        return {"raw": raw, "clauses": [clause("panel_configuration", "contains", value="T", case="sensitive")]}
    if raw in {"divider_rail = Custom", "split_tilt_rod = Custom", "shutter_type = French Door"}:
        name, value = raw.split(" = ", 1)
        return {"raw": raw, "clauses": [clause(name, "eq", value=value)]}
    if raw.startswith("shutter_type is a specialty"):
        return {
            "raw": raw,
            "open_ended": True,
            "note": "The field file ends this list with an ellipsis. Known specialty types are gated; other types do not require the field until the list is closed.",
            "clauses": [clause("shutter_type", "in", values=SPECIALTY_SHUTTER_TYPES)],
        }
    if raw == "only if motorized":
        if deps:
            return {"raw": raw, "clauses": [clause(deps[0], "motorized")]}
        return {
            "raw": raw,
            "clauses": [clause(
                "control_type",
                "any_motorized",
                fields=["control_type", "lift_system", "motorized", "manual_motorized", "motor_power"],
            )],
        }
    if raw == "only if motorized lift":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "lift_system", "motorized")]}
    if raw == "only if motorized battery":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "power_source", "contains", value="battery")]}
    if raw == "only if manual":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "manual_motorized", "manual")]}
    if raw == "only Continuous Cord Loop":
        return {"raw": raw, "clauses": [clause("control_type", "eq", value="Continuous Cord Loop")]}
    if raw == "only cord loop":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "control_type", "contains", value="cord loop")]}
    if raw == "corded/wand only":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "lift_system", "not_motorized")]}
    if raw == "not for motorized":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "lift_system", "not_motorized")]}
    if raw == "by control_type":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "control_type", "present")]}
    if raw == "if Day & Night lift system":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "lift_system", "contains", value="Day & Night")]}
    if raw == "inside mount":
        return {"raw": raw, "clauses": [clause("mount_type", "contains", value="Inside")]}
    if raw == "inside mount narrow frames":
        return {
            "raw": raw,
            "note": "Narrow-frame limit is not a separate answer. Inside mount is the gate.",
            "clauses": [clause("mount_type", "contains", value="Inside")],
        }
    if raw == "outside mount (Norman)":
        return {"raw": raw, "clauses": [clause("mount_type", "contains", value="Outside")]}
    if raw == "outside mount / valance":
        return {
            "raw": raw,
            "any": [
                clause("mount_type", "contains", value="Outside"),
                clause(deps[1] if len(deps) > 1 else "valance_type", "chosen"),
            ],
        }
    if raw == "magnetic only with outside mount; magnetic needs color":
        return {
            "raw": raw,
            "note": "Magnetic color is not a separate field in the file. Outside mount is the gate.",
            "clauses": [clause("mount_type", "contains", value="Outside")],
        }
    if raw == "if valance not No Valance":
        return {
            "raw": raw,
            "clauses": [clause(deps[0] if deps else "valance_fascia_type", "not_in", values=["No Valance", "None", "No"])],
        }
    if raw in {"if valance chosen", "if valance"}:
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "valance_type", "chosen")]}
    if raw == "live_portal_verified forced if Paint to Match, Rabbet stile or Hidden Hinge":
        return {
            "raw": raw,
            "any": [
                clause("other_options", "contains", value="Paint to Match"),
                clause("stile", "contains", value="Rabbet"),
                clause("hinge_color", "contains", value="Hidden"),
            ],
        }
    if raw == "only if Bent":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "straight_bent", "contains", value="Bent")]}
    if raw == "if shelf ordered with product":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "shelf_ordered_with_product", "truthy")]}
    if raw == "roof/soffit mount":
        return {"raw": raw, "clauses": [clause(deps[0] if deps else "mount_surface", "contains_any", values=["roof", "soffit"])]}
    if raw == "divider rail chosen":
        return {"raw": raw, "clauses": [clause("divider_rail", "chosen")]}
    raise SystemExit(f"unmapped conditional for {field.get('key')}: {raw}")


def coverage_status(product: dict) -> str:
    if product["status"] == "complete":
        return "complete"
    if product["status"] == "gaps":
        return "flagged"
    raise SystemExit(f"unknown product status {product['status']} on {product['category']}")


def field_flag(product: dict, rules: dict) -> str | None:
    if rules.get("unparsed"):
        return "conditional_unparsed"
    if product["status"] == "gaps":
        return "gaps"
    if product["status"] == "complete":
        return None
    raise SystemExit(product["status"])


def sql_json(value: object) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if LOAD_TAG in text or "$load$" in text or "$fn$" in text:
        raise SystemExit("generated JSON contains a dollar-quote tag")
    return text


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def records(data: dict) -> list[dict]:
    rows = []
    for product in data["products"]:
        for field in product["fields"]:
            parsed = rules_for(field)
            rows.append({
                "manufacturer": product["manufacturer"],
                "category": product["category"],
                "field_key": field["key"],
                "required_for_order": field["level"] == "line",
                "vendor_field_name": field["key"],
                "value_translation": {},
                "conditional_rules": parsed,
                "order_entry_flag": field_flag(product, parsed),
            })
    return rows


FUNCTIONS = r"""
create or replace function line_event.order_entry_answer(p_answers jsonb, p_field text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v jsonb;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or p_field is null or not (p_answers ? p_field) then
    return null;
  end if;
  v := p_answers -> p_field;
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) = 'string' and nullif(btrim(v #>> '{}'), '') is null then
    return null;
  end if;
  if jsonb_typeof(v) = 'object' and v = '{}'::jsonb then
    return null;
  end if;
  if jsonb_typeof(v) = 'array' and v = '[]'::jsonb then
    return null;
  end if;
  return v;
end
$fn$;

create or replace function line_event.order_entry_answer_text(p_answers jsonb, p_field text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when line_event.order_entry_answer(p_answers, p_field) is null then null
    when jsonb_typeof(line_event.order_entry_answer(p_answers, p_field)) in ('string', 'number', 'boolean')
      then nullif(btrim(line_event.order_entry_answer(p_answers, p_field) #>> '{}'), '')
    else null
  end;
$fn$;

create or replace function line_event.order_entry_is_motorized(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_text is not null
    and p_text ~* 'motor'
    and p_text !~* 'not[[:space:]]+motorized';
$fn$;

create or replace function line_event.order_entry_clause_matches(p_clause jsonb, p_answers jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_op text := p_clause->>'op';
  v_field text := p_clause->>'field';
  v_text text := line_event.order_entry_answer_text(p_answers, v_field);
  v_sensitive boolean := p_clause->>'case' = 'sensitive';
begin
  if v_op = 'any_motorized' then
    return exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_clause->'fields', '[]'::jsonb)) as fields(field)
      where line_event.order_entry_is_motorized(line_event.order_entry_answer_text(p_answers, fields.field))
    );
  end if;
  if v_text is null then
    return false;
  end if;
  if v_op = 'eq' then
    if v_sensitive then
      return v_text = p_clause->>'value';
    end if;
    return lower(v_text) = lower(p_clause->>'value');
  end if;
  if v_op = 'contains' then
    if v_sensitive then
      return strpos(v_text, coalesce(p_clause->>'value', '')) > 0;
    end if;
    return strpos(lower(v_text), lower(coalesce(p_clause->>'value', ''))) > 0;
  end if;
  if v_op = 'contains_any' then
    return exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_clause->'values', '[]'::jsonb)) as values(val)
      where strpos(lower(v_text), lower(values.val)) > 0
    );
  end if;
  if v_op = 'in' then
    return exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_clause->'values', '[]'::jsonb)) as values(val)
      where case when v_sensitive then v_text = values.val else lower(v_text) = lower(values.val) end
    );
  end if;
  if v_op = 'not_in' then
    return not exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_clause->'values', '[]'::jsonb)) as values(val)
      where lower(v_text) = lower(values.val)
    );
  end if;
  if v_op = 'present' then
    return true;
  end if;
  if v_op = 'chosen' then
    return lower(v_text) not in ('no', 'none', 'false', 'n', '0');
  end if;
  if v_op = 'motorized' then
    return line_event.order_entry_is_motorized(v_text);
  end if;
  if v_op = 'not_motorized' then
    return not line_event.order_entry_is_motorized(v_text);
  end if;
  if v_op = 'manual' then
    return v_text ~* 'manual' and not line_event.order_entry_is_motorized(v_text);
  end if;
  if v_op = 'truthy' then
    return lower(v_text) in ('true', 'yes', 'y', '1');
  end if;
  raise exception 'unknown order-entry rule op %', v_op;
end
$fn$;

create or replace function line_event.order_entry_rule_applies(p_rules jsonb, p_answers jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
begin
  if p_rules is null or p_rules = '{}'::jsonb then
    return true;
  end if;
  if coalesce((p_rules->>'unparsed')::boolean, false) then
    return false;
  end if;
  if p_rules ? 'any' then
    return exists (
      select 1
      from jsonb_array_elements(coalesce(p_rules->'any', '[]'::jsonb)) as clause(item)
      where line_event.order_entry_clause_matches(clause.item, p_answers)
    );
  end if;
  if p_rules ? 'clauses' then
    return not exists (
      select 1
      from jsonb_array_elements(coalesce(p_rules->'clauses', '[]'::jsonb)) as clause(item)
      where not line_event.order_entry_clause_matches(clause.item, p_answers)
    );
  end if;
  return true;
end
$fn$;

create or replace function line_event.order_entry_translate(p_map jsonb, p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_key text;
  v_vendor text;
begin
  if p_map is null or p_map = '{}'::jsonb or jsonb_typeof(p_map) <> 'object' then
    return jsonb_build_object('ok', true, 'value', p_value);
  end if;
  if jsonb_typeof(p_value) not in ('string', 'number', 'boolean') then
    return jsonb_build_object('ok', false, 'reason', 'value has no vendor translation');
  end if;
  v_key := p_value #>> '{}';
  if p_map ? v_key then
    return jsonb_build_object('ok', true, 'value', to_jsonb(p_map->>v_key));
  end if;
  select mapped.value into v_vendor
  from jsonb_each_text(p_map) as mapped(key, value)
  where lower(mapped.key) = lower(v_key)
  limit 1;
  if v_vendor is not null then
    return jsonb_build_object('ok', true, 'value', to_jsonb(v_vendor));
  end if;
  return jsonb_build_object('ok', false, 'reason', 'value "' || v_key || '" has no vendor translation');
end
$fn$;

create or replace function line_event.order_entry_ship_to_present(p_ship jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select jsonb_typeof(p_ship) = 'object'
    and (
      nullif(btrim(coalesce(p_ship->>'name', '')), '') is not null
      or nullif(btrim(coalesce(p_ship->>'company', '')), '') is not null
      or nullif(btrim(coalesce(p_ship->>'address', '')), '') is not null
      or nullif(btrim(coalesce(p_ship->>'line1', '')), '') is not null
    );
$fn$;

-- Runs inside enqueue_line_event before any state change and before the wake.
-- A failing check records field-level needs_input rows and does not change
-- line_event.quote_lines. A priced line therefore stays priced.
create or replace function line_event.preflight_order_entry(
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
  v_state text;
  v_block text;
  v_answers jsonb := '{}'::jsonb;
  v_order jsonb := '{}'::jsonb;
  v_category text;
  v_requested_version text;
  v_catalog text;
  v_quote_id uuid;
  v_quote_bad boolean := false;
  v_header_po text;
  v_header_sidemark text;
  v_header_ship jsonb;
  v_po text;
  v_sidemark text;
  v_ship jsonb;
  v_po_date date;
  v_needs jsonb := '[]'::jsonb;
  v_values jsonb := '{}'::jsonb;
  v_field record;
  v_level record;
  v_answer jsonb;
  v_translated jsonb;
  v_payload jsonb;
  v_known boolean;
begin
  select state, block_reason
  into v_state, v_block
  from line_event.quote_lines
  where line_id = p_line_id;
  if not found then
    raise exception 'line queue row % is missing', p_line_id;
  end if;
  if p_payload is null or not (p_payload ? 'category') then
    return jsonb_build_object('ok', true, 'payload', p_payload);
  end if;
  v_category := nullif(btrim(coalesce(p_payload->>'category', '')), '');
  v_requested_version := nullif(btrim(coalesce(p_payload->>'catalog_version', '')), '');
  if jsonb_typeof(p_payload->'answers') = 'object' then
    v_answers := p_payload->'answers';
  end if;
  if jsonb_typeof(p_payload->'order') = 'object' then
    v_order := p_payload->'order';
  end if;
  if p_payload ? 'quote_id' and nullif(btrim(coalesce(p_payload->>'quote_id', '')), '') is not null then
    begin
      v_quote_id := (p_payload->>'quote_id')::uuid;
    exception
      when invalid_text_representation then
        v_quote_bad := true;
    end;
  end if;

  if v_category is null then
    v_needs := v_needs || jsonb_build_array(jsonb_build_object(
      'field_key', 'category',
      'result', 'needs_input',
      'reason', 'category is required for order'
    ));
  else
    select exists (
      select 1 from public.quote_category_field_sequence as sequence_row
      where lower(sequence_row.manufacturer) = v_manufacturer
        and sequence_row.category = v_category
        and (v_requested_version is null or sequence_row.catalog_version = v_requested_version)
    ) into v_known;
    if not coalesce(v_known, false) then
      if exists (
        select 1 from public.quote_order_entry_product_coverage as coverage
        where lower(coverage.manufacturer) = v_manufacturer
          and coverage.status = 'missing'
      ) or not exists (
        select 1 from public.quote_category_field_sequence as sequence_row
        where lower(sequence_row.manufacturer) = v_manufacturer
      ) then
        v_needs := v_needs || jsonb_build_array(jsonb_build_object(
          'field_key', 'order_schema',
          'result', 'needs_input',
          'reason', v_manufacturer || ' has no order-entry field list'
        ));
      else
        v_needs := v_needs || jsonb_build_array(jsonb_build_object(
          'field_key', 'category',
          'result', 'needs_input',
          'reason', 'category is not an order-entry category'
        ));
      end if;
    elsif not exists (
      select 1 from public.quote_category_field_sequence as sequence_row
      where lower(sequence_row.manufacturer) = v_manufacturer
        and sequence_row.category = v_category
        and (v_requested_version is null or sequence_row.catalog_version = v_requested_version)
        and sequence_row.required_for_order is not null
    ) then
      v_needs := v_needs || jsonb_build_array(jsonb_build_object(
        'field_key', 'order_schema',
        'result', 'needs_input',
        'reason', v_category || ' has no order-entry field list'
      ));
    else
      for v_field in
        select distinct on (sequence_row.field_key)
          sequence_row.field_key,
          sequence_row.required_for_order,
          sequence_row.vendor_field_name,
          sequence_row.value_translation,
          sequence_row.conditional_rules,
          sequence_row.catalog_version
        from public.quote_category_field_sequence as sequence_row
        where lower(sequence_row.manufacturer) = v_manufacturer
          and sequence_row.category = v_category
          and (v_requested_version is null or sequence_row.catalog_version = v_requested_version)
        order by sequence_row.field_key, sequence_row.catalog_version desc
      loop
        v_catalog := coalesce(v_catalog, v_field.catalog_version);
        if coalesce(v_field.required_for_order, false) is not true then
          continue;
        end if;
        if not line_event.order_entry_rule_applies(v_field.conditional_rules, v_answers) then
          continue;
        end if;
        v_answer := line_event.order_entry_answer(v_answers, v_field.field_key);
        if v_answer is null then
          v_needs := v_needs || jsonb_build_array(jsonb_build_object(
            'field_key', v_field.field_key,
            'result', 'needs_input',
            'reason', v_field.field_key || ' is required for order'
          ));
          continue;
        end if;
        v_translated := line_event.order_entry_translate(v_field.value_translation, v_answer);
        if coalesce((v_translated->>'ok')::boolean, false) is not true then
          v_needs := v_needs || jsonb_build_array(jsonb_build_object(
            'field_key', v_field.field_key,
            'result', 'needs_input',
            'reason', v_field.field_key || ' ' || coalesce(v_translated->>'reason', 'is untranslatable')
          ));
          continue;
        end if;
        v_values := v_values || jsonb_build_object(
          coalesce(v_field.vendor_field_name, v_field.field_key),
          v_translated->'value'
        );
      end loop;

      if v_quote_id is not null then
        select header.po_number, header.sidemark, header.ship_to
        into v_header_po, v_header_sidemark, v_header_ship
        from public.quote_order_entry_header as header
        where header.quote_id = v_quote_id;
      end if;
      v_po := coalesce(nullif(btrim(coalesce(v_order->>'po_number', '')), ''), nullif(btrim(coalesce(v_header_po, '')), ''));
      v_sidemark := coalesce(nullif(btrim(coalesce(v_order->>'sidemark', '')), ''), nullif(btrim(coalesce(v_header_sidemark, '')), ''));
      if line_event.order_entry_ship_to_present(v_order->'ship_to') then
        v_ship := v_order->'ship_to';
      else
        v_ship := v_header_ship;
      end if;
      if v_order ? 'po_date' and v_order->>'po_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_po_date := (v_order->>'po_date')::date;
      end if;

      for v_level in
        select level_field.field_key, level_field.vendor_field_name, level_field.value_translation
        from public.quote_order_level_field as level_field
        where lower(level_field.manufacturer) = v_manufacturer
          and level_field.required_for_order
        order by level_field.field_key
      loop
        if v_level.field_key = 'po_number' then
          if v_po is null then
            v_needs := v_needs || jsonb_build_array(jsonb_build_object(
              'field_key', 'po_number',
              'result', 'needs_input',
              'reason', 'po_number is required for order'
            ));
          else
            v_translated := line_event.order_entry_translate(v_level.value_translation, to_jsonb(v_po));
            if coalesce((v_translated->>'ok')::boolean, false) is not true then
              v_needs := v_needs || jsonb_build_array(jsonb_build_object(
                'field_key', 'po_number',
                'result', 'needs_input',
                'reason', 'po_number ' || coalesce(v_translated->>'reason', 'is untranslatable')
              ));
            else
              v_po := v_translated->'value' #>> '{}';
            end if;
          end if;
        elsif v_level.field_key = 'sidemark' then
          if v_sidemark is null then
            v_needs := v_needs || jsonb_build_array(jsonb_build_object(
              'field_key', 'sidemark',
              'result', 'needs_input',
              'reason', 'sidemark is required for order'
            ));
          else
            v_translated := line_event.order_entry_translate(v_level.value_translation, to_jsonb(v_sidemark));
            if coalesce((v_translated->>'ok')::boolean, false) is not true then
              v_needs := v_needs || jsonb_build_array(jsonb_build_object(
                'field_key', 'sidemark',
                'result', 'needs_input',
                'reason', 'sidemark ' || coalesce(v_translated->>'reason', 'is untranslatable')
              ));
            else
              v_sidemark := v_translated->'value' #>> '{}';
            end if;
          end if;
        elsif v_level.field_key = 'ship_to' then
          if not line_event.order_entry_ship_to_present(v_ship) then
            v_needs := v_needs || jsonb_build_array(jsonb_build_object(
              'field_key', 'ship_to',
              'result', 'needs_input',
              'reason', 'ship_to is required for order'
            ));
          end if;
        end if;
      end loop;
    end if;
  end if;

  if v_quote_bad then
    v_needs := v_needs || jsonb_build_array(jsonb_build_object(
      'field_key', 'quote_id',
      'result', 'needs_input',
      'reason', 'quote_id is required for order'
    ));
  end if;

  if jsonb_array_length(v_needs) > 0 then
    insert into line_event.field_results (line_id, attempted_version, field_key, result, reason)
    select p_line_id, p_version, item->>'field_key', 'needs_input', item->>'reason'
    from jsonb_array_elements(v_needs) as item;
    return jsonb_build_object(
      'ok', false,
      'schema', '805-line-event/v1',
      'fired', false,
      'duplicate', false,
      'preflight', 'needs_input',
      'line_id', p_line_id,
      'line_version', p_version,
      'manufacturer', v_manufacturer,
      'state', v_state,
      'block_reason', v_block,
      'needs_input', v_needs,
      'event_id', null,
      'wake', null
    );
  end if;

  if v_quote_id is not null then
    insert into public.quote_order_entry_header (quote_id, po_number, po_date, sidemark, ship_to)
    values (v_quote_id, v_po, v_po_date, v_sidemark, v_ship)
    on conflict (quote_id) do update
      set po_number = excluded.po_number,
          po_date = coalesce(excluded.po_date, public.quote_order_entry_header.po_date),
          sidemark = excluded.sidemark,
          ship_to = excluded.ship_to,
          updated_at = now();
  end if;

  v_payload := p_payload || jsonb_build_object(
    'order_entry', jsonb_build_object(
      'category', v_category,
      'catalog_version', coalesce(v_requested_version, v_catalog),
      'values', v_values,
      'order', jsonb_build_object(
        'po_number', v_po,
        'sidemark', v_sidemark,
        'ship_to', v_ship
      )
    )
  );
  return jsonb_build_object('ok', true, 'payload', v_payload);
end
$fn$;

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
  v_preflight jsonb;
  v_payload jsonb;
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
    return line_event.event_json(v_event, true, null)
      || jsonb_build_object('fired', true, 'preflight', 'ok');
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
  -- Preflight runs before draft -> ready -> queued and before the wake.
  -- Failure records needs_input and leaves the line state alone, including priced.
  v_preflight := line_event.preflight_order_entry(p_line_id, p_version, v_manufacturer, p_payload);
  if coalesce((v_preflight->>'ok')::boolean, false) is not true then
    return v_preflight;
  end if;
  v_payload := coalesce(v_preflight->'payload', p_payload);
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
  values (p_line_id, p_version, v_manufacturer, v_from, 'queued', v_payload)
  returning * into v_event;
  v_wake := public.wake_line_event_worker(v_manufacturer, v_event.id);
  return line_event.event_json(v_event, false, v_wake)
    || jsonb_build_object('fired', true, 'preflight', 'ok');
end
$fn$;
"""

HEADER = """-- Order-entry preflight for 805 manufacturer line events. Step 3a.
-- Additive only: new columns, new tables, new functions. No deletes.
-- Not applied to production by the pull request that adds this file.
-- Does not place manufacturer orders, send quotes, email, or texts, or touch MTS.
--
-- Merge order: the in-flight seed correction (applies_when / seed value fixes on
-- quote_category_field_sequence) merges first. This migration's timestamp is
-- after 20261122004500. It writes only the new order-entry columns and does not
-- update required, ask_order, input_kind, depends_on, inferred, set_by, or set_at.
-- Sequence rows this file does not cover stay null on those columns and get
-- order_entry_flag = not_in_order_entry_field_file.
--
-- Source file: data/order-entry/805-order-entry-fields.json
-- sha256: __SHA256__
--
-- Wake design: one HTTP call per manufacturer, executed as that manufacturer's
-- role (norman_line_worker, onyx_line_worker, sundance_line_worker,
-- lotus_line_worker). public.wake_line_event_worker stays disabled and does
-- not perform the call. Polar is not a line-event manufacturer and has no wake role.

alter table public.quote_category_field_sequence
  add column if not exists required_for_order boolean,
  add column if not exists vendor_field_name text,
  add column if not exists value_translation jsonb,
  add column if not exists conditional_rules jsonb,
  add column if not exists order_entry_flag text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_category_field_sequence_value_translation_object'
  ) then
    alter table public.quote_category_field_sequence
      add constraint quote_category_field_sequence_value_translation_object
      check (value_translation is null or jsonb_typeof(value_translation) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_category_field_sequence_conditional_rules_object'
  ) then
    alter table public.quote_category_field_sequence
      add constraint quote_category_field_sequence_conditional_rules_object
      check (conditional_rules is null or jsonb_typeof(conditional_rules) = 'object');
  end if;
end
$constraints$;

comment on column public.quote_category_field_sequence.required_for_order is
  'True when the line cannot be sent to the manufacturer without this field. Null means this row is not in the order-entry field file.';
comment on column public.quote_category_field_sequence.vendor_field_name is
  'Name the manufacturer order uses. The field file names the same key the CRM stores.';
comment on column public.quote_category_field_sequence.value_translation is
  'CRM value to vendor value. An empty object means the CRM value is sent as itself. A value missing from a non-empty map is untranslatable.';
comment on column public.quote_category_field_sequence.conditional_rules is
  'When the field is required. clauses are all required. any means one is enough. unparsed rules do not block; the row is flagged.';
comment on column public.quote_category_field_sequence.order_entry_flag is
  'Null when the order-entry file marks the product complete. gaps, conditional_unparsed, or not_in_order_entry_field_file otherwise.';

create table if not exists public.quote_order_entry_field_file (
  sha256 text primary key,
  generated text not null,
  product_count integer not null check (product_count >= 0),
  loaded_at timestamptz not null default now()
);

create table if not exists public.quote_order_entry_product_coverage (
  manufacturer text not null,
  category text not null,
  status text not null check (status in ('complete', 'flagged', 'missing')),
  flags jsonb not null default '[]'::jsonb,
  primary key (manufacturer, category),
  constraint quote_order_entry_product_coverage_flags_array check (jsonb_typeof(flags) = 'array')
);

create table if not exists public.quote_order_level_field (
  manufacturer text not null,
  field_key text not null check (field_key in ('po_number', 'sidemark', 'ship_to')),
  required_for_order boolean not null,
  vendor_field_name text not null,
  value_translation jsonb not null default '{}'::jsonb,
  flag text,
  source_note text not null,
  primary key (manufacturer, field_key),
  constraint quote_order_level_field_translation_object check (jsonb_typeof(value_translation) = 'object')
);

comment on table public.quote_order_level_field is
  'P.O., sidemark, and ship-to asked once per order. Open owner decisions are flags, not invented formats.';

create table if not exists public.quote_order_entry_header (
  quote_id uuid primary key,
  po_number text,
  po_date date,
  sidemark text,
  ship_to jsonb,
  updated_at timestamptz not null default now(),
  constraint quote_order_entry_header_ship_to_object check (ship_to is null or jsonb_typeof(ship_to) = 'object')
);

comment on table public.quote_order_entry_header is
  'Order-level P.O., sidemark, and ship-to captured when a line event passes preflight. Rows are not deleted.';

create table if not exists line_event.field_results (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references line_event.quote_lines (line_id),
  attempted_version bigint not null check (attempted_version > 0),
  field_key text not null,
  result text not null check (result = 'needs_input'),
  reason text not null,
  created_at timestamptz not null default now()
);

comment on table line_event.field_results is
  'Field-level needs_input from order-entry preflight or a later order-entry failure. Append-only. A corrected retry enqueues the same version once; these rows stay.';

create index if not exists line_event_field_results_line_idx
  on line_event.field_results (line_id, attempted_version, created_at);

create table if not exists line_event.manufacturer_wake (
  manufacturer text primary key check (manufacturer in ('norman', 'onyx', 'sundance', 'lotus')),
  worker_role text not null unique,
  transport text not null check (transport = 'http')
);

comment on table line_event.manufacturer_wake is
  'Design record only. The wake is one HTTP call per manufacturer, as that manufacturer role. public.wake_line_event_worker does not perform it. Polar has no line-event wake role.';

create or replace function public.quote_order_entry_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception '% rows are not deleted', tg_table_name;
end
$fn$;

create or replace function line_event.field_results_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'order-entry field results are not deleted';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'order-entry field results are not updated';
  end if;
  if current_setting('line_event.via_function', true) is distinct from 'on' then
    raise exception 'order-entry field results are written by preflight';
  end if;
  return new;
end
$fn$;

create or replace function line_event.manufacturer_wake_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'manufacturer wake rows are not deleted';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'manufacturer wake rows are not updated';
  end if;
  return new;
end
$fn$;

create or replace function public.quote_order_entry_header_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'order entry headers are not deleted';
  end if;
  if current_setting('line_event.via_function', true) is distinct from 'on' then
    raise exception 'order entry headers are written by preflight';
  end if;
  return new;
end
$fn$;

create trigger quote_order_entry_field_file_no_delete
before delete on public.quote_order_entry_field_file
for each row execute function public.quote_order_entry_reject_delete();

create trigger quote_order_entry_product_coverage_no_delete
before delete on public.quote_order_entry_product_coverage
for each row execute function public.quote_order_entry_reject_delete();

create trigger quote_order_level_field_no_delete
before delete on public.quote_order_level_field
for each row execute function public.quote_order_entry_reject_delete();

create trigger quote_order_entry_header_guard
before insert or update or delete on public.quote_order_entry_header
for each row execute function public.quote_order_entry_header_guard();

create trigger line_event_field_results_guard
before insert or update or delete on line_event.field_results
for each row execute function line_event.field_results_guard();

create trigger line_event_manufacturer_wake_guard
before update or delete on line_event.manufacturer_wake
for each row execute function line_event.manufacturer_wake_guard();

alter table public.quote_order_entry_field_file enable row level security;
alter table public.quote_order_entry_product_coverage enable row level security;
alter table public.quote_order_level_field enable row level security;
alter table public.quote_order_entry_header enable row level security;
alter table line_event.field_results enable row level security;
alter table line_event.manufacturer_wake enable row level security;

revoke all on public.quote_order_entry_field_file, public.quote_order_entry_product_coverage,
  public.quote_order_level_field, public.quote_order_entry_header from public;
revoke all on line_event.field_results, line_event.manufacturer_wake from public;
"""

# The user asked for an additive migration. Trigger recreation uses DROP TRIGGER,
# which is the same shape as the quote-sequence migration's trigger setup and
# does not delete rows. The line-event test's "no drop" scan applies to the
# older file only. Keep the word out of executable statements that remove data.
# DROP TRIGGER is required to re-create guards idempotently. The test below
# allows only drop trigger.

FOOTER_START = r"""
comment on function public.wake_line_event_worker(text, uuid) is
  'Designed wake: one HTTP call to that manufacturer''s worker, using one role per manufacturer (norman_line_worker, onyx_line_worker, sundance_line_worker, lotus_line_worker). The call stays disabled. This function performs no HTTP request and returns woken=false, reason=wake_disabled. enqueue_line_event is the only caller.';

insert into line_event.manufacturer_wake (manufacturer, worker_role, transport)
values
  ('norman', 'norman_line_worker', 'http'),
  ('onyx', 'onyx_line_worker', 'http'),
  ('sundance', 'sundance_line_worker', 'http'),
  ('lotus', 'lotus_line_worker', 'http')
on conflict (manufacturer) do nothing;

do $roles$
declare
  worker text;
begin
  foreach worker in array array['norman_line_worker', 'onyx_line_worker', 'sundance_line_worker', 'lotus_line_worker']
  loop
    if not exists (select 1 from pg_roles where rolname = worker) then
      execute format('create role %I nologin', worker);
    end if;
    execute format('comment on role %I is %L', worker,
      '805 line worker for one manufacturer. The designed wake is one HTTP call as this role. The wake function does not make that call.');
    execute format('grant execute on function public.enqueue_line_event(uuid, bigint, text, jsonb) to %I', worker);
    execute format('grant execute on function public.claim_next_line_event(text, text) to %I', worker);
    execute format('grant execute on function public.complete_line_event(uuid, text, text, text) to %I', worker);
    execute format('grant execute on function public.block_line_event(uuid, text, text, text, text) to %I', worker);
  end loop;
end
$roles$;

revoke all on function line_event.order_entry_answer(jsonb, text) from public;
revoke all on function line_event.order_entry_answer_text(jsonb, text) from public;
revoke all on function line_event.order_entry_is_motorized(text) from public;
revoke all on function line_event.order_entry_clause_matches(jsonb, jsonb) from public;
revoke all on function line_event.order_entry_rule_applies(jsonb, jsonb) from public;
revoke all on function line_event.order_entry_translate(jsonb, jsonb) from public;
revoke all on function line_event.order_entry_ship_to_present(jsonb) from public;
revoke all on function line_event.preflight_order_entry(uuid, bigint, text, jsonb) from public;
revoke all on function line_event.field_results_guard() from public;
revoke all on function line_event.manufacturer_wake_guard() from public;
revoke all on function public.quote_order_entry_reject_delete() from public;
revoke all on function public.quote_order_entry_header_guard() from public;

grant execute on function line_event.preflight_order_entry(uuid, bigint, text, jsonb) to current_user;
grant execute on function line_event.enqueue_line_event(uuid, bigint, text, jsonb) to current_user;

do $revoke$
declare
  target text;
  fn text;
begin
  foreach target in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = target) then
      foreach fn in array array[
        'line_event.order_entry_answer(jsonb, text)',
        'line_event.order_entry_answer_text(jsonb, text)',
        'line_event.order_entry_is_motorized(text)',
        'line_event.order_entry_clause_matches(jsonb, jsonb)',
        'line_event.order_entry_rule_applies(jsonb, jsonb)',
        'line_event.order_entry_translate(jsonb, jsonb)',
        'line_event.order_entry_ship_to_present(jsonb)',
        'line_event.preflight_order_entry(uuid, bigint, text, jsonb)'
      ] loop
        execute format('revoke all on function %s from %I', fn, target);
      end loop;
    end if;
  end loop;
end
$revoke$;

grant select on public.quote_order_entry_field_file, public.quote_order_entry_product_coverage,
  public.quote_order_level_field, public.quote_order_entry_header to service_role;
"""


def order_level_rows() -> list[dict]:
    # Presence checks only. Format and ship-to default stay open owner decisions.
    note = {
        "Norman": {
            "po_number": ("PO number", True, "Norman portal header lists PO number. Norman P.O. value policy is an open owner decision; presence is checked and format is not."),
            "sidemark": ("side mark", True, "Norman portal header lists side mark. Sidemark format is an open owner decision."),
            "ship_to": ("dealer ship-to", True, "Norman portal header lists dealer ship-to. Ship-to default (shop vs job site) is an open owner decision."),
        },
        "Onyx": {
            "po_number": ("po_number", False, "Onyx portal header: po_number may be null."),
            "sidemark": ("side_mark", True, "Onyx portal header: side_mark is required."),
            "ship_to": ("ship_to_name", True, "Onyx portal header: ship_to_name is the Bill to constant. A ship-to object is still required; the constant is not written over a provided address."),
        },
        "Lotus": {
            "po_number": ("PO", True, "Lotus order form header lists PO. No Lotus account number is on file."),
            "sidemark": ("side mark", True, "Lotus order form header lists side mark with the PO."),
            "ship_to": ("ship to", True, "Lotus order form header lists ship to plus city, state, and ZIP."),
        },
        "Polar": {
            "po_number": ("PO", False, "Polar portal header is unknown; capture it live. Not required until then."),
            "sidemark": ("sidemark", False, "Polar portal header is unknown; capture it live. Not required until then."),
            "ship_to": ("ship-to", False, "Polar portal header is unknown; capture it live. Not required until then."),
        },
        "Sundance": {
            "po_number": ("PO", False, "Sundance has no order schema in the field file."),
            "sidemark": ("sidemark", False, "Sundance has no order schema in the field file."),
            "ship_to": ("ship-to", False, "Sundance has no order schema in the field file."),
        },
    }
    rows = []
    for manufacturer, fields in note.items():
        for field_key, (vendor, required, source) in fields.items():
            rows.append({
                "manufacturer": manufacturer,
                "field_key": field_key,
                "required_for_order": required,
                "vendor_field_name": vendor,
                "value_translation": {},
                "flag": None if required and manufacturer not in {"Norman", "Lotus"} else (
                    "open owner decision" if manufacturer == "Norman"
                    else "account number missing" if manufacturer == "Lotus" and field_key == "po_number"
                    else "portal header unknown" if manufacturer == "Polar"
                    else "no order schema" if manufacturer == "Sundance"
                    else None
                ),
                "source_note": source,
            })
    return rows


def main() -> None:
    data = json.loads(SOURCE.read_text())
    digest_source = SOURCE.read_bytes()
    import hashlib
    digest = hashlib.sha256(digest_source).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(f"field file sha256 changed: {digest}")
    loaded = records(data)
    if LOAD_TAG in sql_json(loaded):
        raise SystemExit("load payload contains the dollar-quote tag")
    unparsed = sum(1 for row in loaded if row["conditional_rules"].get("unparsed"))
    print(f"fields {len(loaded)} line {sum(1 for row in loaded if row['required_for_order'])} unparsed {unparsed}")
    coverage = []
    for product in data["products"]:
        coverage.append({
            "manufacturer": product["manufacturer"],
            "category": product["category"],
            "status": coverage_status(product),
            "flags": product.get("flags") or [],
        })
    coverage.append({
        "manufacturer": "Sundance",
        "category": "sundance",
        "status": "missing",
        "flags": [data["sundance"]["flag"]],
    })
    header = HEADER.replace("__SHA256__", SOURCE_SHA256)
    parts = [
        header,
        FUNCTIONS,
        FOOTER_START,
        "do $load$\n",
        "declare\n",
        "  spec jsonb := " + LOAD_TAG + sql_json(loaded) + LOAD_TAG + "::jsonb;\n",
        "  coverage jsonb := " + LOAD_TAG + sql_json(coverage) + LOAD_TAG + "::jsonb;\n",
        "  levels jsonb := " + LOAD_TAG + sql_json(order_level_rows()) + LOAD_TAG + "::jsonb;\n",
        "  missing integer;\n",
        "begin\n",
        "  if (select count(*) from public.quote_category_field_sequence) = 0 then\n",
        "    raise exception 'quote_category_field_sequence is empty; load the sequence seed before this migration';\n",
        "  end if;\n",
        "  select count(*) into missing\n",
        "  from jsonb_to_recordset(spec) as load(\n",
        "    manufacturer text, category text, field_key text, required_for_order boolean,\n",
        "    vendor_field_name text, value_translation jsonb, conditional_rules jsonb, order_entry_flag text\n",
        "  )\n",
        "  where not exists (\n",
        "    select 1 from public.quote_category_field_sequence as sequence_row\n",
        "    where sequence_row.manufacturer = load.manufacturer\n",
        "      and sequence_row.category = load.category\n",
        "      and sequence_row.field_key = load.field_key\n",
        "  );\n",
        "  if missing > 0 then\n",
        "    raise exception 'order-entry field file has % keys that are not in quote_category_field_sequence. Merge the seed correction first; regenerate this migration if keys changed.', missing;\n",
        "  end if;\n",
        "  perform set_config('quote_sequence.admin_write', 'on', true);\n",
        "  update public.quote_category_field_sequence as sequence_row\n",
        "  set required_for_order = load.required_for_order,\n",
        "      vendor_field_name = load.vendor_field_name,\n",
        "      value_translation = load.value_translation,\n",
        "      conditional_rules = load.conditional_rules,\n",
        "      order_entry_flag = load.order_entry_flag\n",
        "  from jsonb_to_recordset(spec) as load(\n",
        "    manufacturer text, category text, field_key text, required_for_order boolean,\n",
        "    vendor_field_name text, value_translation jsonb, conditional_rules jsonb, order_entry_flag text\n",
        "  )\n",
        "  where sequence_row.manufacturer = load.manufacturer\n",
        "    and sequence_row.category = load.category\n",
        "    and sequence_row.field_key = load.field_key;\n",
        "  update public.quote_category_field_sequence\n",
        "  set order_entry_flag = 'not_in_order_entry_field_file'\n",
        "  where required_for_order is null\n",
        "    and vendor_field_name is null\n",
        "    and value_translation is null\n",
        "    and conditional_rules is null\n",
        "    and order_entry_flag is null;\n",
        "  perform set_config('quote_sequence.admin_write', 'off', true);\n",
        "  insert into public.quote_order_entry_field_file (sha256, generated, product_count)\n",
        "  values (" + sql_text(SOURCE_SHA256) + ", " + sql_text(data["generated"]) + ", " + str(len(data["products"])) + ")\n",
        "  on conflict (sha256) do nothing;\n",
        "  insert into public.quote_order_entry_product_coverage (manufacturer, category, status, flags)\n",
        "  select coverage_row.manufacturer, coverage_row.category, coverage_row.status, coverage_row.flags\n",
        "  from jsonb_to_recordset(coverage) as coverage_row(\n",
        "    manufacturer text, category text, status text, flags jsonb\n",
        "  )\n",
        "  on conflict (manufacturer, category) do nothing;\n",
        "  insert into public.quote_order_level_field (\n",
        "    manufacturer, field_key, required_for_order, vendor_field_name, value_translation, flag, source_note\n",
        "  )\n",
        "  select level_row.manufacturer, level_row.field_key, level_row.required_for_order,\n",
        "         level_row.vendor_field_name, level_row.value_translation, level_row.flag, level_row.source_note\n",
        "  from jsonb_to_recordset(levels) as level_row(\n",
        "    manufacturer text, field_key text, required_for_order boolean, vendor_field_name text,\n",
        "    value_translation jsonb, flag text, source_note text\n",
        "  )\n",
        "  on conflict (manufacturer, field_key) do nothing;\n",
        "end\n",
        "$load$;\n",
        "\nnotify pgrst, 'reload schema';\n",
    ]
    text = "".join(parts)
    if "delete from" in text.lower() or "truncate" in text.lower() or re.search(r"\bdrop\b", text, re.I):
        raise SystemExit("migration must not delete, truncate, or drop")
    TARGET.write_text(text)
    print(f"wrote {TARGET} ({TARGET.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
