"""Extract the additive Fall 2026 release from pinned Norman PDFs.

Requires pdfplumber. Pass --guide, --retail and --public-html source snapshots.
Only the 19 approved collections are imported; phase-outs are intentionally excluded.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pdfplumber

EXPECTED = {
    "Ohara": (5, 2), "Waikiki": (3, 2), "Olivia": (5, 3),
    "Rockville": (4, 2), "Brill": (4, 2), "Etch": (4, 3),
    "Leah": (5, 1), "Cara": (5, 1), "Charlotte": (12, 2), "Springtide": (7, 4),
    "Ohara RD": (5, 3), "Waikiki RD": (3, 3), "Olivia RD": (5, 4),
    "Rockville RD": (4, 3), "Brill RD": (4, 3), "Etch RD": (2, 4),
    "Leah RD": (5, 2), "Cara RD": (5, 2), "Simplicity RD": (3, 3),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(guide, retail, public_html):
    colors = []
    public = public_html.read_text()
    with pdfplumber.open(guide) as pdf:
        for page_number in (9, 10, 13):
            for table in pdf.pages[page_number - 1].extract_tables():
                if len(table[0]) != 8:
                    continue
                collection = None
                for row in table:
                    if not re.fullmatch(r"F\d{4}", row[1] or ""):
                        continue
                    if row[0]:
                        collection = row[0].replace("√", "").strip().replace("OharaRD", "Ohara RD")
                        width = float(re.search(r"[\d.]+", row[5])[0])
                        group = int(row[6])
                        material = row[7]
                    if collection not in EXPECTED:
                        continue
                    code, name = row[1:3]
                    # Match the exact SKU; never borrow an LF swatch for an RD SKU.
                    match = re.search(r'data-color="(https://normanusa.com/[^" ]*' + code + r'[^" ]*)"', public, re.I)
                    image_url = html.unescape(match[1]) if match else ""
                    public_name = name
                    if match:
                        card = public[match.end():].split("</a>", 1)[0]
                        heading = re.search(r"<h5[^>]*>(.*?)</h5>", card, re.S)
                        if heading:
                            public_name = html.unescape(re.sub(r"<[^>]+>", "", heading[1])).strip()
                    colors.append({
                        "collection": collection, "colorCode": code, "colorName": name,
                        "category": "Room Darkening" if collection.endswith(" RD") else "Light Filtering",
                        "priceGroup": group, "fabricWidth": width,
                        "coordination1": row[3], "coordination2": row[4], "material": material,
                        "sourcePage": page_number, "publicColorName": public_name, "imageUrl": image_url,
                    })
    assert len(colors) == len({r["colorCode"] for r in colors}) == 90
    for collection, (count, group) in EXPECTED.items():
        found = [r for r in colors if r["collection"] == collection]
        assert len(found) == count and all(r["priceGroup"] == group for r in found), collection

    grids = []
    with pdfplumber.open(retail) as pdf:
        for page_number in (18, 19):
            tables = [t for t in pdf.pages[page_number - 1].extract_tables()
                      if len(t) == 11 and len(t[0]) == 16 and t[0][0] == "USA"]
            assert len(tables) == 2
            # Geometric table order, not the PDF text stream (which interleaves PG3/PG4).
            for index, table in enumerate(tables):
                group = (page_number - 18) * 2 + index + 1
                grids.append({"priceGroup": group, "sourcePage": page_number,
                              "widths": list(map(int, table[0][1:])),
                              "heights": [int(r[0]) for r in table[1:]],
                              "prices": [list(map(int, r[1:])) for r in table[1:]]})
    assert [g["prices"][0][0] for g in grids] == [254, 278, 307, 354]
    return {"release": "fall_2026", "effectiveDate": "2026-09-01",
            "sources": {"guide": {"file": guide.name, "sha256": digest(guide), "pages": [9, 10, 13]},
                        "retail": {"file": retail.name, "sha256": digest(retail), "pages": [18, 19]},
                        "public": {"url": "https://normanusa.com/product/soluna-roller-shades/",
                                   "sha256": digest(public_html)}},
            "colors": colors, "grids": grids}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("guide", "retail", "public-html"):
        parser.add_argument("--" + arg, type=Path, required=True)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "src/lib/quote/catalog/norman-roller-fall-2026.json")
    args = parser.parse_args()
    data = extract(args.guide, args.retail, args.public_html)
    args.output.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Extracted {len(data['colors'])} colors and {len(data['grids'])} price grids to {args.output}")
