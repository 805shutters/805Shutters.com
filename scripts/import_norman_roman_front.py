"""Extract the September Roman front-fabric tables, preserving exact source identities.

Usage: python import_norman_roman_front.py GUIDE.pdf OUTPUT.json
Requires pdfplumber. The source PDF is pinned in the quote V2 source manifest.
"""
import json
import re
import sys
from pathlib import Path
import pdfplumber

rows = []
collection = None
with pdfplumber.open(sys.argv[1]) as guide:
    for page in range(25, 35):
        for table in guide.pages[page - 1].extract_tables():
            for cells in table:
                if len(cells) != 11 or not re.fullmatch(r"F\d{4}", cells[2] or ""):
                    continue
                clean = lambda value: " ".join((value or "").split())
                collection = clean(cells[0]) or collection
                rows.append({
                    "collection": collection, "clothCode": clean(cells[1]),
                    "colorCode": cells[2], "colorName": clean(cells[3]),
                    "priceGroup": int(cells[4]),
                    "fabricWidth": float(clean(cells[6]).replace('"', '').replace('”', '')),
                    "railroad": clean(cells[7]), "seam": clean(cells[8]),
                    "pillow": clean(cells[9]), "sourcePage": page,
                })
assert len(rows) == 201 and len({row['colorCode'] for row in rows}) == 201
Path(sys.argv[2]).write_text(json.dumps(rows, indent=2) + "\n")
