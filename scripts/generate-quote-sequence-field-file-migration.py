#!/usr/bin/env python3
"""Build the quote-sequence correction migration from the field file.

The migration is additive. Wrong seed rows are superseded (active = false).
Nothing is deleted. Writes run inside quote_sequence_begin_migration, which
only the table owner can execute, and only for this field-file sha256.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/seed-sources/805-order-entry-fields.json"
BASELINE = ROOT / "supabase/migrations/20261121160000_quote_category_field_sequence.sql"
OUT = ROOT / "supabase/migrations/20261122020000_quote_sequence_field_file_corrections.sql"
SHA = "2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd"

SPECIALTY_SHUTTER_TYPES = [
    "ByPass-Close",
    "ByPass-Open",
    "Bi-Fold Tracking",
    "Sunburst",
    "Half Circle",
    "Elongated Eyebrow",
    "Eyebrow",
    "Circle",
    "Oval",
    "Quarterburst",
    "Octagon",
    "Sunburst Shutters",
    "Arch Shutters",
    "Elongated Eyebrow Shutters",
    "Half Rake L",
    "Full Rake",
    "Half Rake R",
    "Barn Door",
]

# Norman portal codes from src/lib/crm/vendor-orders/norman-roller.ts.
# The field file names F014 / "6 inch Fabric Valance" and says the trailing * is a surcharge marker.
VALANCE_CODES = {
    "Square Fascia*": ("F001", "Square Fascia"),
    "Plain Curved Fascia*": ("F002", "Plain Curved Fascia"),
    "Curved Fascia with Fabric*": ("F009", "Curved Fascia with Fabric"),
    '3 1/2" Fabric Valance*': ("F010", '3 1/2" Fabric Valance'),
    '4 1/2" Fabric Valance*': ("F011", '4 1/2" Fabric Valance'),
    '6" Fabric Valance*': ("F014", "6 inch Fabric Valance"),
    '8" Fabric Valance*': ("F017", '8" Fabric Valance'),
    '4 1/2" Modern Wood Valance*': ("MOD", '4 1/2" Modern Wood Valance'),
    "Cassette*": ("F013", "Cassette"),
}

ROLLER_CATEGORIES = {"roller", "elite_patio", "interior_roller", "mega_exterior", "titan_patio"}
AWNING_CATEGORIES = {
    "drop_arm_window_awning",
    "premium_awning",
    "premium_plus_awning",
    "premium_pro_awning",
    "select_awning",
}
LIFT_CATEGORIES = {"perfectsheer", "roman", "smartfold", "honeycomb", "vertical_honeycomb"}


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def motorized_lift() -> dict:
    return {
        "op": "any",
        "rules": [
            {"op": "eq", "field": "lift_system", "value": "Motorized"},
            {"op": "contains", "field": "lift_system", "value": "motor"},
        ],
    }


def not_motorized_lift() -> dict:
    return {"op": "not", "rule": motorized_lift()}


def roller_motorized() -> dict:
    # control_type is the lift choice. The separate motorized yes/no repeats it.
    return {"op": "eq", "field": "control_type", "value": "Motorized"}


def rule_for(product: dict, field: dict) -> dict:
    conditional = field["conditional"]
    category = product["category"]
    depends = field["depends_on"]
    if conditional == "panel_configuration contains 'T'":
        return {"op": "contains", "field": "panel_configuration", "value": "T"}
    if conditional == "divider rail chosen":
        return {"op": "contains", "field": "divider_panel_layout", "value": "divider"}
    if conditional == "if frame depth needs build-out":
        return {"op": "contains", "field": "frame_type", "value": "build-out"}
    if conditional == "only specialty shapes":
        return {"op": "eq", "field": "specialty_shape_requested", "value": "Yes"}
    if conditional == "not for motorized":
        return not_motorized_lift()
    if conditional == "corded/wand only":
        return not_motorized_lift()
    if conditional == "magnetic only with outside mount; magnetic needs color":
        return {"op": "eq", "field": "mount_type", "value": "Outside Mount"}
    if conditional == "outside mount / valance":
        return {
            "op": "any",
            "rules": [
                {"op": "eq", "field": "mount_type", "value": "Outside Mount"},
                {
                    "op": "all",
                    "rules": [
                        {"op": "answered", "field": "valance_type"},
                        {"op": "not_in", "field": "valance_type", "values": ["No", "None", "No Valance"]},
                    ],
                },
            ],
        }
    if conditional == "inside mount narrow frames":
        return {"op": "eq", "field": "mount_type", "value": "Inside Mount"}
    if conditional == "if obstruction":
        return {"op": "eq", "field": "obstruction", "value": "Yes"}
    if conditional == "wide valance splice":
        return {"op": "eq", "field": "valance_splice", "value": "Yes"}
    if conditional == "outside mount (Norman)":
        return {"op": "eq", "field": "mount_type", "value": "Outside Mount"}
    if conditional == "if Day & Night lift system":
        return {
            "op": "any",
            "rules": [
                {"op": "contains", "field": "lift_system", "value": "Day & Night"},
                {"op": "contains", "field": "lift_system", "value": "Day and Night"},
            ],
        }
    if conditional == "inside mount":
        return {"op": "eq", "field": "mount_type", "value": "Inside Mount"}
    if conditional == "only if motorized lift":
        return motorized_lift()
    if conditional == "for arches/angles":
        return {"op": "in", "field": "opening_shape", "values": ["Arch", "Angle"]}
    if conditional == "if shelf ordered with product":
        return {"op": "eq", "field": "shelf_ordered_with_product", "value": "Yes"}
    if conditional == "only if motorized":
        if category in AWNING_CATEGORIES or "manual_motorized" in depends:
            return {"op": "eq", "field": "manual_motorized", "value": "Motorized"}
        if category == "smartdrape":
            return {"op": "eq", "field": "wand_motor", "value": "Motorized"}
        if category == "motorized_drapery_track":
            return {"op": "answered", "field": "motor_type"}
        if category == "all_seasons_retractable_screen":
            return {"op": "in", "field": "motorized", "values": ["Yes", "Motorized", "true"]}
        if category in LIFT_CATEGORIES or "lift_system" in depends or "motor_power" in depends:
            return motorized_lift()
        return roller_motorized()
    if conditional == "if valance chosen":
        return {
            "op": "all",
            "rules": [
                {"op": "answered", "field": "valance_fascia"},
                {"op": "not_in", "field": "valance_fascia", "values": ["No", "None", "No Valance"]},
            ],
        }
    if conditional == "if width > fabric width":
        return {"op": "wider_than_fabric"}
    if conditional == "by control_type":
        return {"op": "not_in", "field": "control_type", "values": ["Cordless"]}
    if conditional in ("only Continuous Cord Loop", "only cord loop"):
        return {"op": "eq", "field": "control_type", "value": "Continuous Cord Loop"}
    if conditional == "if valance not No Valance":
        return {"op": "neq", "field": "valance_fascia_type", "value": "No Valance"}
    if conditional == "only if motorized battery":
        return {
            "op": "any",
            "rules": [
                {"op": "eq", "field": "power_source", "value": "Battery"},
                {"op": "contains", "field": "power_source", "value": "battery"},
            ],
        }
    if conditional == "if valance":
        return {
            "op": "all",
            "rules": [
                {"op": "answered", "field": "valance_type"},
                {"op": "not_in", "field": "valance_type", "values": ["No", "None", "No Valance"]},
            ],
        }
    if conditional.startswith("live_portal_verified"):
        return {
            "op": "any",
            "rules": [
                {"op": "eq", "field": "hinge_color", "value": "Paint to Match"},
                {"op": "eq", "field": "stile", "value": "Rabbet"},
                {"op": "contains", "field": "other_options", "value": "Hidden Hinge"},
            ],
        }
    if conditional == "divider_rail = Custom":
        return {"op": "eq", "field": "divider_rail", "value": "Custom"}
    if conditional == "split_tilt_rod = Custom":
        return {"op": "eq", "field": "split_tilt_rod", "value": "Custom"}
    if conditional == "shutter_type = French Door":
        return {"op": "eq", "field": "shutter_type", "value": "French Door"}
    if conditional.startswith("shutter_type is a specialty"):
        return {"op": "in", "field": "shutter_type", "values": SPECIALTY_SHUTTER_TYPES}
    if conditional == "roof/soffit mount":
        return {
            "op": "any",
            "rules": [
                {"op": "contains", "field": "mount_surface", "value": "roof"},
                {"op": "contains", "field": "mount_surface", "value": "soffit"},
            ],
        }
    if conditional == "only if manual":
        return {"op": "eq", "field": "manual_motorized", "value": "Manual"}
    if conditional == "only if Bent":
        return {"op": "eq", "field": "straight_bent", "value": "Bent"}
    raise SystemExit(f"unmapped conditional on {category}.{field['key']}: {conditional}")


def parse_polar_options(flag: str) -> dict[str, list[str]]:
    match = re.search(
        r"guides ([^,]+), Somfy ([^,]+) motors, ([^,]+) valances, hardware (.+?) \(web:",
        flag,
    )
    if not match:
        raise SystemExit("Polar option sentence was not found in the field file")
    guides = [part.strip() for part in match.group(1).split("/") if part.strip()]
    motors = ["Somfy " + part.strip() for part in match.group(2).split("/") if part.strip()]
    valances = [part[:1].upper() + part[1:] for part in (piece.strip() for piece in match.group(3).split("/")) if part]
    hardware = [part.strip() for part in match.group(4).split("/") if part.strip()]
    parsed = {"guide": guides, "motor": motors, "valance": valances, "hardware_color": hardware}
    if parsed["guide"] != ["Cable", "Side Channel", "ZipRite track"]:
        raise SystemExit(f"unexpected guides: {parsed['guide']}")
    if parsed["motor"] != ["Somfy Standard", "Somfy RTS", "Somfy RS485"]:
        raise SystemExit(f"unexpected motors: {parsed['motor']}")
    if parsed["valance"] != ["Cassette", "Hood", "Head pocket"]:
        raise SystemExit(f"unexpected valances: {parsed['valance']}")
    if parsed["hardware_color"] != ["White", "Tan", "Bronze", "Sand", "Camel", "Black", "Custom RAL"]:
        raise SystemExit(f"unexpected hardware: {parsed['hardware_color']}")
    return parsed


def must_replace(sql: str, old: str, new: str, label: str) -> str:
    count = sql.count(old)
    if count == 0:
        raise SystemExit(f"pattern missing while patching {label}: {old[:120]!r}")
    return sql.replace(old, new)


def extract_functions(sql: str) -> dict[str, str]:
    functions: dict[str, str] = {}
    for match in re.finditer(r"create or replace function public\.(\w+)\(", sql):
        start = match.start()
        end = sql.find("\n$fn$;", start)
        if end < 0:
            raise SystemExit(f"unterminated function {match.group(1)}")
        functions[match.group(1)] = sql[start : end + len("\n$fn$;")]
    return functions


def patch_functions(functions: dict[str, str]) -> str:
    matching = functions["quote_sequence_matching_choices"]
    matching = must_replace(
        matching,
        "and public.quote_sequence_when_matches(c.when_spec, p_answers)",
        "and c.active\n      and public.quote_sequence_when_matches(c.when_spec, p_answers)",
        "matching choices",
    )

    resolve = functions["quote_sequence_resolve_version"]
    resolve = must_replace(
        resolve,
        "lower(btrim(p_category))",
        "lower(btrim(p_category)) and active",
        "resolve version",
    )

    answer = functions["quote_sequence_field_answer"]
    answer = must_replace(
        answer,
        "and alias.schema_field_key = p_field\n",
        "and alias.schema_field_key = p_field and alias.active\n",
        "field answer",
    )
    conflict = functions["quote_sequence_answer_conflict"]
    conflict = must_replace(
        conflict,
        "and alias.schema_field_key = p_field\n",
        "and alias.schema_field_key = p_field and alias.active\n",
        "answer conflict",
    )

    nxt = functions["quote_next_required_field"]
    nxt = must_replace(
        nxt,
        "  saved_key text;\nbegin",
        "  saved_key text;\n  applies_state text;\n  gap_reason text;\n  requested_manufacturer text := manufacturer;\n  requested_category text := category;\nbegin",
        "next declare",
    )
    nxt = must_replace(
        nxt,
        "begin\n  resolved := public.quote_sequence_resolve_version(manufacturer, category, spec->>'catalog_version');\n",
        """begin
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
""",
        "next product gap",
    )
    nxt = must_replace(
        nxt,
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.field_key = dep",
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and s.field_key = dep",
        "next dep active",
    )
    nxt = must_replace(
        nxt,
        "and alias.saved_key = dep",
        "and alias.active and alias.saved_key = dep",
        "next alias dep",
    )
    nxt = must_replace(
        nxt,
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version\n",
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active\n",
        "next sequence active",
    )
    nxt = must_replace(
        nxt,
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and not s.required",
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and not s.required",
        "next optional active",
    )
    nxt = must_replace(
        nxt,
        "and alias.schema_field_key = rec.field_key and answers ? alias.saved_key",
        "and alias.schema_field_key = rec.field_key and alias.active and answers ? alias.saved_key",
        "next alias active",
    )
    nxt = must_replace(
        nxt,
        "and c.field_key = rec.field_key;",
        "and c.field_key = rec.field_key and c.active;",
        "next choice count",
    )
    nxt = must_replace(
        nxt,
        "and c.field_key = rec.field_key and c.choice_value = raw->>'fraction'",
        "and c.field_key = rec.field_key and c.active and c.choice_value = raw->>'fraction'",
        "next fraction",
    )
    nxt = must_replace(
        nxt,
        "and c.field_key = rec.field_key and c.choice_value = raw #>> '{}'",
        "and c.field_key = rec.field_key and c.active and c.choice_value = raw #>> '{}'",
        "next typed choice",
    )
    nxt = must_replace(
        nxt,
        "    raw := public.quote_sequence_field_answer(answers, maker, line, version, rec.field_key);\n",
        """    raw := public.quote_sequence_field_answer(answers, maker, line, version, rec.field_key);
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
""",
        "next applies",
    )
    nxt = must_replace(
        nxt,
        "  optional_key := null;\n",
        """  if next_key is null then
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
""",
        "next pending scan",
    )
    nxt = must_replace(
        nxt,
        """    if kept ? rec.field_key then
      continue;
    end if;
