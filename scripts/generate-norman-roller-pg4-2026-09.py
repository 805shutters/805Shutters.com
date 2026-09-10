#!/usr/bin/env python3
"""Generate only the September PG4 addition, retaining July/August history.

Requires openpyxl and pypdf. All three original manufacturer inputs are pinned;
no prices, colors, fabric codes, or application limits are inferred.
"""
import argparse
import hashlib
import importlib.util
import json
import re
from datetime import date
from pathlib import Path
from openpyxl import load_workbook
from pypdf import PdfReader

PROGRAM = 'roller_cordless_fabric_price_group_4_pg4'
INPUTS = {
    'Roller MinMax Appendix.xlsx': '754e924e4b3c4429b5452e3de0d0ed330d7b2a376613783c9659766f61a04629',
    'Roller Shade Guide.pdf': 'e9cc15ce95e5d0c2305b639df612af39e7f17fb316d001631e3c3cbff36e0b2e',
    '2026Sep Retail Price Guide.pdf': '3767de1e04ee7c8dc6bab14a6224868e4ca366f2ec4be2d8d3d13ec5cf45aafd',
}
COLLECTIONS = {
    'Springtide': ('AB06113', 'Light Filtering', 10, ['F2221','F2225','F2226','F2222','F2227','F2223','F2224']),
    'Olivia RD': ('AA0392', 'Room Darkening', 13, ['F2102','F2104','F2108','F2106','F2107']),
    'Etch RD': ('AB06117', 'Room Darkening', 13, ['F2201','F2202']),
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_dir', type=Path)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    for name, expected in INPUTS.items():
        assert hashlib.sha256((args.source_dir / name).read_bytes()).hexdigest() == expected, name
    spec = importlib.util.spec_from_file_location('roller_parser', Path(__file__).with_name('generate-norman-roller-v2-source.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.INGESTION_AS_OF = date(2026, 9, 10)
    workbook = args.source_dir / 'Roller MinMax Appendix.xlsx'
    full = module.build_data(load_workbook(workbook, data_only=True), workbook, workbook)
    assert full['metadata']['effectiveFrom'] == '2026-09-01'
    codes = {code for row in COLLECTIONS.values() for code in row[3]}
    offerings = [row for row in full['offerings'] if row['colorCode'] in codes]
    assert len(offerings) == len(codes) == 14
    guide = PdfReader(args.source_dir / 'Roller Shade Guide.pdf')
    guide_pages = {page: guide.pages[page - 1].extract_text() for page in [10, 13]}
    colors = []
    for row in offerings:
        fabric_code, fabric_type, page, color_codes = COLLECTIONS[row['collection']]
        assert row['fabricCode'] == fabric_code and row['colorCode'] in color_codes
        assert row['regionScope'] == 'all_regions'
        assert f"{row['colorCode']} {row['colorName']}" in guide_pages[page]
        colors.append(dict(collection=row['collection'], fabricType=fabric_type,
            colorCode=row['colorCode'], colorName=row['colorName'], publicColorName=row['colorName'],
            frStatus='', imageUrl='', sourceNote=f'Norman September Roller Guide p{page}; September appendix {row["sourceRef"]["range"]}; retail guide p19 PG4',
            programId=PROGRAM, available=True,
            searchText=re.sub(r'[^a-z0-9]+', ' ', ' '.join([row['collection'], fabric_type, row['colorCode'], row['colorName']]).lower()).strip()))
    fabric_codes = {row[0] for row in COLLECTIONS.values()}
    rows = [row for row in full['limitRows'] if fabric_codes.intersection(row['fabricCodes'])]
    assert len(rows) == 36 and {row['sheet'] for row in rows} == set(module.LIMIT_SHEETS)
    row_ids = {row['id'] for row in rows}
    assignments = [row for row in full['profileAssignments'] if row['limitRowId'] in row_ids]
    profile_ids = {row['profileId'] for row in assignments}
    supplement = {key: full[key] for key in ['metadata','profileDefinitions']}
    supplement.update(offerings=offerings, limitRows=rows, profileAssignments=assignments,
        limitProfiles=[row for row in full['limitProfiles'] if row['id'] in profile_ids])
    # The metadata's source counts describe the entire pinned workbook; these
    # explicit subset counts describe the narrowly activated PG4 supplement.
    supplement['subsetCounts'] = {key: len(value) for key, value in supplement.items() if isinstance(value, list)}
    retail = PdfReader(args.source_dir / '2026Sep Retail Price Guide.pdf').pages[18].extract_text()
    heights = list(range(36, 145, 12))
    numeric = [list(map(int, re.findall(r'\d+', line))) for line in retail.splitlines()]
    table = [row for row in numeric if len(row) == 16 and row[0] in heights][:10]
    assert [row[0] for row in table] == heights
    assert table[0][1] == 354 and table[3][6] == 772 and table[-1][-1] == 2271
    assert 'PRICE GROUP  4' in retail and 'Springtide' in retail
    grid = dict(widths=[24,30,36,42,48,54,60,66,72,78,84,90,96,108,120], heights=heights, prices=[row[1:] for row in table])
    program = dict(id=PROGRAM, name='Cordless Fabric - Price Group 4', priceGroup='4',
        pricingFamilyId='roller_cordless_fabric', baselineProgramId='roller_cordless_fabric_price_group_1_pg1',
        priceAxis='wh', grid=grid, maxWidth=120, maxHeight=144, maxAreaSqft=None,
        fabricCollections=[dict(category='LIGHT FILTERING', fabrics=['Springtide']), dict(category='ROOM DARKENING', fabrics=['Olivia RD','Etch RD'])],
        notes=['Effective September 1, 2026. Exact fabric/application limits come from the September appendix.'],
        sourcePages=[19], sourceId='norman-retail-guide-2026-09')
    banner = '// Generated by scripts/generate-norman-roller-pg4-2026-09.py. Do not edit.\n'
    light = banner + 'import type { CatalogProgram } from "./catalog/types";\nimport type { NormanRollerFabricColor } from "./norman-roller-fabrics";\n\n'
    light += 'export const NORMAN_ROLLER_PG4_EFFECTIVE_FROM = "2026-09-01";\n'
    light += f'export const NORMAN_ROLLER_PG4_PROGRAM_ID = {json.dumps(PROGRAM)};\n'
    light += 'export const normanRollerPg4Program = ' + json.dumps(program, indent=2) + ' satisfies CatalogProgram;\n'
    light += 'export const normanRollerPg4Colors: readonly NormanRollerFabricColor[] = ' + json.dumps(colors, indent=2) + ';\n'
    (args.repo / 'src/lib/quote/norman-roller-pg4-2026-09.generated.ts').write_text(light)
    heavy = banner + 'import type { NormanRollerV2Source } from "./norman-roller-v2.generated";\n'
    heavy += 'export const normanRollerPg4Source: Pick<NormanRollerV2Source, "metadata" | "profileDefinitions" | "offerings" | "limitRows" | "profileAssignments" | "limitProfiles"> & { subsetCounts: Record<string, number> } = '
    heavy += json.dumps(supplement, indent=2) + ';\n'
    (args.repo / 'src/lib/quote-v2/generated/norman-roller-pg4-2026-09.generated.ts').write_text(heavy)
    print(json.dumps(supplement['subsetCounts']))

if __name__ == '__main__':
    main()
