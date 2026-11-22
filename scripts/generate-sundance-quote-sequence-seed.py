#!/usr/bin/env python3
"""Seed Sundance quote-sequence rows from data/order-entry/805-sundance-order-fields.json.

Inserts and upserts only. The wildcard Sundance gap from #113 stays in place.
quote_next_required_field ignores that wildcard once a category has active rows,
and a product-level gap still blocks a product the field file marks blocked.
"""

from __future__ import annotations

import json
import re
import zipfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/order-entry/805-sundance-order-fields.json"
PRIOR = ROOT / "supabase/migrations/20261122020000_quote_sequence_field_file_corrections.sql"
OUT = ROOT / "supabase/migrations/20261122051000_sundance_quote_sequence_seed.sql"
REPORT = ROOT / "data/order-entry/sundance-seed-report.json"
SHA = "e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656"
PRIOR_SHA = "2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd"
CATALOG_VERSION = "sundance-assortment-2026-09-26-r15"
SET_AT = "timestamptz '2026-11-21 18:18:00+00'"
BYTE_LIMIT = 900 * 1024

ORDER_TYPES = [
    ("Portfolio Soft Roman", "sundance_portfolio_roman"),
    ("Wovenwood", "sundance_walden_premier"),
    ("Euro Panel", "sundance_europanels"),
    ("Cellular Shade", "sundance_cellular"),
    ("Clutch Roller", "sundance_roller"),
    ("Caress-Zebra", "sundance_zebra"),
    ("SheerView Plus", "sundance_sheerview"),
    ("Motorized Roller", "sundance_roller"),
    ("Zipper Screen Exterior", "sundance_exterior_zip"),
    ("1-inch Aluminum", "sundance_aluminum_1"),
    ("2-inch Aluminum", "sundance_aluminum_2"),
    ("Vertical Essence", "sundance_vertical_essence"),
    ("2-inch Advantage", "sundance_advantage_ii_2"),
    ("2.5-inch Advantage", "sundance_advantage_ii_2_5"),
    ("2-inch Wood", "sundance_premium_ii_2"),
    ("2.5-inch Wood", "sundance_premium_ii_2_5"),
    ("Glydea Track", "sundance_drapery_track"),
]

PORTAL_TYPE_FOR_ORDER = {
    "Clutch Roller": "Clutch Roller / Motorized Roller",
    "Motorized Roller": "Clutch Roller / Motorized Roller",
}

FORCE_INCOMPLETE = {
    "material flagged 'EDGE BINDING A MUST'",
    "if panels are not equal-split; no overlap formula published",
    "2+ zebras in same opening/room that must align",
    "multiple shades side by side",
    "Repo blocks Inside; confirm",
}

PROSE_MARKERS = (
    "e.g.",
    "portal row",
    "portal rows",
    "portal labels",
    "unknown",
    "not captured",
    "not parsed",
    "form shows",
    "repo:",
    "mapped",
    "price group",
    "web form",
    "unconfirmed",
    "confirm",
    "—",
)


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_json(value: dict) -> str:
    return sql_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def sql_array(values: list[str]) -> str:
    if not values:
        return "'{}'::text[]"
    return "array[" + ",".join(sql_text(value) for value in values) + "]::text[]"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def order_type_category(name: str) -> str:
    return "order_type:" + slug(name)


def key_slug(value: str) -> str:
    lowered = value.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "_", lowered).strip("_")


def title_slug(value: str) -> str:
    return "-".join(part[:1].upper() + part[1:] for part in key_slug(value).split("_") if part)


def motorized(field: str) -> dict:
    return {
        "op": "any",
        "rules": [
            {"op": "contains", "field": field, "value": token}
            for token in ("motor", "somfy", "simphony", "alpha", "li-ion", "li-on", "rechargeable", "wirefree")
        ],
    }


