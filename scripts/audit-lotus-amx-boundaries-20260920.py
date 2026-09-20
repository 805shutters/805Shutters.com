#!/usr/bin/env python3
"""Source-only AMX exact boundary/color coverage; not dealer availability approval."""
import csv,json
from collections import Counter
from pathlib import Path
root=Path(__file__).resolve().parents[1]
catalog=json.loads((root/'src/lib/quote/catalog/lotus-west-a26.catalog.json').read_text())
product=next(p for p in catalog['products'] if p['id']=='lotus_mini_blinds')
grid=product['programs'][0]['grid']; rows=[]
for y,height in enumerate(grid['heights']):
 for x,width in enumerate(grid['widths']):
  for color,suffix in [('White','W'),('Alabaster','A')]:
   skus=[s for s in grid['skuCodes'][y][x] if s.endswith(suffix)]
   donors=[s['sku'] for s in product['stockItems'] if s['color']==color and s['width']==width and s['height']==height]
   cost=grid['costs'][y][x]
   result='source_cell_unavailable' if cost is None else 'color_ordering_sku_missing' if not skus else 'exact_boundary_stock_donor_missing' if not donors else 'source_supported_exact_boundary'
   rows.append(dict(width=width,height=height,color=color,customSkus=';'.join(skus),documentedExactBoundaryDonors=';'.join(donors),dealerMerchandiseCost=cost,customerBaseRetail=grid['prices'][y][x],sourceEffectiveDate='',source='Lotus.pdf p20-24,97; Digital Catalog V1.1.25 p12-13,34',result=result,liveStatus='unresolved_exception',exception='Exact boundary geometry/source only; current account price authority and all-in dealer cost remain incomplete; production evidence is representative'))
output=root/'docs/quote-v2/lotus-audit-20260920/amx-boundary-color-ledger.csv'
with output.open('w',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print(json.dumps(dict(Counter(row['result'] for row in rows)),indent=2))
