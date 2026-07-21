#!/usr/bin/env python3
"""Build and audit the Lotus West A26.v1 dealer-net catalog from Lotus.pdf."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

import pdfplumber


EXPECTED_SHA256 = "4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f"
EXPECTED_PAGES = 113
MONEY_RE = re.compile(r"(?<!\d)(\d+)[�.](\d{2})(?!\d)")
SKU_RE = re.compile(r"\b[A-Z][A-Za-z0-9�]*\d[A-Za-z0-9�]*\b")


MATRIX_DEFINITIONS = {
    95: ("lotus_vinyl_blinds", "lotus_mlx_1in_vinyl_custom", "1-inch Vinyl Mini Blind - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    96: ("lotus_vinyl_blinds", "lotus_rlx_1in_vinyl_plus_custom", "1-inch Vinyl Plus Mini Blind - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    97: ("lotus_mini_blinds", "lotus_amx_1in_aluminum_custom", "1-inch Aluminum Mini Blind - Custom Cut", [36, 48, 60, 64, 72, 84, 96, 108]),
    98: ("lotus_vinyl_blinds", "lotus_rtx_2in_vinyl_plus_custom", "2-inch Vinyl Plus Blind - Custom Cut", [36, 48, 60, 72, 84, 96]),
    99: ("lotus_faux_wood_blinds", "lotus_flx_2in_bright_white_custom", "2-inch Faux Wood, Smooth Bright White - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    100: ("lotus_faux_wood_blinds", "lotus_flxe_2in_embossed_bright_white_custom", "2-inch Faux Wood, Embossed Bright White - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    101: ("lotus_faux_wood_blinds", "lotus_ftx_2in_snow_white_custom", "2-inch Faux Wood, Snow White - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    102: ("lotus_faux_wood_blinds", "lotus_fcx_2in_soft_white_custom", "2-inch Faux Wood, Soft White - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    103: ("lotus_faux_wood_blinds", "lotus_fpx_2in_privacy_bright_white_custom", "2-inch Privacy Faux Wood, Bright White - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    104: ("lotus_faux_wood_blinds", "lotus_fgx_2_5in_bright_white_custom", "2.5-inch Faux Wood, Bright White - Custom Cut", [36, 48, 60, 64, 72, 84, 96]),
    105: ("lotus_roller_shades", "lotus_rs_1pct_custom", "1% Roller Shade - Custom Cut", [36, 48, 60, 72, 84, 96]),
    106: ("lotus_vertical_blinds", "lotus_cv_steel_complete_custom", "3.5-inch Steel Vertical Blind - Custom Cut", [48, 60, 72, 84, 96, 120]),
    107: ("lotus_vertical_blinds", "lotus_cvn_aluminum_one_way_custom", "3.5-inch Aluminum One-Way Vertical Blind - Custom Cut", [48, 60, 72, 84, 96, 120]),
    108: ("lotus_vertical_blinds", "lotus_cvnc_aluminum_center_draw_custom", "3.5-inch Aluminum Center-Draw Vertical Blind - Custom Cut", [48, 60, 72, 84, 96, 120]),
}


def number(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace("�", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def money(text: str | None) -> float | None:
    if not text:
        return None
    match = MONEY_RE.search(text)
    return float(f"{match.group(1)}.{match.group(2)}") if match else None


def stock_location(page: int) -> tuple[str, str] | None:
    ranges = [
        (5, 12, "lotus_vinyl_blinds", "lotus_mlx_1in_vinyl_stock"),
        (14, 18, "lotus_vinyl_blinds", "lotus_rlx_1in_vinyl_plus_stock"),
        (20, 24, "lotus_mini_blinds", "lotus_amx_1in_aluminum_stock"),
        (26, 28, "lotus_vinyl_blinds", "lotus_rtx_2in_vinyl_plus_stock"),
        (30, 38, "lotus_faux_wood_blinds", "lotus_flx_2in_bright_white_stock"),
        (40, 43, "lotus_faux_wood_blinds", "lotus_flxe_2in_embossed_bright_white_stock"),
        (45, 50, "lotus_faux_wood_blinds", "lotus_ftx_2in_snow_white_stock"),
        (52, 56, "lotus_faux_wood_blinds", "lotus_ftxlg_2in_light_gray_stock"),
        (58, 65, "lotus_faux_wood_blinds", "lotus_fcx_2in_soft_white_stock"),
        (67, 75, "lotus_faux_wood_blinds", "lotus_fpx_2in_privacy_bright_white_stock"),
        (77, 79, "lotus_faux_wood_blinds", "lotus_fgx_2_5in_bright_white_stock"),
        (80, 82, "lotus_faux_wood_blinds", "lotus_faux_wood_valance_stock"),
        (84, 87, "lotus_roller_shades", "lotus_rs_1pct_stock"),
        (89, 89, "lotus_vertical_blinds", "lotus_vs_steel_complete_stock"),
        (90, 90, "lotus_vertical_blinds", "lotus_vh_steel_headrail_stock"),
        (91, 91, "lotus_vertical_blinds", "lotus_vnow_complete_stock"),
        (92, 92, "lotus_vertical_blinds", "lotus_vnow_aluminum_one_way_headrail_stock"),
        (93, 93, "lotus_vertical_blinds", "lotus_vncw_aluminum_center_draw_headrail_stock"),
        (94, 94, "lotus_vertical_blinds", "lotus_vv_vertical_vanes_stock"),
    ]
    for first, last, product_id, program_id in ranges:
        if first <= page <= last:
            return product_id, program_id
    return None


def color_for_sku(sku: str) -> str:
    upper = sku.upper()
    if upper.endswith("AL") or "VVAL" in upper or upper.endswith("A"):
        return "Alabaster"
    if "SNW" in upper:
        return "Snow White"
    if upper.endswith("LG") or upper.endswith("L"):
        return "Light Gray"
    if "EBW" in upper:
        return "Embossed Bright White"
    if "BW" in upper:
        return "Bright White"
    if upper.endswith("SWH") or upper.endswith("W") or "WH" in upper:
        return "White"
    return "Source color code"


def parse_stock_line(line: str, page: int, product_id: str, program_id: str) -> list[dict[str, Any]]:
    tokens = line.strip().split()
    if len(tokens) < 6 or not tokens[-1].startswith("$"):
        return []
    dealer_net = number(tokens[-1])
    try:
        carton_qty = int(tokens[-2])
    except ValueError:
        return []
    width = number(tokens[0])
    if width is None:
        return []
    if len(tokens) > 2 and tokens[1].lower() == "x":
        height = number(tokens[2])
        body_start = 3
    else:
        height = None
        body_start = 1
    body = tokens[body_start:-2]
    sku_start = len(body)
    while sku_start > 0 and SKU_RE.fullmatch(body[sku_start - 1]):
        sku_start -= 1
    sku_tokens = body[sku_start:]
    if not sku_tokens or dealer_net is None:
        return []
    description = " ".join(body[:sku_start]).strip()
    unit = "blind"
    lowered = description.lower()
    if "valance" in lowered:
        unit = "valance"
    elif "headrail" in lowered:
        unit = "headrail"
    elif "vane" in lowered:
        unit = "casepack"
    elif "shade" in lowered:
        unit = "shade"
    return [
        {
            "sku": sku,
            "programId": program_id,
            "description": description,
            "width": width,
            "height": height,
            "color": color_for_sku(sku),
            "cartonQty": carton_qty,
            "dealerNetPrice": dealer_net,
            "unit": unit,
            "sourcePage": page,
        }
        for sku in sku_tokens
    ]


def parse_stock_items(pdf: pdfplumber.PDF) -> dict[str, list[dict[str, Any]]]:
    by_product: dict[str, list[dict[str, Any]]] = {}
    for page_number, page in enumerate(pdf.pages, 1):
        location = stock_location(page_number)
        if not location:
            continue
        product_id, program_id = location
        text = page.extract_text(x_tolerance=2, y_tolerance=2) or ""
        for line in text.splitlines():
            parsed = parse_stock_line(line, page_number, product_id, program_id)
            if "$" in line and re.search(r"\$[0-9�.]+\s*$", line) and not parsed:
                raise ValueError(f"Page {page_number}: unparsed stock price row: {line.strip()}")
            by_product.setdefault(product_id, []).extend(parsed)
    return by_product


def normalize_sku(value: str) -> str:
    return value.replace("�", ".")


def parse_wh_matrix(page: pdfplumber.page.Page, page_number: int, expected_heights: list[int]) -> dict[str, Any]:
    table = page.extract_tables()[1]
    retained = [index for index, value in enumerate(table[0]) if value not in (None, "") or index == 0]
    widths = [number(table[0][index]) for index in retained[1:]]
    if any(value is None for value in widths):
        raise ValueError(f"Page {page_number}: invalid matrix width headers")
    widths = [float(value) for value in widths if value is not None]
    costs = [[None for _ in widths] for _ in expected_heights]
    skus: list[list[list[str]]] = [[[] for _ in widths] for _ in expected_heights]
    cell_notes: list[list[str | None]] = [[None for _ in widths] for _ in expected_heights]
    height_index = -1
    for source_row in table[1:]:
        row = [source_row[index] if index < len(source_row) else None for index in retained]
        marker = (row[0] or "").strip()
        if marker:
            if marker.lower() in {"sliardaeH".lower(), "ylnO\nenaV".lower()}:
                continue
            height_index += 1
            if height_index >= len(expected_heights):
                continue
        if height_index < 0:
            continue
        for column, cell in enumerate(row[1:]):
            if not cell:
                continue
            value = money(cell)
            if value is not None:
                costs[height_index][column] = value
            found_skus = [normalize_sku(candidate) for candidate in SKU_RE.findall(cell)]
            for sku in found_skus:
                if sku not in skus[height_index][column]:
                    skus[height_index][column].append(sku)
            if "Use " in cell:
                cell_notes[height_index][column] = " ".join(cell.split())
    if height_index + 1 != len(expected_heights):
        raise ValueError(
            f"Page {page_number}: expected {len(expected_heights)} matrix rows, found {height_index + 1}"
        )
    return {
        "widths": widths,
        "heights": expected_heights,
        "prices": [[None for _ in widths] for _ in expected_heights],
        "costs": costs,
        "skuCodes": skus,
        "cellNotes": cell_notes,
    }


def parse_width_matrix(page: pdfplumber.page.Page, page_number: int) -> dict[str, Any]:
    tables = page.extract_tables()
    header = tables[1][0]
    row = tables[2][0]
    widths = [float(number(item)) for item in header[1:] if number(item) is not None]
    costs: list[float | None] = []
    skus: list[list[str]] = []
    for cell in row[1 : len(widths) + 1]:
        costs.append(money(cell))
        skus.append([normalize_sku(value) for value in SKU_RE.findall(cell or "")])
    return {
        "widths": widths,
        "heights": [],
        "prices": [[None for _ in widths]],
        "costs": [costs],
        "skuCodes": [skus],
    }


def parse_vane_matrix(page: pdfplumber.page.Page) -> dict[str, Any]:
    table = page.extract_tables()[4]
    heights = [float(number(item)) for item in table[0][1:] if number(item) is not None]
    cells = table[1][1:]
    return {
        "widths": [],
        "heights": heights,
        "prices": [[None] for _ in heights],
        "costs": [[money(cell)] for cell in cells],
        "skuCodes": [[[normalize_sku(value) for value in SKU_RE.findall(cell or "")]] for cell in cells],
    }


def program(program_id: str, name: str, page: int, grid: dict[str, Any], axis: str = "wh") -> dict[str, Any]:
    return {
        "id": program_id,
        "name": name,
        "priceGroup": None,
        "priceAxis": axis,
        "grid": grid,
        "minWidth": None,
        "minHeight": None,
        "maxWidth": max(grid["widths"]) if grid["widths"] else None,
        "maxHeight": max(grid["heights"]) if grid["heights"] else None,
        "maxAreaSqft": None,
        "fabricCollections": [],
        "notes": [
            f"Dealer-net custom-cut matrix, PDF p{page}.",
            "Measured dimensions round independently to the next matrix cell.",
            "Blank and source-directed substitution cells remain unpriced and block; no automatic substitution is allowed.",
        ],
        "sourcePages": [page],
    }


def empty_program(program_id: str, name: str, source_pages: list[int], note: str) -> dict[str, Any]:
    return {
        "id": program_id,
        "name": name,
        "priceGroup": None,
        "priceAxis": "wh",
        "priceBasis": "manual_required",
        "grid": {"widths": [], "heights": [], "prices": [], "costs": [], "skuCodes": []},
        "minWidth": None,
        "minHeight": None,
        "maxWidth": None,
        "maxHeight": None,
        "maxAreaSqft": None,
        "fabricCollections": [],
        "notes": [note],
        "sourcePages": source_pages,
    }


def base_product(product_id: str, product_type: str, name: str, pages: list[int], notes: list[str]) -> dict[str, Any]:
    return {
        "id": product_id,
        "productType": product_type,
        "name": name,
        "manufacturer": "Lotus",
        "system": name,
        "priceBasis": "dealer_net",
        "dealerFactor": None,
        "freightStatus": "unresolved",
        "pages": pages,
        "provisional": False,
        "source": "Lotus.pdf - West A26.v1",
        "fabricRouting": None,
        "programs": [],
        "surcharges": [],
        "fabricByYard": [],
        "notes": notes,
        "stockItems": [],
    }


def build_catalog(pdf_path: Path) -> dict[str, Any]:
    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError(f"Unexpected Lotus PDF SHA-256: {digest}")
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != EXPECTED_PAGES:
            raise ValueError(f"Expected {EXPECTED_PAGES} pages, found {len(pdf.pages)}")
        stock_items = parse_stock_items(pdf)
        products = {
            "lotus_vinyl_blinds": base_product(
                "lotus_vinyl_blinds", "Vinyl Blinds", "Lotus Vinyl Blinds", list(range(4, 19)) + list(range(25, 29)) + [95, 96, 98],
                ["Cordless horizontal vinyl blinds.", "1-inch Vinyl and Vinyl Plus plus 2-inch Vinyl Plus are separate programs.", "All stated horizontal widths receive a 1/2-inch inside-mount deduction (PDF p2)."],
            ),
            "lotus_mini_blinds": base_product(
                "lotus_mini_blinds", "Mini Blinds", "Lotus Aluminum Mini Blinds", list(range(19, 25)) + [97],
                ["1-inch, 6-gauge cordless aluminum slats; White and limited Alabaster stock SKUs.", "All stated horizontal widths receive a 1/2-inch inside-mount deduction (PDF p2)."],
            ),
            "lotus_faux_wood_blinds": base_product(
                "lotus_faux_wood_blinds", "Faux Wood Blinds", "Lotus Faux Wood Blinds", list(range(29, 83)) + list(range(99, 105)),
                ["2-inch smooth, embossed, privacy, and 2.5-inch Faux Wood programs plus Crown, Standard, and Designer valance stock items.", "2-inch and 2.5-inch Faux Wood may be purchased by the piece without the 25% broken-package surcharge (PDF p2)."],
            ),
            "lotus_roller_shades": base_product(
                "lotus_roller_shades", "Roller Shades", "Lotus Roller Shades", list(range(83, 88)) + [105],
                ["Manual spring roller with 3-inch modern valance and 1/2-inch mitered returns.", "Stated widths receive a 1/8-inch inside-mount deduction (PDF p83).", "The source advertises 1% and Blackout, but only 1% stock and custom-cut prices are supplied."],
            ),
            "lotus_vertical_blinds": base_product(
                "lotus_vertical_blinds", "Vertical Blinds", "Lotus Vertical Blinds", list(range(88, 95)) + [106, 107, 108],
                ["Steel complete blinds, steel/aluminum headrails, one-way and center-draw systems, and vinyl vanes.", "The custom-vane matrix does not define whether its amounts represent one vane or a casepack; it remains dealer-net and customer retail is blocked."],
            ),
        }
        for page_number, (product_id, program_id, name, heights) in MATRIX_DEFINITIONS.items():
            matrix = parse_wh_matrix(pdf.pages[page_number - 1], page_number, heights)
            products[product_id]["programs"].append(program(program_id, name, page_number, matrix))
            if page_number == 101:
                light_gray = deepcopy(products[product_id]["programs"][-1])
                light_gray["id"] = "lotus_ftxlg_2in_light_gray_custom"
                light_gray["name"] = "2-inch Faux Wood, Light Gray - Custom Cut"
                products[product_id]["programs"].append(light_gray)
            if page_number in (106, 107, 108):
                headrail_ids = {
                    106: ("lotus_cvh_steel_headrail_custom", "3.5-inch Steel Headrail - Custom Cut"),
                    107: ("lotus_cvno_aluminum_one_way_headrail_custom", "3.5-inch Aluminum One-Way Headrail - Custom Cut"),
                    108: ("lotus_cvnc_aluminum_center_draw_headrail_custom", "3.5-inch Aluminum Center-Draw Headrail - Custom Cut"),
                }
                headrail_id, headrail_name = headrail_ids[page_number]
                products[product_id]["programs"].append(
                    program(headrail_id, headrail_name, page_number, parse_width_matrix(pdf.pages[page_number - 1], page_number), "width")
                )
        products["lotus_vertical_blinds"]["programs"].append(
            program("lotus_cvv_vertical_vanes_custom", "3.5-inch Vertical Vanes - Custom Cut", 108, parse_vane_matrix(pdf.pages[107]), "height")
        )
        products["lotus_roller_shades"]["programs"].append(
            empty_program(
                "lotus_rs_blackout_unpriced",
                "Blackout Roller Shade - Source Price Missing",
                [83],
                "PDF p83 advertises Blackout but pages 84-87 and custom matrix p105 price only 1% fabric. Manual source price required; never substitute the 1% grid.",
            )
        )
        for product_id, items in stock_items.items():
            products[product_id]["stockItems"] = sorted(items, key=lambda item: (item["sourcePage"], item["programId"], item["sku"]))

    return {
        "source": "Lotus.pdf - Cost Book & Supplier Manual",
        "effectiveDate": "undefined",
        "currency": "USD",
        "generatedFrom": "Lotus.pdf",
        "sources": [{
            "file": "Lotus.pdf",
            "title": "Cost Book & Supplier Manual",
            "revision": "West A26.v1",
            "effectiveDate": None,
            "receivedDate": "2026-07-20",
            "modifiedDate": "2026-04-01",
            "pages": EXPECTED_PAGES,
            "sha256": EXPECTED_SHA256,
        }],
        "globalRules": {
            "surcharges": [
                {"id": "lotus_broken_package", "name": "Broken package", "kind": "percent", "per": "unit", "value": None, "dealerNetValue": 25, "appliesTo": "Stock orders not in full cartons except 2-inch/2.5-inch Faux Wood and 2-inch Vinyl Plus", "notes": "Dealer-net order rule; PDF p2", "sourceType": "dealer_net", "sourcePages": [2]},
                {"id": "lotus_small_order", "name": "Small order under $50", "kind": "flat", "per": "once", "value": None, "dealerNetValue": 5, "appliesTo": "Orders with dealer-net merchandise subtotal under $50", "notes": "Dealer-net order rule; PDF p2", "sourceType": "dealer_net", "sourcePages": [2]},
            ],
            "notes": [
                "All published amounts are dealer-net costs from a supplier cost book; customer retail is undefined.",
                "Complimentary prepaid freight applies only above a $2,500 order; freight below that threshold is not priced.",
                "Stock availability is explicitly subject to change.",
                "Horizontal stock blinds are 1/2 inch narrower than stated; Roller Shades are 1/8 inch narrower than stated.",
                "No more than 10 inches may be removed from the length of cordless horizontal stock blinds.",
                "Custom matrix dimensions round independently upward. Blank, Use Two, and Use Other Product cells are blocked without substitution.",
            ],
        },
        "products": list(products.values()),
        "motorization": {},
    }


def audit(catalog: dict[str, Any]) -> dict[str, Any]:
    stock_items = sum(len(product.get("stockItems", [])) for product in catalog["products"])
    source_stock_rows = len({
        (
            item["sourcePage"], item["programId"], item["description"], item["width"],
            item["height"], item["cartonQty"], item["dealerNetPrice"],
        )
        for product in catalog["products"] for item in product.get("stockItems", [])
    })
    matrix_cells = 0
    priced_matrix_cells = 0
    blocked_matrix_cells = 0
    custom_skus = 0
    for product in catalog["products"]:
        for item in product["programs"]:
            costs = item["grid"].get("costs", [])
            matrix_cells += sum(len(row) for row in costs)
            priced_matrix_cells += sum(value is not None for row in costs for value in row)
            blocked_matrix_cells += sum(value is None for row in costs for value in row)
            custom_skus += sum(len(cell) for row in item["grid"].get("skuCodes", []) for cell in row)
    if len(catalog["products"]) != 5:
        raise ValueError("Lotus catalog must contain exactly five quoteable product families")
    if stock_items < 1000 or source_stock_rows < 2800 or priced_matrix_cells < 900:
        raise ValueError(f"Incomplete extraction: {stock_items} stock items, {priced_matrix_cells} matrix cells")
    return {
        "sha256": EXPECTED_SHA256,
        "pages": EXPECTED_PAGES,
        "products": len(catalog["products"]),
        "stockItems": stock_items,
        "sourceStockRows": source_stock_rows,
        "matrixCells": matrix_cells,
        "pricedMatrixCells": priced_matrix_cells,
        "blockedMatrixCells": blocked_matrix_cells,
        "customSkuCodes": custom_skus,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--check", action="store_true", help="Verify without writing the catalog")
    args = parser.parse_args()
    catalog = build_catalog(args.pdf)
    summary = audit(catalog)
    destination = Path(__file__).resolve().parents[1] / "src/lib/quote/catalog/lotus-west-a26.catalog.json"
    rendered = json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"
    wrote = False
    if args.check:
        if not destination.exists() or destination.read_text() != rendered:
            raise SystemExit("Lotus catalog is missing or differs from the audited PDF extraction")
    else:
        destination.write_text(rendered)
        wrote = True
    print(json.dumps({**summary, "wrote": wrote}))


if __name__ == "__main__":
    main()
