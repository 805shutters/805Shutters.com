"""Rebuild held CRM destinations from immutable authenticated portal observations."""
import csv, hashlib, json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
src = root / 'docs/quote-v2/lotus-audit-20260920'
collections = json.loads((src / 'portal-stock-collections.json').read_text())
family = {
 '/collections/aluminum-blinds':'mini', '/collections/vinyl-blinds':'vinyl',
 '/collections/vinyl-plus':'vinyl', '/collections/2-vinyl-plus':'vinyl',
 '/collections/faux-wood-blinds':'faux', '/collections/roller-shades':'roller', '/collections/vertical-blinds':'vertical',
}
stock_family = {}
for url, group in collections.items():
 key = 'parts' if url.endswith('/parts') else 'mini' if '/amx-' in url else 'vinyl' if any('/'+x+'-' in url for x in ['mlx','rlx','rtx']) else 'roller' if '/rs-' in url else 'vertical' if '/vv-' in url else 'faux'
 for p in group['products']: stock_family[p['href']] = key
custom = json.loads((src/'portal-custom-collections.json').read_text())
labels = {r[2]: r[0] for group in custom.values() for r in group['rows']}
items=[]
for kind, file in [('custom','custom-listing-ledger.csv'),('stock','stock-variant-ledger.csv')]:
 for index,r in enumerate(csv.DictReader((src/file).open())):
  if kind=='custom':
   dest = 'mini' if 'aluminum' in r['collection'] else 'vinyl' if 'vinyl' in r['collection'] else 'roller' if 'roller' in r['collection'] else 'vertical' if 'vertical' in r['collection'] else 'faux'
   label = labels[r['url']]
  else:
   dest=stock_family[r['url']];label=r['title']+' — '+r['variant']
  identity=f"{kind}|{r['url']}|{r.get('variant','')}|{r['sku']}|{index}"
  items.append(dict(id='lotus_observed_'+hashlib.sha256(identity.encode()).hexdigest()[:20],
   productId='lotus_dealer_listed_'+dest,kind='parts' if dest=='parts' else kind,
   sku=r['sku'] or None,label=label,sourceUrl='https://www.lotusblind.com'+r['url'],
   observedDate='2026-09-20',effectiveDate=None,discontinued=r['status']=='discontinued',
   catalogProductIds=r['productIds'].split(';') if r['productIds'] else [],
   catalogProgramIds=r['programIds'].split(';') if r['programIds'] else [],
   exception=r['exception']))
assert len(items)==3710
assert len({r['id'] for r in items})==3710
out=root/'src/lib/quote/lotus-observed-offerings-20260920.json'
out.write_text(json.dumps(items,ensure_ascii=False,separators=(',',':'))+'\n')
print(out,hashlib.sha256(out.read_bytes()).hexdigest())

with (src/'offering-destinations.csv').open('w',newline='') as handle:
 writer=csv.DictWriter(handle,fieldnames=['id','productId','programId','kind','sku','label','sourceUrl','observedDate','effectiveDate','status','exception'])
 writer.writeheader()
 for row in items:
  writer.writerow({key:row.get(key) for key in ['id','productId','kind','sku','label','sourceUrl','observedDate','effectiveDate','exception']} | {'programId':row['productId']+'_item','status':'discontinued' if row['discontinued'] else 'unresolved_exception'})
