#!/usr/bin/env python3
"""Generate the Polar Shades server catalog from the received dealer-book PDF.

Run with the bundled Codex Python because it includes pdfplumber and pypdf:
  python scripts/generate-polar-catalog.py /tmp/polar-shades-dealer-book-current.pdf
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

PDF = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/polar-shades-dealer-book-current.pdf")
OUT = Path(__file__).resolve().parents[1] / "src/lib/quote/catalog/polar-shades.catalog.json"
SOURCE_ID = "polar-shades-dealer-book-current-2026-07-18"
SOURCE_FILE = "_Polar Shades Dealer Book - CURRENT.pdf"
SOURCE_SHA256 = "52eb859d583174c311e9682a09da3c33f8d081b2e772866a40dc025e2dcd0b0e"
SOURCE_PAGE_COUNT = 246
SOURCE_PAGE_MARKERS = {
    5: ("SHIPPING", "HANDLING"),
    20: ("HOW TO PRICE A POLAR SHADE", "RETAIL PRICE"),
    26: ("INTERIOR SHADE PRICE CHARTS", "PRICE GROUP 1"),
    74: ("MOTORIZED DRAPERY TRACKS", "PINCH PLEAT"),
    88: ("NET PRICING", "SINGLE DOOR", "$375.00", "$700.00"),
    95: ("EXTERIOR FABRIC LIST", "PRICE GROUP"),
    96: ("ELITE", "PRICE GROUP 1"),
    120: ("TITAN", "PRICE GROUP 1"),
    147: ("MEGA", "PRICE GROUP 1"),
    165: ("FRAME COLORS", "$4,900"),
}


def file_sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_page_text(page):
    return re.sub(r"\s+", " ", page.extract_text() or "").strip().upper()


def validate_pinned_source(path: Path):
    if not path.is_file():
        raise SystemExit(f"Pinned Polar source is missing: {path}")
    actual_sha256 = file_sha256(path)
    if actual_sha256 != SOURCE_SHA256:
        raise SystemExit(
            f"Refusing to overwrite {OUT.name}: Polar PDF SHA-256 mismatch "
            f"(expected {SOURCE_SHA256}, received {actual_sha256})."
        )
    from pypdf import PdfReader

    source_reader = PdfReader(str(path))
    if len(source_reader.pages) != SOURCE_PAGE_COUNT:
        raise SystemExit(
            f"Refusing to overwrite {OUT.name}: expected {SOURCE_PAGE_COUNT} pages, "
            f"received {len(source_reader.pages)}."
        )
    for page_number, markers in SOURCE_PAGE_MARKERS.items():
        page_text = normalized_page_text(source_reader.pages[page_number - 1])
        missing = [marker for marker in markers if marker not in page_text]
        if missing:
            raise SystemExit(
                f"Refusing to overwrite {OUT.name}: pinned page {page_number} "
                f"is missing structural marker(s) {missing}."
            )
    return source_reader


reader = validate_pinned_source(PDF)
import pdfplumber


def money(value: str | None):
    if not value or not value.strip():
        return None
    return float(value.replace("$", "").replace(",", "").strip())


def inches(value: str):
    value = value.replace("’", "'").replace("”", '"').strip()
    feet = re.search(r"(\d+)\s*'", value)
    inch = re.search(r"(\d+)\s*\"", value)
    if feet:
        return int(feet.group(1)) * 12 + (int(inch.group(1)) if inch else 0)
    number = re.search(r"\d+(?:\.\d+)?", value)
    return float(number.group()) if number else None


def surcharge(id_, name, value, page, *, kind="flat", per="unit", applies="all", notes="", dealer_factor=None, dealer_net_value=None, source_id=None, auto_units=None, percent_of=None, minimum_charge=None):
    item = {
        "id": id_, "name": name, "kind": kind, "per": per, "value": value,
        "appliesTo": applies, "notes": notes, "sourceType": "Polar dealer book",
        "sourcePages": [page],
    }
    if dealer_factor is not None: item["dealerFactor"] = dealer_factor
    if dealer_net_value is not None: item["dealerNetValue"] = dealer_net_value
    if source_id is not None: item["sourceId"] = source_id
    if auto_units is not None: item["autoUnits"] = auto_units
    if percent_of is not None: item["percentOfSurchargeId"] = percent_of
    if minimum_charge is not None: item["minimumCharge"] = minimum_charge
    return item


def width_surcharge(id_, name, widths, prices, page, *, notes=""):
    item = surcharge(id_, name, None, page, notes=notes)
    item["widthGraduated"] = {"widths": widths, "prices": prices, "additionalFootRate": 0}
    return item


def height_surcharge(id_, name, heights, prices, page, *, notes=""):
    item = surcharge(id_, name, None, page, notes=notes)
    item["heightGraduated"] = {"heights": heights, "prices": prices}
    return item


def program(id_, name, widths, heights, prices, page, *, costs=None, min_width=None, min_height=None, max_width=None, max_height=None, notes=None, standalone=False):
    grid = {"widths": widths, "heights": heights, "prices": prices}
    if costs is not None:
        grid["costs"] = costs
    return {
        "id": id_, "name": name,
        "priceGroup": None if standalone else name.removeprefix("Price Group "),
        "priceAxis": "wh" if heights else "width",
        "grid": grid,
        "minWidth": min_width, "minHeight": min_height,
        "maxWidth": max_width if max_width is not None else (widths[-1] if widths else None),
        "maxHeight": max_height if max_height is not None else (heights[-1] if heights else None),
        "maxAreaSqft": None, "fabricCollections": [], "notes": notes or [], "sourcePages": [page],
    }


def product(id_, product_type, name, pages, programs, surcharges, *, system=None, basis="suggested_retail", factor=.45, freight="unresolved", routing=None, fabrics=None, notes=None, pricing_family=None):
    item = {
        "id": id_, "productType": product_type, "name": name, "manufacturer": "Polar",
        "system": system, "priceBasis": basis, "dealerFactor": factor,
        "freightStatus": freight, "pages": pages, "source": SOURCE_FILE,
        "fabricRouting": routing, "fabricMetadata": fabrics or [], "programs": programs,
        "surcharges": surcharges, "fabricByYard": [], "notes": notes or [],
    }
    if pricing_family is not None:
        item["pricingFamilies"] = [{
            "id": pricing_family,
            "baselineProgramId": "group_1",
            "memberProgramIds": [entry["id"] for entry in programs],
        }]
    return item


def parse_group_pages(pages, widths, heights, count, *, override=None):
    groups = {}
    source_page = {}
    for page in pages:
        current = None
        for raw in (reader.pages[page - 1].extract_text() or "").splitlines():
            match = re.search(r"PRICE\s+GROUP\s+(\d+)", raw)
            if match:
                current = int(match.group(1))
                groups.setdefault(current, {})
                source_page.setdefault(current, page)
                continue
            row = re.match(r'^\s*(\d+)"\s+(?:\d+\s*ft\s+)?(.+)$', raw)
            if current and row and int(row.group(1)) in heights:
                price_text = row.group(2).split("ft", 1)[-1]
                values = [int(v.replace(",", "")) for v in re.findall(r"\b\d[\d,]*\b", price_text)]
                groups[current][int(row.group(1))] = values[:count]
    override = override or {}
    result = []
    for group in sorted(groups):
        matrix = []
        for height in heights:
            row = override.get((group, height), groups[group].get(height, []))
            matrix.append((row + [None] * count)[:count])
        result.append(program(f"group_{group}", f"Price Group {group}", widths, heights, matrix, source_page[group]))
    return result


def parse_interior():
    left_widths = [24, 30, 36, 42, 48, 54, 60, 72, 84, 96, 108, 120, 132, 144]
    right_widths = [156, 168, 180, 192, 204, 216, 228, 240, 252, 264, 276, 288]
    heights = [36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 108, 120, 132, 144, 156, 168]
    merged = {}
    source = {}
    for first in range(26, 40, 2):
        for page, widths in ((first, left_widths), (first + 1, right_widths)):
            current = None
            for raw in (reader.pages[page - 1].extract_text() or "").splitlines():
                match = re.search(r"PRICE\s+GROUP\s+(\d+)", raw)
                if match:
                    current = int(match.group(1)); merged.setdefault(current, {}); source.setdefault(current, []).append(page); continue
                row = re.match(r'^\s*(\d+)"\s+(.+)$', raw)
                if current and row and int(row.group(1)) in heights:
                    vals = [int(v.replace(",", "")) for v in re.findall(r"\b\d[\d,]*\b", row.group(2))]
                    merged[current].setdefault(int(row.group(1)), []).extend(vals[:len(widths)])
    programs = []
    all_widths = left_widths + right_widths
    for group in range(1, 15):
        matrix = [(merged[group].get(h, []) + [None] * len(all_widths))[:len(all_widths)] for h in heights]
        programs.append(program(f"group_{group}", f"Price Group {group}", all_widths, heights, matrix, source[group][0], max_width=288, max_height=168, notes=[f"Continuation grid: PDF p{source[group][1]}"]))
    return programs


def parse_fabrics(pdf, pages, prefix):
    records = []
    routing = {}
    for page_number in pages:
        table = pdf.pages[page_number - 1].extract_tables()[0]
        for row in table[1:]:
            if len(row) < 6 or not row[0] or not row[1] or not re.fullmatch(r"\d+", row[1].strip()):
                continue
            group = row[1].strip(); name = " ".join(row[0].split())
            metadata = {
                "name": name, "priceGroup": group, "openness": (row[2] or "").strip(),
                "rollWidthInches": inches(row[3] or ""),
                "maxRailroadLengthInches": inches(row[4] or ""),
                "railroadAllowed": (row[5] or "").strip().upper() == "OK", "sourcePage": page_number,
            }
            records.append(metadata); routing[name] = f"group_{group}"
    return records, routing


def parse_awning(pdf, page, id_, name, start_col, *, max_technical=None):
    table = pdf.pages[page - 1].extract_tables()[0]
    widths = [int(inches(v)) for v in table[1][start_col:] if v]
    heights, matrix, minima = [], [], []
    for row in table[2:]:
        if not row[0] or not re.search(r"\d", row[0]):
            continue
        heights.append(inches(row[0]))
        minimum_cell = row[start_col - 1] if start_col > 1 else None
        minima.append(inches(minimum_cell) if minimum_cell else widths[0])
        values = [money(v) for v in row[start_col:start_col + len(widths)]]
        matrix.append(values + [None] * (len(widths) - len(values)))
    p = program("standard", name, widths, heights, matrix, page, min_width=min(v for v in minima if v), min_height=min(heights), max_width=max_technical or widths[-1], max_height=max(heights), notes=["Height field represents awning projection.", "Each dimension rounds independently to the next listed grid value."], standalone=True)
    return p


def parse_drapery():
    widths = list(range(48, 433, 12))
    pinch = {key: [] for key in ["split_white", "split_bronze", "side_white", "side_bronze"]}
    for raw in (reader.pages[73].extract_text() or "").splitlines():
        row = re.match(r"\d+ Ft \((\d+) Inch\)\s+\d+\s+(.+)", raw)
        if row:
            vals = [money(v) for v in re.findall(r"\$[\d,]+", row.group(2))]
            for key, value in zip(pinch, vals): pinch[key].append(value)
    programs = [program(f"pinch_{key}", f"Pinch Pleat {key.replace('_', ' ').title()}", widths, [], [values], 74, max_width=432, notes=["Irismo motors are limited to 396 inches."], standalone=True) for key, values in pinch.items()]
    ripple_labels = [f"{master}_{pct}_{draw}" for master in ("overlap", "butt") for pct in (80, 100, 120) for draw in ("split", "side")]
    for page, color in ((75, "white"), (76, "bronze")):
        columns = [[] for _ in ripple_labels]
        for raw in (reader.pages[page - 1].extract_text() or "").splitlines():
            row = re.match(r"\d+ Ft \((\d+) Inch\)\s+\d+\s+(.+)", raw)
            if row:
                vals = [money(v) for v in re.findall(r"\$[\d,]+", row.group(2))]
                for column, value in zip(columns, vals): column.append(value)
        for label, values in zip(ripple_labels, columns):
            programs.append(program(f"ripple_{color}_{label}", f"Ripple Fold {color.title()} {label.replace('_', ' ').title()}", widths, [], [values], page, max_width=432, notes=["Irismo motors are limited to 396 inches."], standalone=True))
    return programs


def fixed_motor_group(name, options, pages):
    return {"name": name, "options": [{"id": id_, "name": label, "price": price, "notes": f"PDF p{page}"} for id_, label, price, page in options], "surcharges": [], "notes": [f"Polar dealer book pages {', '.join(map(str, pages))}"]}


def slug(value):
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")[:100]


def parse_component_tables(pdf, pages):
    options, seen, used_ids = [], set(), set()
    for page in pages:
        for table in pdf.pages[page - 1].extract_tables():
            for row in table:
                cells = [(cell or "").strip() for cell in row]
                price_index = next((index for index, cell in enumerate(cells) if "$" in cell), None)
                if price_index is None:
                    continue
                prices = [money(value) for value in re.findall(r"\$[\d,.]+", cells[price_index])]
                descriptions = [line.strip() for line in "\n".join(cells[:price_index]).splitlines() if line.strip()]
                if not prices or not descriptions:
                    continue
                category = descriptions[0]
                details = descriptions[-len(prices):] if len(prices) > 1 else [" - ".join(descriptions)]
                for detail, price in zip(details, prices):
                    label = detail if category.lower() in detail.lower() else f"{category} - {detail}"
                    id_ = slug(label)
                    key = (id_, price)
                    if key in seen:
                        continue
                    if id_ in used_ids:
                        id_ = f"{id_}_{str(price).replace('.', '_')}"
                    seen.add(key); used_ids.add(id_); options.append((id_, label, price, page))
    return options


with pdfplumber.open(str(PDF)) as pdf:
    interior_fabrics, interior_routing = parse_fabrics(pdf, [22, 23, 24, 25], "interior")
    exterior_fabrics, exterior_routing = parse_fabrics(pdf, [95], "exterior")
    interior_component_options = parse_component_tables(pdf, [40,41,42,43,47,48,50,51])
    exterior_component_options = parse_component_tables(pdf, [101,102,103])
    drapery_component_options = parse_component_tables(pdf, [77])
    awning_component_options = parse_component_tables(pdf, [173])
    interior_widths = [24,30,36,42,48,54,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288]
    interior_surcharges = [
        height_surcharge("side_channels", "Interior Side Channels", [36,42,48,54,60,66,72,78,84,90,96,108,120,132,144,156,168], [77,88,99,110,121,132,143,154,165,176,187,209,231,253,275,297,319], 26),
        width_surcharge("fascia_3", '3" Square Fascia', interior_widths, [44,50,55,61,66,72,77,88,99,110]+[None]*16, 26),
        width_surcharge("fascia_4", '4" Square Fascia', interior_widths, [56,63,69,75,81,88,94,106,119,131,140,152,164,176]+[None]*12, 26),
        width_surcharge("fascia_5", '5" Square Fascia', interior_widths, [84,92,100,107,115,122,130,145,161,176,191,207,222,237,268,285,301,317]+[None]*8, 26, notes="Continuation prices on p27."),
        width_surcharge("fascia_7", '7" Square Fascia', interior_widths, [220,238,256,275,293,311,330,366,403,440,476,513,550,586,670,709,748,787]+[None]*8, 26, notes="Continuation prices on p27."),
        width_surcharge("fascia_3_76_cm", '3.76" CM Fascia', interior_widths, [68,75,83,90,98,105,113,128,143,158,168,183,197,211]+[None]*12, 26),
        width_surcharge("head_pocket_4", '4" Head Pocket', interior_widths, [191,212,233,254,275,296,318,360,402,445,487]+[None]*15, 26),
        width_surcharge("head_pocket_5_5", '5.5" Head Pocket', interior_widths, [250,273,295,318,341,364,386,409,454,523,568,614,659,704,818,867,916,965,1013,1062]+[None]*6, 26),
        width_surcharge("hang_strip", "Hang Strip with Closure Plate", interior_widths, [106,116,125,135,145,154,164,174,193,222,241,261,280,299,319,339,359,378,398,418,438,458,477,497,517,537], 26),
        width_surcharge("interior_cassette", "Interior Cassette", interior_widths, [77,85,94,102,111,119,128,145,162,179]+[None]*16, 26),
        width_surcharge("specialty_hem_bar", "Specialty External Hem Bar", interior_widths, [20,25,30,35,40,45,50,60,70,80,90,100,110,120]+[None]*12, 26),
        surcharge("metal_chain", "Architectural Metal Chain", 10, 26), surcharge("cm_clutch", "CM Clutch", 60, 26),
        surcharge("spring_assist", "Spring Assisted Clutch / Spring Roller", 125, 26), surcharge("pt_signature_metal", "PT Signature Metal Hardware", 120, 26),
        surcharge("bottom_up", "Bottom-Up Clutch", 275, 26), surcharge("pt_signature_plastic", "PT Signature Plastic Hardware", 50, 26),
        surcharge("coupler_manual", "Straight Line Coupler - Manual", 40, 26), surcharge("coupler_motor_min_gap", "Straight Line Minimum Gap Coupler - Motorized", 150, 26),
        surcharge("coupler_motor_adjustable", "Adjustable / 90 Degree Coupler - Motorized", 250, 26),
        surcharge("duo_5_manual", '5" Duo Shade Manual', 100, 26), surcharge("duo_5_motorized", '5" Duo Shade Motorized', 150, 26), surcharge("duo_7", '7" Duo Shade', 200, 26),
        surcharge("cordless_coulisse", "Coulisse Cordless", 125, 26), surcharge("cordless_zero_gravity", "Zero Gravity Cordless", 160, 26),
        surcharge("printed_shade", "Printed Shade", None, 82, notes="Price is not defined in the source."),
        surcharge("ral_fascia_3", '3" Fascia RAL Custom Color', 25, 157, per="foot", auto_units="width_foot", dealer_factor=1, minimum_charge=250),
        surcharge("ral_fascia_4", '4" Fascia RAL Custom Color', 30, 157, per="foot", auto_units="width_foot", dealer_factor=1, minimum_charge=250),
        surcharge("ral_fascia_5", '5" Fascia RAL Custom Color', 35, 157, per="foot", auto_units="width_foot", dealer_factor=1, minimum_charge=250),
        surcharge("ral_fascia_7", '7" Fascia RAL Custom Color', 50, 157, per="foot", auto_units="width_foot", dealer_factor=1, minimum_charge=250),
        surcharge("ral_head_pocket_4", '4" Head Pocket RAL Custom Color', 500, 157, dealer_factor=1),
        surcharge("ral_head_pocket_5", '5" Head Pocket RAL Custom Color', 750, 157, dealer_factor=1),
        surcharge("ral_head_pocket_7", '7" Head Pocket RAL Custom Color', 1250, 157, dealer_factor=1),
        surcharge("ral_light_channels_pair", "Light Channels Pair RAL Custom Color", 40, 157, per="foot", auto_units="height_foot", dealer_factor=1, minimum_charge=250),
        surcharge("ral_hang_strip", "Hang Strip RAL Custom Color", 40, 157, per="foot", auto_units="width_foot", dealer_factor=1, minimum_charge=250),
    ]
    interior_programs = parse_interior()
    products = [product("polar_interior_roller", "Roller Shades", "Polar Interior Roller", list(range(12,54)), interior_programs, interior_surcharges, system="Interior Roller", routing=interior_routing, fabrics=interior_fabrics, notes=["Retail grids are for manual shades before options (p20).", "Dimensions round up independently (p20).", "Spring assist is included starting at 120 inches wide (p26).", "Freight and residential/out-of-area delivery amounts are not defined (p5)."], pricing_family="polar_interior_roller_fabric_group")]

    ext_specs = [
        ("polar_elite_patio", "Elite Patio", range(96,101), [48,54,60,66,72,78,84,96,108,120,132,144,156], [36,48,60,72,84,96,108,120], 13, None),
        ("polar_titan_patio", "Titan Patio", range(120,125), [72,84,96,108,120,132,144,156,168,180,192,197,204,216], [36,48,60,72,84,96,108,120,132,144,156,168,180,192,197], 14, {(1,197): [1325,1454,1583,1698,1810,1924,2037,2149,2263,2372,2486,2580,None,None], (7,132): [1740,1933,2128,2304,2477,2653,2833,3016,3209,3399,3591,3826,3943,4061]}),
        ("polar_mega_exterior", "Mega Exterior", range(147,152), [204,216,228,240,252,264,276,288,300], [36,48,60,72,84,96,108,120,132,144,156,168,180,192], 9, None),
    ]
    for id_, name, pages, widths, heights, count, override in ext_specs:
        programs = parse_group_pages(pages, widths, heights, count, override=override)
        valances = []
        if "elite" in id_:
            valances = [width_surcharge("elite_cassette", '4.5" Elite Cassette', widths, [176,198,220,242,264,286,308,352,396,440,484,528,572], 96), width_surcharge("shade_pocket", '5.5" Shade Pocket', widths, [341,364,386,398,409,432,454,523,568,614,659,704,818], 96)]
        elif "titan" in id_:
            valances = [width_surcharge("patriot_hood", "Patriot Hood", widths, [297,347,396,446,495,545,594,644,693,743,792,842,867,891], 120), width_surcharge("titan_cassette", '5.5" Titan Cassette', widths, [462,539,616,693,770,847,924,1001,1078,1155,1232,1309,1348,1386], 120), width_surcharge("shade_pocket", '5.5" Shade Pocket', widths, [409,454,523,568,614,659,704,818,867,916,965,1013,1038,1062], 120)]
        else:
            valances = [width_surcharge("patriot_hood", "Patriot Hood", widths[1:], [891,941,990,1040,1089,1139,1188,1238], 147), width_surcharge("mega_cassette", "Mega Cassette Box", widths[1:], [2500]*8, 147)]
        valances += [surcharge("vortex_36_96", "Vortex Option 36-96 inch height", 500, pages.start), surcharge("vortex_108_plus", "Vortex Option 108+ inch height", 650, pages.start), surcharge("u_channel", "U Channel Inside Mount", 22, pages.start, per="foot", auto_units="height_foot", notes="Published table increments $22 per vertical foot."), surcharge("ral_custom_color", f"{name} RAL Custom Color", {"Elite Patio":1500,"Titan Patio":2000,"Mega Exterior":2500}[name], 157, dealer_factor=1)]
        products.append(product(id_, "Roller Shades", f"Polar {name}", list(range(pages.start-6, pages.stop+7)), programs, valances, system=name, routing=exterior_routing, fabrics=exterior_fabrics, notes=["Tracks, rod, and cable guide configurations are included in grid pricing.", "Rod guide maximum shade height is 120 inches.", "Vortex dimensional limits are source-defined and must be validated.", "Freight amount is unresolved."], pricing_family=f"{id_}_fabric_group"))

    drapery_surcharges = [
        surcharge("bracket_one_touch", "One Touch Ceiling Bracket", 6.70, 74), surcharge("bracket_swivel", "Swivel Ceiling Bracket", 3.15, 74),
        surcharge("bracket_adjustable_white", "4.5-6 inch Adjustable Bracket - White", 20.52, 74), surcharge("bracket_adjustable_bronze", "4.5-6 inch Adjustable Bracket - Bronze", 21.53, 74),
        surcharge("bracket_double_white", "8.75-10.25 inch Double Wall Bracket - White", 30.38, 74), surcharge("bracket_double_bronze", "8.75-10.25 inch Double Wall Bracket - Bronze", 31.90, 74),
        surcharge("silent_master_side", "Silent Master Carrier - Side Opening", 40, 74), surcharge("silent_master_split", "Silent Master Carrier - Split Draw", 20, 74),
        surcharge("silent_runner", "Silent Runner Upgrade", 3.50, 74), surcharge("custom_bend", "Custom Curving/Bending", 700, 74), surcharge("curved_packaging", "Curved Track Special Packaging", 400, 74),
    ]
    products.append(product("polar_drapery_track", "Drapery Tracks", "Polar Motorized Drapery Track", [74,75,76,77], parse_drapery(), drapery_surcharges, system="Motorized Drapery Track", notes=["Each named drapery program is a complete standalone source grid, not a fabric price-group tier.", "Track price excludes motor and brackets.", "Irismo motor maximum track length is 396 inches."]))
    products.append(product("polar_tension_shade", "Tension Shades", "Polar Motorized Tension Shade", [84,85,86], [], [], system="Motorized Tension Shade", basis="manual_required", factor=None, notes=["Specifications are published but the source has no complete retail price grid."]))
    all_seasons_programs = [
        program(
            "single_48x96", "Single Door 48 x 96", [48], [96], [[None]], 88,
            costs=[[375]], min_width=48, min_height=96, standalone=True,
            notes=["$375 is published dealer-net cost. Customer retail is undefined."],
        ),
        program(
            "double_72x96", "Double Door 72 x 96", [72], [96], [[None]], 88,
            costs=[[700]], min_width=72, min_height=96, standalone=True,
            notes=["$700 is published dealer-net cost. Customer retail is undefined."],
        ),
    ]
    products.append(product("polar_all_seasons_screen", "Retractable Screens", "Polar All Seasons Retractable Screen", [88], all_seasons_programs, [surcharge("sliding_glass_door", "Sliding Glass Door", None, 88, dealer_net_value=25, source_id=SOURCE_ID, notes="$25 is published dealer-net cost. Customer retail is undefined.")], system="All Seasons Single / Double", basis="dealer_net", factor=None, notes=["NET PRICING - NO DEALER DISCOUNTS APPLY.", "Customer retail is not defined; customer totals are blocked."]))

    awning_specs = [(165,"polar_awning_premium_pro","Premium Pro",2,276),(167,"polar_awning_premium_plus","Premium Plus",2,240),(169,"polar_awning_premium","Premium",2,276),(171,"polar_awning_select","Select",3,480),(178,"polar_awning_drop_arm","Drop Arm Window",1,192)]
    for page,id_,name,start_col,max_technical in awning_specs:
        p = parse_awning(pdf,page,id_,name,start_col,max_technical=max_technical)
        surcharges = [
            surcharge("somfy_orea_550", "Somfy Orea RTS 550R2", 882, page), surcharge("somfy_altus_550", "Somfy Altus RTS 550R2", 941, page),
            surcharge("alpha_remote_50", "Alpha Remote 50", 450, page), surcharge("somfy_std_550", "Somfy STD 550R2", 760, page), surcharge("alpha_manual_50", "Alpha Manual WSS 50", 300, page),
            surcharge("premium_fabric", "Premium Drop Valance Fabric", 25, 177, kind="percent", notes="Applies to the selected drop-valance price.", percent_of="drop_valance"),
            surcharge("drop_valance_motor", "Drop Valance Motorization", 750, 177), surcharge("led_motor_package", "Somfy LED Motor Package", 700, 176),
            surcharge("led_arm_6_11", "LED Integrated Arm 6 ft 11 in", 301, 176), surcharge("led_arm_8_6", "LED Integrated Arm 8 ft 6 in", 325, 176),
            surcharge("led_arm_10_2", "LED Integrated Arm 10 ft 2 in", 363, 176), surcharge("led_arm_11_9", "LED Integrated Arm 11 ft 9 in", 406, 176), surcharge("led_arm_13_5", "LED Integrated Arm 13 ft 5 in", 498, 176),
            surcharge("recover", "Awning Fabric Recover", 12.25, 177, per="sqft"), surcharge("valance_recover_up_to_8", "Valance Recover Up to 8 inches", 13.94, 177, per="foot", auto_units="width_foot"), surcharge("valance_recover_over_8", "Valance Recover Over 8 inches", 18.59, 177, per="foot", auto_units="width_foot"),
            surcharge("custom_frame_color", "Custom Frame Color", None, page, notes="The source states that a surcharge applies but does not define an amount."),
        ]
        if name == "Drop Arm Window":
            table = pdf.pages[177].extract_tables()[0]; widths=p["grid"]["widths"]
            surcharges.append(width_surcharge("cassette", "Cassette", widths, [money(v) for v in table[6][1:]], 178))
        if name == "Select":
            table = pdf.pages[170].extract_tables()[0]; widths=p["grid"]["widths"]
            surcharges += [width_surcharge("hood", "Hood", widths, [money(v) for v in table[7][3:]], 171), width_surcharge("drop_valance", "Standard Drop Valance", widths, [money(v) for v in table[8][3:]], 171)]
        if name == "Premium":
            table = pdf.pages[168].extract_tables()[0]; widths=p["grid"]["widths"]
            surcharges.append(width_surcharge("drop_valance", "Standard Drop Valance", widths, [money(v) for v in table[6][2:2 + len(widths)]], 169))
        products.append(product(id_, "Awnings", f"Polar {name} Awning", [page,173,176,177], [p], surcharges, system=name, notes=[f"{name} is one complete standalone source grid, not a fabric price-group tier.", "Grid width and projection round up independently.", "Standard wall brackets are included.", "Freight amount is unresolved."] + (["Technical maximum is 480 inches; customer pricing above 276 inches is contact-for-price and blocked."] if name=="Select" else [])))

    products.append(product("polar_exterior_clutch_unavailable", "Roller Shades", "Polar Exterior Clutch Roller Shade", [8,9], [], [], system="Exterior Clutch", basis="unavailable", factor=None, notes=["Only a stale bookmark and warranty reference exist; no usable product/pricing section is present."]))

catalog = {
    "source": SOURCE_FILE, "sourceId": SOURCE_ID, "sourceSha256": SOURCE_SHA256,
    "effectiveDate": "undefined", "currency": "USD",
    "generatedFrom": SOURCE_FILE,
    "sources": [{"sourceId":SOURCE_ID,"file":SOURCE_FILE,"title":"Interior & Exterior Shades Pricing & Reference Guide","revision":"CURRENT","effectiveDate":None,"receivedDate":"2026-07-20","modifiedDate":"2026-07-18","pages":SOURCE_PAGE_COUNT,"sha256":SOURCE_SHA256}],
    "globalRules": {"surcharges": [], "notes": ["Suggested retail is customer pricing.", "Dealer cost is retail x 0.45 except dealer-net or manual products.", "Round each measured dimension up independently.", "Never substitute another group or cell.", "Freight, residential delivery, and out-of-area delivery amounts are unresolved."]},
    "products": products,
    "motorization": {
        "polar_interior_motors": fixed_motor_group("Polar Interior Motors and Controls", [("motor_506_standard","506 Standard Motor",561,40),("motor_506_altus","506 Altus RTS Motor",784,40),("motor_510_standard","510 Standard Motor",685,40),("motor_510_rts","510 RTS Motor",907,40)] + interior_component_options, [40,41,42,43,47,48,50,51]),
        "polar_elite_motors": fixed_motor_group("Polar Elite Motors and Controls", [("motor_506_standard","506 Standard Motor",561,101),("motor_506_altus","506 Altus RTS Motor",784,101),("motor_510_standard","510 Standard Motor",685,101),("motor_510_altus","510 Altus RTS Motor",907,101)] + exterior_component_options, [101,102,103]),
        "polar_titan_motors": fixed_motor_group("Polar Titan Motors and Controls", [("motor_506_standard","506 Standard Motor",561,125),("motor_506_altus","506 Altus RTS Motor",784,125),("motor_510_standard","510 Standard Motor",685,125),("motor_510_altus","510 Altus RTS Motor",907,125),("motor_525_standard","525 Standard Motor",697,125),("motor_525_altus","525 Altus RTS Motor",898,125)] + exterior_component_options, [125,126,127]),
        "polar_mega_motors": fixed_motor_group("Polar Mega Motors and Controls", [("motor_525_standard","525 Standard Motor",697,152),("motor_525_altus","525 Altus RTS Motor",907,152)] + exterior_component_options, [152,153,154]),
        "polar_drapery_motors": fixed_motor_group("Polar Drapery Motors and Components", [("glydea_60_rts","Glydea Ultra 60 RTS",1345,77),("glydea_35_rts","Glydea Ultra 35 RTS",1148,77),("glydea_60_dct","Glydea Ultra 60 DCT",1153,77),("glydea_35_dct","Glydea Ultra 35 DCT",957,77),("glydea_60_wired","Glydea Ultra 60 Wired",1313,77),("glydea_35_wired","Glydea Ultra 35 Wired",818,77)] + drapery_component_options, [77]),
        "polar_awning_controls": fixed_motor_group("Polar Awning Controls, Sensors, and Cables", awning_component_options, [173]),
    },
}


def assert_catalog_structure(output):
    def require(condition, message):
        if not condition:
            raise RuntimeError(f"Refusing to overwrite {OUT.name}: {message}")

    require(output["sourceId"] == SOURCE_ID, "source identity drifted")
    require(output["sourceSha256"] == SOURCE_SHA256, "source SHA-256 drifted")
    require(output["sources"] == [{
        "sourceId": SOURCE_ID,
        "file": SOURCE_FILE,
        "title": "Interior & Exterior Shades Pricing & Reference Guide",
        "revision": "CURRENT",
        "effectiveDate": None,
        "receivedDate": "2026-07-20",
        "modifiedDate": "2026-07-18",
        "pages": SOURCE_PAGE_COUNT,
        "sha256": SOURCE_SHA256,
    }], "embedded source metadata is incomplete")

    expected_program_counts = {
        "polar_interior_roller": 14,
        "polar_elite_patio": 10,
        "polar_titan_patio": 10,
        "polar_mega_exterior": 10,
        "polar_drapery_track": 28,
        "polar_tension_shade": 0,
        "polar_all_seasons_screen": 2,
        "polar_awning_premium_pro": 1,
        "polar_awning_premium_plus": 1,
        "polar_awning_premium": 1,
        "polar_awning_select": 1,
        "polar_awning_drop_arm": 1,
        "polar_exterior_clutch_unavailable": 0,
    }
    by_product = {entry["id"]: entry for entry in output["products"]}
    require(len(by_product) == len(output["products"]), "duplicate product IDs")
    require(set(by_product) == set(expected_program_counts), "product inventory drifted")
    require(sum(len(entry["programs"]) for entry in output["products"]) == 79, "program inventory is not 79")

    for product_id, expected_count in expected_program_counts.items():
        product_entry = by_product[product_id]
        require(len(product_entry["programs"]) == expected_count, f"{product_id} program count drifted")
        program_ids = [entry["id"] for entry in product_entry["programs"]]
        require(len(program_ids) == len(set(program_ids)), f"{product_id} has duplicate program IDs")
        for program_entry in product_entry["programs"]:
            grid = program_entry["grid"]
            expected_rows = 1 if program_entry["priceAxis"] == "width" else len(grid["heights"])
            expected_columns = 1 if program_entry["priceAxis"] == "height" else len(grid["widths"])
            for matrix_name in ("prices", "costs"):
                if matrix_name not in grid:
                    continue
                matrix = grid[matrix_name]
                require(len(matrix) == expected_rows, f"{product_id}/{program_entry['id']} {matrix_name} row count drifted")
                require(all(len(row) == expected_columns for row in matrix), f"{product_id}/{program_entry['id']} {matrix_name} is not rectangular")
            require(all(1 <= page <= SOURCE_PAGE_COUNT for page in program_entry["sourcePages"]), f"{product_id}/{program_entry['id']} has an invalid source page")

    require(len(by_product["polar_interior_roller"]["fabricMetadata"]) == 176, "interior fabric inventory is not 176")
    for product_id in ("polar_elite_patio", "polar_titan_patio", "polar_mega_exterior"):
        require(len(by_product[product_id]["fabricMetadata"]) == 48, f"{product_id} fabric inventory is not 48")
    require(by_product["polar_interior_roller"]["programs"][0]["grid"]["prices"][0][0] == 110, "Interior Group 1 anchor is not $110")
    require(by_product["polar_drapery_track"]["programs"][0]["grid"]["prices"][0][0] == 472, "Drapery anchor is not $472")
    require(by_product["polar_awning_premium_pro"]["programs"][0]["grid"]["prices"][0][0] == 4900, "Premium Pro anchor is not $4,900")

    all_seasons = by_product["polar_all_seasons_screen"]
    require(all_seasons["priceBasis"] == "dealer_net", "All Seasons is not dealer-net")
    all_seasons_programs = {entry["id"]: entry for entry in all_seasons["programs"]}
    require(all_seasons_programs["single_48x96"]["grid"]["prices"] == [[None]], "Single Door contains invented retail")
    require(all_seasons_programs["single_48x96"]["grid"]["costs"] == [[375]], "Single Door dealer cost is not $375")
    require(all_seasons_programs["double_72x96"]["grid"]["prices"] == [[None]], "Double Door contains invented retail")
    require(all_seasons_programs["double_72x96"]["grid"]["costs"] == [[700]], "Double Door dealer cost is not $700")
    require(all_seasons["surcharges"] == [{
        "id": "sliding_glass_door",
        "name": "Sliding Glass Door",
        "kind": "flat",
        "per": "unit",
        "value": None,
        "appliesTo": "all",
        "notes": "$25 is published dealer-net cost. Customer retail is undefined.",
        "sourceType": "Polar dealer book",
        "sourcePages": [88],
        "dealerNetValue": 25,
        "sourceId": SOURCE_ID,
    }], "Sliding Glass Door must remain a source-pinned $25 dealer-net option")


assert_catalog_structure(catalog)
temporary_out = OUT.with_name(f".{OUT.name}.tmp")
temporary_out.write_text(json.dumps(catalog, indent=2) + "\n")
temporary_out.replace(OUT)
print(f"Wrote {OUT}: {len(products)} products, {sum(len(p['programs']) for p in products)} programs")