""",
        """    if kept ? rec.field_key then
      continue;
    end if;
    if public.quote_sequence_applies_state(coalesce(rec.applies_when, '{}'::jsonb), kept, maker, line, version, 0) <> 'yes' then
      continue;
    end if;
""",
        "next optional applies",
    )

    validate = functions["quote_validate_tapped_value"]
    validate = must_replace(
        validate,
        "  prior record;\nbegin",
        "  prior record;\n  applies_state text;\n  gap_reason text;\n  requested_manufacturer text := manufacturer;\n  requested_category text := category;\nbegin",
        "validate declare",
    )
    validate = must_replace(
        validate,
        "begin\n  resolved := public.quote_sequence_resolve_version(manufacturer, category, spec->>'catalog_version');\n",
        """begin
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
""",
        "validate product gap",
    )
    validate = must_replace(
        validate,
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version\n",
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active\n",
        "validate sequence active",
    )
    validate = must_replace(
        validate,
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.field_key = p_field_key;",
        "where s.manufacturer = maker and s.category = line and s.catalog_version = version and s.active and s.field_key = p_field_key;",
        "validate field active",
    )
    validate = must_replace(
        validate,
        """  if not found then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'reason', 'field is not in the sequence', 'choices', '[]'::jsonb);
  end if;
