"""Import width-only retail schedules separately from shade grids and net motor rates."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];lock=json.loads((root/'scripts/sundance/sources.lock.json').read_text());rows=[]
def number(value):return float(re.sub(r'[^0-9.]','',value))
for file,page,table,product in [('H-Sheerview-Pricing_Aug2026.pdf',24,3,'sundance_sheerview'),('Sundance-Portfolio-Roman-Shade-Product-Price-Guide-2026.pdf',25,1,'sundance_portfolio_roman')]:
 path=a.source_dir/file;meta=next(r for r in lock if r['file']==file)
 assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
 with pdfplumber.open(path) as doc:cells=doc.pages[page-1].extract_tables()[table-1]
 widths=list(map(number,cells[1][1:]));assert widths==sorted(widths)
 assert len(widths)==(13 if product=='sundance_sheerview' else 12)
 for row in cells[2:]:
  group=row[0].replace('Price Group ','') if row[0] else None
  prices=list(map(number,row[1:]));assert len(prices)==len(widths)
  rows.append(dict(id=f'{product}_valance_p{page}_t{table}'+('_'+group.lower() if group else ''),productId=product,name='Valance only' if group else 'Flat square valance',priceGroup=group,widths=widths,sourceRetailPrices=prices,maxHeight=18 if group else None,blackoutMultiplier=1.1 if group else None,sourceFile=file,sourcePage=page,sourceTable=table,sourceId=meta['sourceId'],sourceSha256=meta['sha256'],effectiveDate=None))
for family,date,pages in [('premier','10.01.25',[17,18,19]),('select','10.21.25',[17,18])]:
 file=f'Sundance-Walden-{family.title()}-2026A-updated-{date}.pdf';product=f'sundance_walden_{family}'
 path=a.source_dir/file;meta=next(r for r in lock if r['file']==file)
 assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
 family_rows=[]
 with pdfplumber.open(path) as doc:
  for page in pages:
   for table,cells in enumerate(doc.pages[page-1].extract_tables(),1):
    group=re.search(r'PRICE GROUP ([A-F])',cells[0][0]).group(1)
    width_row=cells[1] if family=='premier' else cells[0]
    widths=list(map(number,width_row[-9:]));assert widths==[24,30,36,42,48,60,72,84,96]
    assert cells[-1][0]=='VALANCE ONLY'
    prices=list(map(number,cells[-1][-9:]));assert len(prices)==9 and all(v>0 for v in prices)
    family_rows.append(dict(id=f'{product}_valance_{group.lower()}',productId=product,name='Valance only',priceGroup=group,widths=widths,sourceRetailPrices=prices,maxHeight=18,blackoutMultiplier=None,sourceFile=file,sourcePage=page,sourceTable=table,sourceId=meta['sourceId'],sourceSha256=meta['sha256'],effectiveDate=None))
 assert sorted(r['priceGroup'] for r in family_rows)==list('ABCDEF')
 rows.extend(family_rows)
(root/'src/lib/quote/sundance/valance-schedules.source.json').write_text(json.dumps(dict(observedOn='2026-09-20',rows=rows),indent=2)+'\n')
print({'schedules':len(rows),'retailCells':sum(len(row['sourceRetailPrices']) for row in rows)})