def rule_for(field: dict) -> dict:
    conditional = field["conditional"].strip()
    if not conditional:
        return {}
    depends = field["depends_on"]
    dep = depends[0] if depends else ""

    def eq(name: str, value: str) -> dict:
        return {"op": "eq", "field": name, "value": value}

    def neq(name: str, value: str) -> dict:
        return {"op": "neq", "field": name, "value": value}

    def contains(name: str, value: str) -> dict:
        return {"op": "contains", "field": name, "value": value}

    if conditional in FORCE_INCOMPLETE:
        if depends:
            return {"op": "all", "rules": [{"op": "answered", "field": name} for name in depends]}
        return {}
    if conditional == "default auto-fills; ask only if not default":
        return {"op": "answered", "field": "headrail"}
    if conditional in {"control = motorized", "motorized control", "motor power type", "motorized; must match motor brand", "motorized; oversize tube mandatory for Sonesse 40/50, Simphony 40/50, Alpha 40"}:
        return motorized("control")
    if conditional == "motorized":
        return motorized(dep or "control")
    if conditional == "motorized systems":
        return motorized("system")
    if conditional == "motorized; one per order may suffice — portal auto-selected on 1 of 4 lines":
        return motorized("motor_type")
    if conditional == "Li-ion motor":
        return {"op": "any", "rules": [contains("control", "li-ion"), contains("control", "li-on"), contains("control", "rechargeable")]}
    if conditional == "control = Continuous Cord Loop":
        return contains("control", "continuous cord loop")
    if conditional == "control = Beaded Chain":
        return contains("control", "beaded chain")
    if conditional == "control = Beaded Chain / clutch":
        return {"op": "any", "rules": [contains("control", "beaded chain"), contains("control", "clutch")]}
    if conditional == "control = Pro Wand":
        return contains("control", "pro wand")
    if conditional == "motor wand":
        return contains("control", "wand")
    if conditional == "control = Clutch and Loop":
        return contains("control", "clutch and loop")
    if conditional == "clutch, wand or motor":
        return {"op": "any", "rules": [contains("control", "clutch"), contains("control", "wand"), *motorized("control")["rules"]]}
    if conditional == "clutch or motor":
        return {"op": "any", "rules": [contains("control", "clutch"), *motorized("control")["rules"]]}
    if conditional == "top_treatment != Open roll":
        return neq("top_treatment", "Open roll")
    if conditional == "top_treatment = Small/Large Round Cassette":
        return contains("top_treatment", "round cassette")
    if conditional == "bottomrail = Exposed":
        return contains("bottomrail", "exposed")
    if conditional == "privacy != None":
        return neq("privacy", "None")
    if conditional == "assembly = Dual independent (vertical open-roll = inside mount only)":
        return contains("assembly", "dual")
    if conditional == "mount = Inside" or conditional.startswith("Inside mount"):
        if "headrail" in depends:
            return {"op": "all", "rules": [eq("mount_type", "Inside"), {"op": "answered", "field": "headrail"}]}
        return eq("mount_type", "Inside")
    if conditional == "outside mount or custom return":
        return {"op": "any", "rules": [eq("mount_type", "Outside"), contains("mount_type", "custom")]}
    if conditional == "system = Cordless Day/Night":
        return contains("system", "day/night")
    if conditional == "system = Verticell":
        return contains("system", "verticell")
    if conditional == "system = Specialty Shape":
        return contains("system", "specialty")
    if conditional == "shape set":
        return {"op": "answered", "field": "shape"}
    if conditional == "non-perfect shape":
        return eq("shape_geometry", "Non-perfect")
    if conditional == "specialty shape":
        return contains("shape", "specialty")
    if conditional == "ladder = tape":
        return contains("ladder", "tape")
    if conditional == "assembly != Single":
        return neq("assembly", "Single")
    if conditional == "valance != None and Outside mount":
        return {"op": "all", "rules": [neq("valance", "None"), eq("mount_type", "Outside")]}
    if conditional == "returns != None":
        return neq("returns", "None")
    if conditional == "style = Valance Only":
        return eq("style", "Valance Only")
    if conditional == "drop = Waterfall":
        return eq("drop", "Waterfall")
    if conditional == "valance added":
        return eq("front_valance", "Added")
    if conditional == "motor != No":
        return neq("motor_type", "No")
    if conditional.startswith("Owner decision pending"):
        return {}
    raise SystemExit(f"unmapped conditional on {field['key']}: {conditional}")


def closed_choices(allowed: str) -> list[str] | None:
    text = allowed.strip()
    lowered = text.lower()
    offered = re.fullmatch(r"portal offers only '([^']+)'.*", text, flags=re.IGNORECASE)
    if offered:
        return [offered.group(1)]
    if any(marker in lowered for marker in PROSE_MARKERS):
        return None
    only_option = re.fullmatch(r"(.+?) \(only option\)$", text, flags=re.IGNORECASE)
    if only_option:
        return [only_option.group(1).strip()]
    if lowered == "one way only":
        return [text]
    if lowered.startswith("default ") and "flat finishes" in lowered:
        head, finishes = re.split(r";\s*flat finishes\s+", text, maxsplit=1, flags=re.IGNORECASE)
        default_name = re.sub(r"^default\s+", "", head, flags=re.IGNORECASE).strip()
        items = [item.strip() for item in finishes.split(",") if item.strip()]
        if default_name and items and all(len(item) <= 80 for item in items):
            return [default_name, *items]
        return None
    if " | " not in text:
        return None
    if re.search(r"\([^)]*\|[^)]*\)", text):
        return None
    main = re.sub(r"\s*\([^)]*\)\s*$", "", text).strip()
    parts = [part.strip() for part in main.split("|")]
    parts = [part for part in parts if part]
    if len(parts) < 2:
        return None
    if any(len(part) > 80 or ";" in part for part in parts):
        return None
    return parts


