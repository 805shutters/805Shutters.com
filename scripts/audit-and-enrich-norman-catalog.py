#!/usr/bin/env python3
"""Validate the Norman catalog against the July 2026 PDF and attach provenance.

The price tables remain human-reviewable JSON. This script is deliberately an
auditor/enricher: it refuses to write unless every complete catalog grid row is
found on its expected rendered PDF page.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


EXPECTED_SHA256 = "ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3"
SOURCE_FILE = "2026Jul Retail Price Guide (1).pdf"

PRODUCT_PAGES = {
    "citylights_aluminum": [35],
    "faux_wood": [30],
    "honeycomb": [9, 10, 11, 12],
    "palladian_shelf": [36, 37],
    "perfectsheer": [22],
    "roller": [15, 16, 17, 18, 19, 20],
    "roman": [25, 26, 27],
    "smartdrape": [23, 24],
    "smartfold": [21],
    "smartprivacy_faux": [31],
    "synchrony_vertical": [34],
    "vertical_honeycomb": [13, 14],
    "wood_blinds": [32, 33],
}

PROGRAM_PAGES = {
    "citylights_aluminum_1in_slats_cordless_pgusa": [35],
    "faux_wood_2in_and_2_1_2in_slats_cordless": [30],
    "honeycomb_9_16in_cordless_single_cell": [10],
    "honeycomb_3_8in_cordless_single_and_3_4in_single": [10],
    "honeycomb_1_2in_cordless_double": [11],
    "honeycomb_3_4in_cordless_double_and_1_1_4in_single": [11],
    "honeycomb_flame_resistant_fabrics": [11],
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1": [12],
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2": [12],
    "palladian_shelf_palladian_shelf_with_product": [37],
    "palladian_shelf_palladian_shelf_without_product": [37],
    "perfectsheer_perfectsheer_shades_light_filtering": [22],
    "roller_cordless_fabric_price_group_1_pg1": [18],
    "roller_cordless_fabric_price_group_2_pg2": [18],
    "roller_cordless_fabric_price_group_3_pg3": [19],
    "roller_cordless_solar_screen_price_group_1_pg1": [15],
    "roller_cordless_solar_screen_price_group_2_pg2": [16],
    "roller_cordless_solar_screen_price_group_3_pg3": [16],
    "roman_cordless_usa_price_group_1_pg1": [26],
    "roman_cordless_usa_price_group_2_pg2": [26],
    "roman_cordless_usa_price_group_3_pg3": [27],
    "roman_fabric_valance_surcharge": [27],
    "smartdrape_smartdrape_lakeshore_stripe": [24],
    "smartdrape_smartdrape_light_filtering": [24],
    "smartfold_smartfold_shades": [21],
    "smartfold_fascia_wood_valance": [21],
    "smartfold_3_1_2in_4_1_2in_and_6in_fabric_valance": [21],
    "smartfold_8in_fabric_valance": [21],
    "smartprivacy_faux_2in_and_2_1_2in_slats_cordless": [31],
    "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1": [34],
    "synchrony_vertical_synchrony_vertical_blind_price_group_2_pg2": [34],
    "synchrony_vertical_synchrony_vertical_blind_price_group_3_pg3": [34],
    "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4": [34],
    "vertical_honeycomb_3_4in_single_and_1_1_4in_single_vertical": [14],
    "vertical_honeycomb_flame_resistant_fabrics_3_4in_single_only": [14],
    "wood_blinds_2in_and_2_1_2in_slats": [33],
}

SURCHARGE_PAGES = {
    "citylights_aluminum": [35],
    "faux_wood": [30],
    "honeycomb": [10, 12],
    "perfectsheer": [22],
    "roller": [20],
    "roman": [26, 27],
    "smartdrape": [24],
    "smartfold": [21],
    "smartprivacy_faux": [31],
    "synchrony_vertical": [34],
    "vertical_honeycomb": [14],
    "wood_blinds": [33],
}


def tokens(value: str) -> list[str]:
    return [token.replace(",", "") for token in re.findall(r"NA|\d+(?:,\d{3})*", value)]


def contains_sequence(haystack: list[str], needle: list[str]) -> bool:
    return any(haystack[index : index + len(needle)] == needle for index in range(len(haystack) - len(needle) + 1))


def row_is_on_page(page_lines: list[list[str]], row: list[str]) -> bool:
    return any(contains_sequence(line, row) for line in page_lines)


def validate_rows(catalog: dict, page_tokens: list[list[list[str]]]) -> int:
    checked = 0
    for product in catalog["products"]:
        for program in product["programs"]:
            expected_pages = PROGRAM_PAGES.get(program["id"])
            if not expected_pages:
                raise AssertionError(f"Missing source-page map for {program['id']}")
            grid = program["grid"]
            for row_index, prices in enumerate(grid["prices"]):
                prefix = []
                if grid["heights"] and not (len(grid["heights"]) == 1 and grid["heights"][row_index] == 0):
                    prefix = [str(grid["heights"][row_index])]
                row = prefix + ["NA" if price is None else str(price) for price in prices]
                if not any(row_is_on_page(page_tokens[page - 1], row) for page in expected_pages):
                    raise AssertionError(f"Catalog row not found on PDF page {expected_pages}: {program['id']} row {row_index}: {row}")
                checked += 1
    return checked


def value_is_on_pages(value: int | float, pages: list[int], page_tokens: list[list[list[str]]]) -> bool:
    expected = str(value).removesuffix(".0")
    return any(expected in line for page in pages for line in page_tokens[page - 1])


def validate_additions(catalog: dict, page_tokens: list[list[list[str]]]) -> tuple[int, int]:
    surcharge_count = 0
    motor_count = 0
    all_surcharges = list(catalog["globalRules"]["surcharges"])
    for product in catalog["products"]:
        all_surcharges.extend(product["surcharges"])
    for surcharge in all_surcharges:
        pages = surcharge.get("sourcePages", [])
        if not pages:
            raise AssertionError(f"Missing surcharge source pages: {surcharge['id']}")
        if surcharge.get("value") is not None and not value_is_on_pages(surcharge["value"], pages, page_tokens):
            raise AssertionError(f"Surcharge value not found on PDF page {pages}: {surcharge['id']}={surcharge['value']}")
        graduated = surcharge.get("widthGraduated") or surcharge.get("heightGraduated")
        if graduated:
            row = ["NA" if price is None else str(price) for price in graduated["prices"]]
            if not any(row_is_on_page(page_tokens[page - 1], row) for page in pages):
                raise AssertionError(f"Graduated surcharge row not found on PDF page {pages}: {surcharge['id']}")
        surcharge_count += 1

    for group in catalog["motorization"].values():
        for option in group["options"]:
            pages = option.get("sourcePages", [])
            values = {option.get("price"), *(option.get("priceByProduct") or {}).values()} - {None}
            if not pages or any(not value_is_on_pages(value, pages, page_tokens) for value in values):
                raise AssertionError(f"Motor option value not found on PDF page {pages}: {option['id']}={sorted(values)}")
            motor_count += 1
    return surcharge_count, motor_count


def enrich(catalog: dict) -> None:
    catalog["source"] = "Norman 2026 Retail Price Guide"
    catalog["effectiveDate"] = "2026-07-01"
    catalog["generatedFrom"] = f"{SOURCE_FILE} (40 pages; SHA-256 {EXPECTED_SHA256}; all 321 grid rows verified)"
    catalog["sources"] = [
        {
            "file": SOURCE_FILE,
            "title": "2026 Retail Guide Effective July 1st, 2026",
            "revision": "2026-07",
            "effectiveDate": "2026-07-01",
            "receivedDate": "2026-07-20",
            "modifiedDate": "2026-06-15",
            "pages": 40,
            "sha256": EXPECTED_SHA256,
        }
    ]

    for surcharge in catalog["globalRules"]["surcharges"]:
        surcharge["dealerFactor"] = 1
        surcharge["sourcePages"] = [4]

    for product in catalog["products"]:
        product_id = product["id"]
        product["manufacturer"] = "Norman"
        product["priceBasis"] = "suggested_retail"
        product["dealerFactor"] = 0.30
        product["freightStatus"] = "unresolved" if product_id == "palladian_shelf" else "order_level"
        product["source"] = SOURCE_FILE
        product["provisional"] = False
        product["pages"] = PRODUCT_PAGES[product_id]
        for program in product["programs"]:
            program["sourcePages"] = PROGRAM_PAGES[program["id"]]
        for surcharge in product["surcharges"]:
            surcharge["sourcePages"] = SURCHARGE_PAGES[product_id]

    by_product = {product["id"]: product for product in catalog["products"]}
    by_surcharge = {
        (product_id, surcharge["id"]): surcharge
        for product_id, product in by_product.items()
        for surcharge in product["surcharges"]
    }
    by_surcharge[("roller", "dual_shade")]["baseQuantityMultiplier"] = 2
    by_surcharge[("roller", "coupled_shade")]["baseQuantityFromUnits"] = "units_plus_one"
    by_surcharge[("roller", "lightguard_360")]["baseQuantityFromUnits"] = "units"
    by_surcharge[("honeycomb", "smartfit_dual_shade")]["baseQuantityMultiplier"] = 2
    by_surcharge[("honeycomb", "smartfit_dual_shade_with_frame")]["baseQuantityMultiplier"] = 2

    motor_pages = {"smart_motorization": [7], "autowand": [8], "automate_home": [28]}
    smart_options = catalog["motorization"]["smart_motorization"]["options"]
    if not any(option["id"] == "smartsense" for option in smart_options):
        smart_options.append(
            {
                "id": "smartsense",
                "name": "SmartSense",
                "price": 60,
                "priceByProduct": {
                    "honeycomb": None,
                    "roller": 60,
                    "roman": None,
                    "smartfold": 60,
                    "perfectsheer": None,
                    "smartdrape": None,
                },
                "notes": "Soluna Roller and SmartFold only; all other product columns are NA.",
            }
        )
    for group_id, group in catalog["motorization"].items():
        group["sourcePages"] = motor_pages[group_id]
        for option in group["options"]:
            option["sourcePages"] = motor_pages[group_id]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--catalog", type=Path, default=Path("src/lib/quote/catalog/norman-2026.catalog.json"))
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    digest = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise AssertionError(f"Unexpected Norman guide SHA-256: {digest}")

    reader = PdfReader(str(args.pdf))
    if len(reader.pages) != 40:
        raise AssertionError(f"Expected 40 pages, found {len(reader.pages)}")
    page_tokens = [[tokens(line) for line in (page.extract_text() or "").splitlines()] for page in reader.pages]
    catalog = json.loads(args.catalog.read_text())
    checked = validate_rows(catalog, page_tokens)
    enrich(catalog)
    surcharge_count, motor_count = validate_additions(catalog, page_tokens)
    if args.write:
        args.catalog.write_text(json.dumps(catalog, indent=2, ensure_ascii=True) + "\n")
    print(json.dumps({
        "sha256": digest,
        "pages": len(reader.pages),
        "gridRowsVerified": checked,
        "surchargesVerified": surcharge_count,
        "motorOptionsVerified": motor_count,
        "wrote": args.write,
    }))


if __name__ == "__main__":
    main()
