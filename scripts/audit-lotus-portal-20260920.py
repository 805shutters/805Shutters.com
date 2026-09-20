#!/usr/bin/env python3
"""Reconcile immutable UI observations with the imported Lotus source, without guessing aliases."""
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/quote-v2/lotus-audit-20260920'
catalog = json.loads((ROOT / 'src/lib/quote/catalog/lotus-west-a26.catalog.json').read_text())
custom = json.loads((OUT / 'portal-custom-collections.json').read_text())
stock = json.loads((OUT / 'portal-stock-rows.json').read_text())
custom_index, stock_index = defaultdict(list), defaultdict(list)
grid_rows, program_rows = [], []
for product in catalog['products']:
    for program in product['programs']:
        grid = program['grid']
        cells, priced, no_sku = 0, 0, 0
        for y, row in enumerate(grid['prices']):
            for x, retail in enumerate(row):
                codes = grid.get('skuCodes', [])[y][x]
                cells += 1
                priced += retail is not None
                no_sku += retail is not None and not codes
                entry = dict(productId=product['id'], programId=program['id'],
                    source='Lotus.pdf West A26.v1', effectiveDate='', sourcePages=';'.join(map(str,program.get('sourcePages',[]))),
                    width=grid['widths'][x] if grid['widths'] else '', height=grid['heights'][y] if grid['heights'] else '',
                    dealerNet=grid.get('costs',[])[y][x], retail=retail, skus=';'.join(codes),
                    status='unresolved_exception', exception='Source cell unavailable; do not substitute' if retail is None else 'No color-specific source SKU' if not codes else 'Imported source cell; production save/reopen and current custom authority not fully verified')
                grid_rows.append(entry)
                for sku in codes:custom_index[sku].append(entry)
        program_rows.append(dict(productId=product['id'],programId=program['id'],name=program['name'],sourcePages=';'.join(map(str,program.get('sourcePages',[]))),cells=cells,pricedCells=priced,unavailableCells=cells-priced,pricedCellsWithoutSku=no_sku,status='unresolved_exception',exception='See README program matrix; no program declared verified live'))
    for item in product['stockItems']:
        stock_index[item['sku']].append(dict(item,productId=product['id']))

def write(name,rows):
    if not rows:return
    with (OUT/name).open('w',newline='') as file:
        writer=csv.DictWriter(file,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)

def amount(value):
    if not value:return None
    match=re.search(r'\$?([\d,]+\.\d{2})',value)
    return float(match[1].replace(',','')) if match else None

custom_rows=[]
for path, collection in custom.items():
    for name, price, url in collection['rows']:
        sku=name.split('|')[0].strip()
        # Collection names are exact custom SKU strings in this observed snapshot.
        matches=custom_index.get(sku,[])
        value=amount(price)
        reason='No exact source SKU destination' if not matches else 'Price not displayed on collection' if value is None else 'Price conflict' if not any(m['dealerNet']==value for m in matches) else 'Source price agrees; production configuration not verified'
        custom_rows.append(dict(sku=sku,collection=path,url=url,portalPrice=value,productIds=';'.join(sorted(set(m['productId'] for m in matches))),programIds=';'.join(sorted(set(m['programId'] for m in matches))),sourceCells=';'.join(f"{m['width']}x{m['height']}={m['dealerNet']}" for m in matches),sourcePages=';'.join(sorted(set(m['sourcePages'] for m in matches))),sourceEffectiveDate='',observedDate='2026-09-20',status='unresolved_exception',exception=reason))
stock_rows=[]
for url,title,rows in stock['products']:
    for sku,price,label,quantity,pack,cutdown in rows:
        matches=stock_index.get(sku,[])
        value=amount(price)
        discontinued='DISCONTINUED' in title.upper()
        reason='Explicit discontinued portal label; preserve historical records' if discontinued else 'No exact imported stock SKU destination' if not matches else 'Price conflict' if not any(m['dealerNetPrice']==value for m in matches) else 'Source price agrees; stock ordering selection and production persistence unverified'
        stock_rows.append(dict(sku=sku or '',title=title,url=url,variant=label,portalPrice=value,portalQuantityField=quantity or '',portalCasepack=pack or '',portalCutdown=cutdown or '',productIds=';'.join(sorted(set(m['productId'] for m in matches))),programIds=';'.join(sorted(set(m['programId'] for m in matches))),guideDealerNet=';'.join(sorted(set(str(m['dealerNetPrice']) for m in matches))),sourcePages=';'.join(sorted(set(str(m['sourcePage']) for m in matches))),sourceEffectiveDate='',observedDate='2026-09-20',status='discontinued' if discontinued else 'unresolved_exception',exception=reason))
write('custom-listing-ledger.csv',custom_rows)
write('stock-variant-ledger.csv',stock_rows)
write('custom-grid-ledger.csv',grid_rows)
write('program-ledger.csv',program_rows)
observed_custom={r['sku'] for r in custom_rows}
observed_stock={r['sku'] for r in stock_rows}
write('source-skus-not-observed.csv',[dict(kind=kind,sku=sku,productIds=';'.join(sorted(set(m['productId'] for m in matches))),programIds=';'.join(sorted(set(m['programId'] for m in matches))),status='unresolved_exception',exception='Not observed in current portal collection snapshot; absence is not discontinuation') for kind,index,observed in [('custom',custom_index,observed_custom),('stock',stock_index,observed_stock)] for sku,matches in index.items() if sku not in observed])
summary=dict(products=len(catalog['products']),programs=len(program_rows),customListings=len(custom_rows),customMapped=sum(bool(r['programIds']) for r in custom_rows),customExceptions=dict(Counter(r['exception'] for r in custom_rows)),stockPages=len(stock['products']),stockVariants=len(stock_rows),stockMapped=sum(bool(r['programIds']) for r in stock_rows),stockExceptions=dict(Counter(r['exception'] for r in stock_rows)),gridCells=len(grid_rows),sourceStockRecords=sum(len(p['stockItems']) for p in catalog['products']),pricedGridCells=sum(r['retail'] is not None for r in grid_rows),gridPricedWithoutSku=sum(r['retail'] is not None and not r['skus'] for r in grid_rows),sourceEffectiveDate=None,verifiedLive=0)
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