def input_kind(kind: str) -> str:
    if kind in {"button", "yesno"}:
        return "buttons"
    return "typed"


def required_flag(value: str) -> bool:
    return value != "optional"


def pending_reason(field: dict, choices: list[str] | None) -> str | None:
    if field["needs_live_form_check"]:
        return "needs live form check"
    if field["conditional"] in FORCE_INCOMPLETE:
        return "no closed list in the field file"
    if field["kind"] in {"button", "yesno"} and not choices:
        return "no closed list in the field file"
    return None


def chunk(rows: list[str], size: int) -> list[list[str]]:
    return [rows[index:index + size] for index in range(0, len(rows), size)]


def extract_function(sql: str, name: str) -> str:
    marker = f"create or replace function public.{name}("
    start = sql.find(marker)
    if start < 0:
        raise SystemExit(f"missing function {name}")
    end = sql.find("\n$fn$;", start)
    if end < 0:
        raise SystemExit(f"unterminated function {name}")
    return sql[start:end + len("\n$fn$;")]


def patch_gap_lookup(function_sql: str) -> str:
    old = """    and (g.category = '*' or lower(g.category) = lower(btrim(requested_category)))
  order by case when g.category = '*' then 1 else 0 end"""
    new = """    and (
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
  order by case when g.category = '*' then 1 else 0 end"""
    count = function_sql.count(old)
    if count != 1:
        raise SystemExit(f"gap lookup pattern count {count} in function")
    return function_sql.replace(old, new)


def minimal_pdf(title: str) -> bytes:
    safe = title.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({safe}) Tj ET"
    objects = [
        "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
        "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
        "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
        f"4 0 obj<< /Length {len(stream)} >>stream\n{stream}\nendstream\nendobj\n",
        "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    ]
    body = "%PDF-1.4\n" + "".join(objects)
    xref_at = len(body.encode("latin-1"))
    xref = ["xref\n0 6\n0000000000 65535 f \n"]
    offset = len("%PDF-1.4\n".encode("latin-1"))
    for obj in objects:
        xref.append(f"{offset:010d} 00000 n \n")
        offset += len(obj.encode("latin-1"))
    trailer = f"trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF"
    return (body + "".join(xref) + trailer).encode("latin-1")


def minimal_docx(title: str, lines: list[str]) -> bytes:
    paragraphs = "".join(f"<w:p><w:r><w:t>{escape_xml(line)}</w:t></w:r></w:p>" for line in [title, *lines])
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{paragraphs}<w:sectPr/></w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document)
    return buffer.getvalue()


def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def sequence_sql(rows: list[dict]) -> str:
    groups = []
    for group in chunk(rows, 40):
        values = ",\n".join(
            "(" + ", ".join([
                sql_text(row["manufacturer"]),
                sql_text(row["category"]),
                sql_text(row["field_key"]),
                str(row["ask_order"]),
                "true" if row["required"] else "false",
                sql_text(row["input_kind"]),
                sql_array(row["depends_on"]),
                sql_text(row["catalog_version"]),
                "true" if row["inferred"] else "false",
                "'migration'",
                SET_AT,
                sql_json(row["applies_when"]),
            ]) + ")"
            for row in group
        )
        groups.append(
            "insert into public.quote_category_field_sequence ("
            "manufacturer, category, field_key, ask_order, required, input_kind, depends_on, "
            "catalog_version, inferred, set_by, set_at, applies_when) values\n"
            f"{values}\n"
            "on conflict (manufacturer, category, field_key, catalog_version) do update set\n"
            "  ask_order = excluded.ask_order,\n"
            "  required = excluded.required,\n"
            "  input_kind = excluded.input_kind,\n"
            "  depends_on = excluded.depends_on,\n"
            "  catalog_version = excluded.catalog_version,\n"
            "  inferred = excluded.inferred,\n"
            "  set_by = excluded.set_by,\n"
            "  set_at = excluded.set_at,\n"
            "  applies_when = excluded.applies_when\n"
            "where public.quote_category_field_sequence.manufacturer = 'Sundance';"
        )
    return "\n".join(groups)