""",
        """  if not found then
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
""",
        "validate applies",
    )
    validate = must_replace(
        validate,
        "and c.field_key = p_field_key;",
        "and c.field_key = p_field_key and c.active;",
        "validate choice count",
    )
    validate = must_replace(
        validate,
        "and c.field_key = p_field_key and c.choice_value = p_value->>'fraction'",
        "and c.field_key = p_field_key and c.active and c.choice_value = p_value->>'fraction'",
        "validate fraction",
    )

    write = functions["quote_category_field_sequence_write"]
    write = must_replace(
        write,
        """    insert into public.quote_category_field_sequence (
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
""",
        """    insert into public.quote_category_field_sequence (
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
""",
        "admin write applies_when",
    )

    return "\n\n".join([matching, resolve, answer, conflict, nxt, validate, write])


APPLIES_FUNCTION = r'''
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
'''


def data_sql(payload: dict, polar_options: dict[str, list[str]], rules: list[dict], color_categories: list[str], polar_categories: list[str], polar_fields: list[str]) -> str:
    rules_json = json.dumps(rules, separators=(",", ":"))
    color_list = ", ".join(sql_text(category) for category in color_categories)
    polar_list = ", ".join(sql_text(category) for category in polar_categories)
    polar_field_list = ", ".join(sql_text(field) for field in polar_fields)
    valance_values = ",\n    ".join(
        f"({sql_text(old)}, {sql_text(code)}, {sql_text(label)})"
        for old, (code, label) in VALANCE_CODES.items()
    )
    option_values = []
    for field_key, values in polar_options.items():
        for value in values:
            option_values.append(f"({sql_text(field_key)}, {sql_text(value)})")
    option_sql = ",\n    ".join(option_values)
    sundance_reason = payload["sundance"]["flag"]
    onyx_blocked = next(
        flag for flag in next(p for p in payload["products"] if p["category"] == "onyx_us_made_vinyl")["flags"] if flag.startswith("BLOCKED:")
    )
    onyx_poly = next(
        flag for flag in next(p for p in payload["products"] if p["category"] == "poly_composite")["flags"] if flag.startswith("Check:")
    )
    color_reason = "color_name/color_code choices were the Norman roller fabric list. Real color list needed."
    field_order = {"guide": 42, "motor": 43, "valance": 44, "hardware_color": 45}
    order_values = ", ".join(f"({sql_text(key)}, {order})" for key, order in field_order.items())
    return f'''
do $correction$
declare
  sha text := {sql_text(SHA)};
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
  from jsonb_to_recordset({sql_text(rules_json)}::jsonb)
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
  insert into polar_product_fields (field_key) values {", ".join(f"({sql_text(field)})" for field in polar_fields)};

  with old_rows as (
    select * from public.quote_category_field_sequence
    where manufacturer = 'Polar'
      and category in ({polar_list})
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
  if updated_count <> (select count(*) from polar_product_fields) * {len(polar_categories)} then
    raise exception 'polar roller field supersede count was %', updated_count;
  end if;

  with old_rows as (
    select choice.*
    from public.quote_catalog_field_choice choice
    where choice.manufacturer = 'Polar'
      and choice.category in ({polar_list})
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
      and alias.category in ({polar_list})
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
  insert into polar_new_fields (field_key, ask_order) values {order_values};

  with inserted as (
    insert into public.quote_category_field_sequence (
      manufacturer, category, field_key, ask_order, required, input_kind, depends_on,
      catalog_version, inferred, set_by, set_at, applies_when, active
    )
    select 'Polar', versions.category, fields.field_key, fields.ask_order, true, 'buttons', '{{}}'::text[],
      versions.catalog_version, false, 'migration', now(), '{{}}'::jsonb, true
    from (
      select distinct category, catalog_version
      from public.quote_category_field_sequence
      where manufacturer = 'Polar' and category in ({polar_list})
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
  if updated_count <> {len(polar_categories) * len(polar_options)} then
    raise exception 'polar replacement field insert count was %', updated_count;
  end if;

  create temporary table polar_new_choices (field_key text, choice_value text) on commit drop;
  insert into polar_new_choices (field_key, choice_value) values
    {option_sql};

  with inserted as (
    insert into public.quote_catalog_field_choice (
      manufacturer, category, field_key, choice_value, choice_label, catalog_version,
      when_spec, min_width, max_width, min_height, max_height, size_rule, active
    )
    select 'Polar', versions.category, choices.field_key, choices.choice_value, choices.choice_value,
      versions.catalog_version, '{{}}'::jsonb, null, null, null, null, 'none', true
    from (
      select distinct category, catalog_version
      from public.quote_category_field_sequence
      where manufacturer = 'Polar' and category in ({polar_list}) and active
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
      and choice.category in ({color_list})
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
    {sql_text(color_reason)}, sha
  from public.quote_category_field_sequence sequence
  where sequence.manufacturer = 'Norman'
    and sequence.category in ({color_list})
    and sequence.field_key in ('color_name', 'color_code');

  create temporary table soluna_valance_map (old_value text, new_value text, new_label text) on commit drop;
  insert into soluna_valance_map (old_value, new_value, new_label) values
    {valance_values};

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
  select 'Onyx', 'onyx_us_made_vinyl', null, sequence.catalog_version, 'blocked', {sql_text(onyx_blocked)}, sha
  from public.quote_category_field_sequence sequence
  where sequence.manufacturer = 'Onyx' and sequence.category = 'onyx_us_made_vinyl'
  limit 1;
  insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256)
  select 'Onyx', 'poly_composite', null, sequence.catalog_version, 'incomplete', {sql_text(onyx_poly)}, sha
  from public.quote_category_field_sequence sequence
  where sequence.manufacturer = 'Onyx' and sequence.category = 'poly_composite'
  limit 1;
  insert into public.quote_sequence_catalog_gap (manufacturer, category, field_key, catalog_version, status, reason, source_sha256)
  values ('Sundance', '*', null, null, 'blocked', {sql_text(sundance_reason)}, sha);

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
      and category in ({color_list})
      and field_key in ('color_name', 'color_code')
      and active
  ) then
    raise exception 'an active Norman roller color remains on a blind or honeycomb';
  end if;

  perform public.quote_sequence_end_migration();
end
$correction$;
'''


def main() -> None:
    payload = json.loads(SOURCE.read_text())
    rules = []
    for product in payload["products"]:
        for field in product["fields"]:
            if not field["conditional"]:
                continue
            rules.append({
                "manufacturer": product["manufacturer"],
                "category": product["category"],
                "field_key": field["key"],
                "rule": rule_for(product, field),
            })
    color_categories = []
    polar_flag = None
    for product in payload["products"]:
        flags = product.get("flags") or []
        if any("Norman ROLLER fabric list" in flag for flag in flags):
            color_categories.append(product["category"])
        if product["category"] == "elite_patio":
            polar_flag = next(flag for flag in flags if "92 roller fabric" in flag)
    if not color_categories or polar_flag is None:
        raise SystemExit("field file is missing the color or polar conflict")
    polar_options = parse_polar_options(polar_flag)
    polar_categories = ["elite_patio", "interior_roller", "mega_exterior", "titan_patio"]
    polar_product = next(product for product in payload["products"] if product["category"] == "elite_patio")
    polar_fields = [field["key"] for field in polar_product["fields"] if field["ask_order"] >= 18]
    if "collection" not in polar_fields or "remote_channel" not in polar_fields:
        raise SystemExit("polar roller field list did not match the field file")

    functions = extract_functions(BASELINE.read_text())
    patched = patch_functions(functions)
    header = f"""-- Correct the quote sequence seed from supabase/seed-sources/805-order-entry-fields.json.
-- Source sha256: {SHA}
-- Additive only. Deletes stay rejected. Wrong rows are marked active = false and superseded_at is set.
-- The table owner (this migration) may write only while quote_sequence_begin_migration has set the
-- transaction-local flag for this sha256. App roles are not granted that function.
-- Column changes on quote_category_field_sequence are applies_when, active, and superseded_at.

"""
    ddl = """
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
"""
    migration_fns = f"""
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
  if p_sha256 is distinct from '{SHA}' then
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
"""
    closing = """
alter table public.quote_sequence_seed_audit enable row level security;
alter table public.quote_sequence_catalog_gap enable row level security;
alter table public.quote_sequence_seed_audit force row level security;
alter table public.quote_sequence_catalog_gap force row level security;
drop policy if exists quote_sequence_seed_audit_read on public.quote_sequence_seed_audit;
create policy quote_sequence_seed_audit_read on public.quote_sequence_seed_audit for select to anon, authenticated, service_role using (true);
drop policy if exists quote_sequence_catalog_gap_read on public.quote_sequence_catalog_gap;
create policy quote_sequence_catalog_gap_read on public.quote_sequence_catalog_gap for select to anon, authenticated, service_role using (true);
grant select on public.quote_sequence_seed_audit, public.quote_sequence_catalog_gap to anon, authenticated, service_role;
"""
    OUT.write_text(
        header
        + ddl
        + "\n"
        + APPLIES_FUNCTION
        + "\n"
        + patched
        + "\n"
        + migration_fns
        + "\n"
        + data_sql(payload, polar_options, rules, color_categories, polar_categories, polar_fields)
        + "\n"
        + closing
    )
    print(f"wrote {OUT.name}: rules {len(rules)}, color products {len(color_categories)}, polar fields {len(polar_fields)}")
    print("color", ", ".join(color_categories))
    print("polar options", {key: values for key, values in polar_options.items()})


if __name__ == "__main__":
    main()
