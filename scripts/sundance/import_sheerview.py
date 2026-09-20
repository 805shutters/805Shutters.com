"""Preserve all current SheerView guide codes and exact dealer-menu discrepancies."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];file='H-Sheerview-Pricing_Aug2026.pdf';path=a.source_dir/file
meta=next(r for r in json.loads((root/'scripts/sundance/sources.lock.json').read_text()) if r['file']==file)
assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
menus=json.loads((a.portal_dir/'additional-portal-menus.json').read_text())['families'];labels=next(r['labels'] for r in menus if r['family']=='SheerView Plus')
programs={str(i+1):f'sundance_sheerview_p{22+i//2}_t{1+i%2}' for i in range(6)}
rows=[]
with pdfplumber.open(path) as doc:
 for pg in [19,20,21]:
  for line in doc.pages[pg-1].extract_text().splitlines():
   m=re.fullmatch(r'(.+?) (S\d\d[A-Z]{2}\d{3}(?:-\d|D)?) (2(?:\.5)?|3)" (Light Filtering|Room Darkening) Sheer Shade(?:\s*-\s*(.+?))? ([1-6])',line)
   if not m:continue
   name,code,size,privacy,collection,group=m.groups();matches=[label for label in labels if label.endswith('-'+code)]
   rows.append(dict(id='sundance_sheerview:'+code,code=code,name=name,vaneSize=size,privacy=privacy,collection=collection or 'Standard',priceGroup=group,programId=programs[group],portalLabels=matches,portalStatus='matched_code' if matches else 'current_guide_only',sourceFile=file,sourcePage=pg,sourceId=meta['sourceId'],sourceSha256=meta['sha256']))
assert len(rows)==105 and len({r['code'] for r in rows})==105
codes={r['code'] for r in rows};unmatched=[label for label in labels if label.rsplit('-',1)[-1] not in codes]
result=dict(observedOn='2026-09-20',edition='2026 guide; August 2026 published filename',effectiveDate=None,effectiveDateEvidence='No explicit effective day printed on the fabric-list pages; publication month is not substituted for an effective date.',rows=rows,unmatchedPortalLabels=unmatched)
(root/'src/lib/quote/sundance/sheerview-assortment.source.json').write_text(json.dumps(result,indent=2)+'\n')
print({'sourceRows':len(rows),'dealerMatched':sum(bool(r['portalLabels']) for r in rows),'sourceOnly':sum(not r['portalLabels'] for r in rows),'portalOnly':unmatched})