def choice_sql(rows: list[dict]) -> str:
    if not rows:
        return ""
    groups = []
    for group in chunk(rows, 50):
        values = ",\n".join(
            "(" + ", ".join([
                sql_text(row["manufacturer"]),
                sql_text(row["category"]),
                sql_text(row["field_key"]),
                sql_text(row["choice_value"]),
                sql_text(row["choice_label"]),
                sql_text(row["catalog_version"]),
                "'{}'::jsonb",
                "null",
                "null",
                "null",
                "null",
                "'none'",
            ]) + ")"
            for row in group
        )
        groups.append(
            "insert into public.quote_catalog_field_choice ("
            "manufacturer, category, field_key, choice_value, choice_label, catalog_version, "
            "when_spec, min_width, max_width, min_height, max_height, size_rule) values\n"
            f"{values}\n"
            "on conflict (manufacturer, category, field_key, choice_value, when_spec, catalog_version) do update set\n"
            "  choice_label = excluded.choice_label\n"
            "where public.quote_catalog_field_choice.manufacturer = 'Sundance';"
        )
    return "\n".join(groups)


def gap_sql(rows: list[dict]) -> str:
    if not rows:
        return ""
    groups = []
    for group in chunk(rows, 40):
        values = ",\n".join(
            "(" + ", ".join([
                sql_text(row["manufacturer"]),
                sql_text(row["category"]),
                "null" if row["field_key"] is None else sql_text(row["field_key"]),
                "null" if row["catalog_version"] is None else sql_text(row["catalog_version"]),
                sql_text(row["status"]),
                sql_text(row["reason"]),
                sql_text(SHA),
            ]) + ")"
            for row in group
        )
        groups.append(
            "insert into public.quote_sequence_catalog_gap ("
            "manufacturer, category, field_key, catalog_version, status, reason, source_sha256) values\n"
            f"{values};"
        )
    return "\n".join(groups)


def build_records(payload: dict) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    products = {product["category"]: product for product in payload["products"]}
    if len(products) != 30:
        raise SystemExit(f"expected 30 products, found {len(products)}")
    header = payload["order_level_fields"]["sundance_order_header"]
    sequences: list[dict] = []
    choices: list[dict] = []
    gaps: list[dict] = []
    report_fields: list[dict] = []

    def add_scope(category: str, product: dict, include_product_gap: bool) -> None:
        if product["catalog_version"] != CATALOG_VERSION:
            raise SystemExit(f"unexpected catalog version on {product['category']}")
        blocked = product["status"] == "blocked"
        if include_product_gap and blocked:
            gaps.append({
                "manufacturer": "Sundance",
                "category": category,
                "field_key": None,
                "catalog_version": CATALOG_VERSION,
                "status": "blocked",
                "reason": product["flags"][0],
            })
        fields = list(header) + list(product["fields"])
        seen = set()
        for index, field in enumerate(fields, start=1):
            if field["key"] in seen:
                raise SystemExit(f"duplicate field {category}.{field['key']}")
            seen.add(field["key"])
            listed = None if field["needs_live_form_check"] or field["conditional"] in FORCE_INCOMPLETE else closed_choices(field["allowed"])
            reason = pending_reason(field, listed)
            kind = input_kind(field["kind"])
            if reason and kind == "buttons":
                listed = None
            applies = rule_for(field)
            inferred = bool(reason) or (include_product_gap and blocked)
            sequences.append({
                "manufacturer": "Sundance",
                "category": category,
                "field_key": field["key"],
                "ask_order": index,
                "required": required_flag(field["required"]),
                "input_kind": kind,
                "depends_on": list(field["depends_on"]),
                "catalog_version": CATALOG_VERSION,
                "inferred": inferred,
                "applies_when": applies,
            })
            if listed and not reason:
                for choice in listed:
                    choices.append({
                        "manufacturer": "Sundance",
                        "category": category,
                        "field_key": field["key"],
                        "choice_value": choice,
                        "choice_label": choice,
                        "catalog_version": CATALOG_VERSION,
                    })
            if reason:
                gaps.append({
                    "manufacturer": "Sundance",
                    "category": category,
                    "field_key": field["key"],
                    "catalog_version": CATALOG_VERSION,
                    "status": "incomplete",
                    "reason": reason,
                })
                if category == product["category"]:
                    report_fields.append({
                        "category": category,
                        "field_key": field["key"],
                        "reason": reason,
                        "needs_live_form_check": bool(field["needs_live_form_check"]),
                        "kind": field["kind"],
                    })
            for dependency in field["depends_on"]:
                if dependency not in {item["key"] for item in fields}:
                    raise SystemExit(f"{category}.{field['key']} depends on missing {dependency}")

    for product in payload["products"]:
        if product["manufacturer"] != "Sundance":
            raise SystemExit(product["manufacturer"])
        if product["status"] not in {"gaps", "blocked"}:
            raise SystemExit(product["status"])
        add_scope(product["category"], product, True)

    if len(ORDER_TYPES) != 17:
        raise SystemExit("order type list is not 17")
    for name, source_category in ORDER_TYPES:
        product = products[source_category]
        expected = PORTAL_TYPE_FOR_ORDER.get(name, name)
        if product["portal_ordering_type"] != expected:
            raise SystemExit(f"{name} source portal type is {product['portal_ordering_type']}")
        add_scope(order_type_category(name), product, False)
    return sequences, choices, gaps, report_fields


