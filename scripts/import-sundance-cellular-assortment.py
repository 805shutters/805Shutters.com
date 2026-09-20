#!/usr/bin/env python3
"""Extract exact cellular identities from the pinned guide's color index.

The index is authoritative for these routes: its conflicting grid headings are
recorded separately, and five representative conflicts were reconciled against
the dealer portal on 2026-09-20. This does not activate customer pricing.
"""
import argparse, hashlib, json, re
from pathlib import Path
import pdfplumber
ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--source-dir', type=Path, required=True)
a = p.parse_args()
file = 'I-Cellular-Shades_2026-web.pdf'
source = next(s for s in json.loads((ROOT/'scripts/sundance/sources.lock.json').read_text()) if s['file'] == file)
path = a.source_dir/file
if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
    raise ValueError('Review changed source before importing')
rows=[]
with pdfplumber.open(path) as d:
    for i in range(2,6):
        for cells in d.pages[i].extract_tables()[0][1:]:
            c=[re.sub(r'\s+', ' ', v or '').strip() for v in cells]
            rows.append(dict(collection=c[0], cellSize=c[1].replace(' only',''), colorName=c[2], priceGroup=c[3], opacity=c[4], oldCode=c[5], code=c[6].replace(' ',''), sourceCode=c[6], sourcePage=i+1))
if len(rows)!=148 or len({r['code'] for r in rows})!=148:
    raise ValueError('Cellular source roster changed; review completeness')
result=dict(sourceId=source['sourceId'],sourceFile=file,sha256=source['sha256'],effectiveDate='2025-05-01',rows=rows)
(ROOT/'src/lib/quote/sundance/cellular-assortment.generated.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Imported {len(rows)} exact Sundance cellular color/cell identities')
