#!/usr/bin/env python3
"""Import pinned Sundance PDF tables; never infer account factors or option rules.

Usage: python import-sundance-catalog.py --source-dir /path/to/downloaded/pdfs
Requires pdfplumber. Download URLs/hashes are in sundance/sources.lock.json.
Table coordinates preserve merged unavailable cells, rather than shifting text
tokens into the wrong columns. Catalog programs remain manual until their
configuration and commercial authority is explicitly implemented.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]


def number(value):
    value = (value or "").strip().replace('"', '').replace('”', '').replace(',', '').replace('$', '')
    value = value.replace('½', '.5').replace(' ', '')
    return float(value) if re.fullmatch(r'\d+(?:\.\d+)?', value) else None


def width_number(value):
    """A printed width band uses its inclusive upper bound, never a price cell."""
    clean = (value or "").replace('"', "").replace("”", "").replace(" ", "").strip()
    band = re.fullmatch(r"(\d+(?:\.\d+)?)[–—-](\d+(?:\.\d+)?)", clean)
    if band and 0 < float(band[1]) <= float(band[2]):
        return float(band[2])
    return number(clean.rstrip("`"))


def extract_grid(table):
    for row_index, row in enumerate(table[:3]):
        indices = [i for i, cell in enumerate(row) if width_number(cell) is not None]
        if len(indices) < 4 or indices != list(range(indices[0], indices[-1] + 1)):
            continue
        widths = [width_number(row[i]) for i in indices]
        if widths != sorted(set(widths)) or max(widths) > 240:
            continue
        heights, prices = [], []
        for cells in table[row_index + 1:]:
            # A merged height header may create multiple leading columns.
            # Accept exactly one numeric height; never shift a price into it.
            leading_numbers = [number(cell) for cell in cells[:indices[0]] if number(cell) is not None]
            height = leading_numbers[0] if len(leading_numbers) == 1 else None
            if height is None or (heights and height <= heights[-1]):
                break
            values = [number(cells[i]) for i in indices]
            if any(cells[i] and number(cells[i]) is None and cells[i].strip() not in ('N/A', 'NA', '—', '-') for i in indices):
                return None
            if not any(value is not None for value in values):
                return None
            heights.append(height)
            prices.append(values)
        if len(heights) >= 3 and heights == sorted(set(heights)):
            return {'widths': widths, 'heights': heights, 'prices': prices}
    return None


def extract_borderless_grid(text):
    """Accept only a complete rectangular numeric table, without skipped cells."""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        tokens = line.replace('increments', '').split()
        widths = [number(token) for token in tokens]
        if len(widths) < 10 or any(n is None for n in widths):
            continue
        if widths != sorted(set(widths)) or max(widths) > 240:
            continue
        heights, prices = [], []
        for next_line in lines[index + 1:]:
            if next_line.startswith('Prices subject'):
                break
            values = [number(token) for token in next_line.split()]
            if len(values) != len(widths) + 1 or any(n is None for n in values):
                heights = []  # A partial table is not an importable price grid.
                break
            heights.append(values[0])
            prices.append(values[1:])
        if len(heights) >= 3 and heights == sorted(set(heights)):
            return {'widths': widths, 'heights': heights, 'prices': prices}
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    args = parser.parse_args()
    sources = json.loads((ROOT / 'scripts/sundance/sources.lock.json').read_text())
    families = json.loads((ROOT / 'scripts/sundance/families.json').read_text())
    documents = {}
    try:
        for source in sources:
            path = args.source_dir / source['file']
            if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
                raise ValueError(f"Source hash changed: {source['file']}; review before importing")
            documents[source['file']] = pdfplumber.open(path)
            if len(documents[source['file']].pages) != source['pages']:
                raise ValueError(f"Page count changed: {source['file']}")
        products = []
        for family in families:
            source = next(row for row in sources if row['file'] == family['sourceFile'])
            programs = []
            for page_number in family['pricePages']:
                page = documents[family['sourceFile']].pages[page_number - 1]
                page_text = page.extract_text() or ''
                tables = page.extract_tables()
                candidates = [(i, extract_grid(table)) for i, table in enumerate(tables)]
                if not tables:
                    upright_text = page.filter(lambda obj: abs(obj.get('matrix', (1, 0))[0]) >= abs(obj.get('matrix', (1, 0))[1])).extract_text() or ''
                    candidates = [(0, extract_borderless_grid(upright_text))]
                for table_index, grid in candidates:
                    if grid is None:
                        continue
                    program_id = f"{family['id']}_p{page_number}_t{table_index + 1}"
                    title = f"{family['name']} · PDF {page_number}, table {table_index + 1}"
                    programs.append({
                        'id': program_id, 'name': title, 'priceGroup': None,
                        'priceAxis': 'wh', 'priceBasis': 'manual_required',
                        'sourceId': source['sourceId'], 'sourcePages': [page_number],
                        'grid': grid, 'maxWidth': None, 'maxHeight': None,
                        'maxAreaSqft': None, 'fabricCollections': [],
                        'notes': [f"PDF page {page_number}, table {table_index + 1}. Source grid only; not complete configuration pricing.", page_text],
                    })
            products.append({
                'id': family['id'], 'name': family['name'], 'system': family['name'],
                'productType': family['quoteProductType'], 'manufacturer': 'Sundance',
                'priceBasis': 'manual_required', 'customerRetailStatus': 'unverified',
                'freightStatus': 'unresolved', 'pages': family['pricePages'],
                'source': source['url'], 'fabricRouting': None,
                'programs': programs, 'surcharges': [], 'fabricByYard': [],
                'notes': family['activationBlockers'],
            })
        option_grids = []
        for definition in json.loads((ROOT / 'scripts/sundance/option-grids.json').read_text()):
            source = next(row for row in sources if row['file'] == definition['sourceFile'])
            page = documents[definition['sourceFile']].pages[definition['sourcePage'] - 1]
            grid = extract_grid(page.extract_tables()[definition['sourceTable'] - 1])
            if grid is None:
                raise ValueError(f"Missing supplemental grid: {definition['id']}")
            option_grids.append({**definition, 'sourceId': source['sourceId'], 'sourceSha256': source['sha256'],
                                 'sourcePages': [definition['sourcePage']], 'priceBasis': 'suggested_retail',
                                 'customerPriceEligible': False, 'grid': grid})
        (ROOT / 'src/lib/quote/sundance/option-grids.source.json').write_text(json.dumps(option_grids, indent=2) + '\n')
        catalog = {
            'source': 'Sundance manufacturer PDF sources verified 2026-09-14; account terms pending',
            'effectiveDate': '', 'currency': 'USD', 'generatedFrom': 'scripts/import-sundance-catalog.py',
            'sources': [{
                'sourceId': s['sourceId'], 'file': s['file'], 'title': s['file'],
                'revision': s['sha256'][:12], 'effectiveDate': None,
                'receivedDate': s['verifiedOn'], 'modifiedDate': '',
                'pages': s['pages'], 'sha256': s['sha256'],
            } for s in sources],
            'globalRules': {'surcharges': [], 'notes': []},
            'products': products, 'motorization': {},
        }
        dest = ROOT / 'src/lib/quote/catalog/sundance.catalog.json'
        dest.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps({'families': len(products), 'grids': sum(len(p['programs']) for p in products),
                          'priceCells': sum(sum(v is not None for row in g['grid']['prices'] for v in row) for p in products for g in p['programs'])}))
    finally:
        for document in documents.values():
            document.close()


if __name__ == '__main__':
    main()