def write_order_forms(payload: dict, report_fields: list[dict]) -> None:
    pending = {(row["category"], row["field_key"]): row["reason"] for row in report_fields}
    registry_entries = []
    routes: dict[str, dict[str, str]] = {}
    aliases: dict[str, str] = {}
    for product in payload["products"]:
        product_key = product["category"]
        product_name = product["product_name"]
        slug_name = title_slug(product_name)
        template = f"sundance/805-Shutters-Sundance-{slug_name}-Agent-Order-Packet"
        measure = f"sundance/805-Shutters-Sundance-{slug_name}-Technical-Measure-Form"
        if max(len(template), len(measure)) > 180:
            raise SystemExit(f"template path too long for {product_key}")
        header = payload["order_level_fields"]["sundance_order_header"]
        fields = []
        for index, field in enumerate([*header, *product["fields"]], start=1):
            reason = pending.get((product_key, field["key"]))
            choices = [] if reason else (closed_choices(field["allowed"]) or [])
            if field["needs_live_form_check"] or field["conditional"] in FORCE_INCOMPLETE:
                choices = []
            fields.append({
                "key": field["key"],
                "label": field["label"],
                "ask_order": index,
                "input_kind": input_kind(field["kind"]),
                "required": required_flag(field["required"]),
                "pending": reason,
                "choices": [{"value": choice, "label": choice} for choice in choices],
            })
        schema = {
            "schema_version": 1,
            "routing_key": f"sundance:{product_key}",
            "manufacturer": "Sundance",
            "product_key": product_key,
            "product_name": product_name,
            "product_kind": product["quote_product_type"],
            "portal_ordering_type": product["portal_ordering_type"],
            "catalog_version": CATALOG_VERSION,
            "status": product["status"],
            "source_url": "https://sundance.blindata.app",
            "ordered_fields": [field["key"] for field in fields],
            "fields": fields,
        }
        schema_path = ROOT / "public/order-form-templates/sundance" / f"{product_key}.schema.json"
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        schema_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
        lines = [
            f"{field['label']}: {field['pending'] or ', '.join(choice['label'] for choice in field['choices']) or field['input_kind']}"
            for field in fields
        ]
        docx = minimal_docx(product_name, lines)
        pdf = minimal_pdf(f"Sundance {product_name}")
        (ROOT / "public/order-form-templates" / f"{template}.docx").write_bytes(docx)
        (ROOT / "public/order-form-templates" / f"{template}.pdf").write_bytes(pdf)
        measure_dir = ROOT / "public/technical-measure-templates/sundance"
        measure_dir.mkdir(parents=True, exist_ok=True)
        (ROOT / "public/technical-measure-templates" / f"{measure}.docx").write_bytes(docx)
        (ROOT / "public/technical-measure-templates" / f"{measure}.pdf").write_bytes(pdf)
        registry_entries.append({
            "routing_key": f"sundance:{product_key}",
            "manufacturer": "Sundance",
            "product_key": product_key,
            "product_name": product_name,
            "product_kind": product["quote_product_type"],
            "template_docx": f"{template}.docx",
            "schema": f"sundance/{product_key}.schema.json",
            "workflow": "Sundance Blindata order form; live confirmation still required",
            "source_url": "https://sundance.blindata.app",
            "source_reference": "data/order-entry/805-sundance-order-fields.json",
            "verification": "PORTAL_FIELD_RECHECK_REQUIRED",
            "line_item_cardinality": "one_template_instance_per_contract_line_item",
        })
        routes[product_key] = {"manufacturer": "sundance", "productKey": product_key}
        aliases[product_key] = product_key
        aliases[slug(product_name)] = product_key
    registry_path = ROOT / "src/lib/crm/vendor-orders/manufacturer-order-form-registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    registry["manufacturers"]["sundance"] = registry_entries
    registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    routes_path = ROOT / "src/lib/crm/vendor-orders/sundance-order-form-routes.ts"
    routes_path.write_text(
        "export const sundanceCatalogProductRoutes = "
        + json.dumps(routes, indent=2)
        + " as const;\n\nexport const sundanceAliases: Record<string, string> = "
        + json.dumps(aliases, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def main() -> None:
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    if payload["manufacturer"] != "Sundance":
        raise SystemExit(payload["manufacturer"])
    sequences, choices, gaps, report_fields = build_records(payload)
    prior = PRIOR.read_text(encoding="utf-8")
    functions = "\n\n".join(
        patch_gap_lookup(extract_function(prior, name))
        for name in ("quote_next_required_field", "quote_validate_tapped_value")
    )
    begin = f"""create or replace function public.quote_sequence_begin_migration(p_sha256 text)
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
  if p_sha256 not in ({sql_text(PRIOR_SHA)}, {sql_text(SHA)}) then
    raise exception 'quote sequence migration source sha256 does not match the field file'
      using errcode = '22023';
  end if;
  perform set_config('quote_sequence.admin_write', 'on', true);
end;
$fn$;"""
    audit = f"""
insert into public.quote_sequence_seed_audit (table_name, action, row_key, old_row, new_row, actor, source_sha256)
values
  ('quote_category_field_sequence', 'insert', '{{"manufacturer":"Sundance","scope":"products_and_order_types"}}'::jsonb, null, {sql_json({"sequence_rows": len(sequences), "products": 30, "order_types": 17})}, 'migration', {sql_text(SHA)}),
  ('quote_catalog_field_choice', 'insert', '{{"manufacturer":"Sundance"}}'::jsonb, null, {sql_json({"choice_rows": len(choices)})}, 'migration', {sql_text(SHA)}),
  ('quote_sequence_catalog_gap', 'insert', '{{"manufacturer":"Sundance"}}'::jsonb, null, {sql_json({"gap_rows": len(gaps)})}, 'migration', {sql_text(SHA)});
"""
    body = f"""-- Seed Sundance from data/order-entry/805-sundance-order-fields.json.
-- Source sha256: {SHA}
-- Stacked on the #113 audited write path. Insert and upsert only.
-- The #113 Sundance wildcard gap stays. A category with active rows is no longer
-- hidden by that wildcard. Product-level gaps still block products the file marks blocked.
-- Account numbers are not seeded.

{begin}

{functions}

do $sundance$
declare
  sha text := {sql_text(SHA)};
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

{sequence_sql(sequences)}

{choice_sql(choices)}

{gap_sql(gaps)}

{audit}

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
"""
    if re.search(r"\b(delete\s+from|truncate|drop\s+(table|trigger|policy|constraint|function|index|schema))\b", body, flags=re.IGNORECASE):
        raise SystemExit("generated SQL contains a forbidden statement")
    if "ST0142" in body or "crm_vendor_accounts" in body:
        raise SystemExit("generated SQL mentions an account number or vendor account table")
    encoded = body.encode("utf-8")
    if len(encoded) > BYTE_LIMIT:
        raise SystemExit(f"migration is {len(encoded)} bytes; split it before writing")
    OUT.write_text(body, encoding="utf-8")
    write_order_forms(payload, report_fields)
    pending_live = [row for row in report_fields if row["needs_live_form_check"]]
    REPORT.write_text(json.dumps({
        "source_sha256": SHA,
        "products": 30,
        "order_types": 17,
        "sequence_rows": len(sequences),
        "choice_rows": len(choices),
        "gap_rows": len(gaps),
        "pending_fields": report_fields,
        "needs_live_form_check_fields": len(pending_live),
    }, indent=2) + "\n", encoding="utf-8")
    print(
        f"sequences {len(sequences)} choices {len(choices)} gaps {len(gaps)} "
        f"pending {len(report_fields)} live {len(pending_live)} bytes {len(encoded)}"
    )


if __name__ == "__main__":
    main()
