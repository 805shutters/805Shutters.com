"""Classify exact Zip dealer fabrics against the explicit exterior net-rate sheet."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];file='Sundance-Exterior-Shade-System-Price-List-Aug-2025-1.pdf';path=a.source_dir/file
meta=next(r for r in json.loads((root/'scripts/sundance/sources.lock.json').read_text()) if r['file']==file)
assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
with pdfplumber.open(path) as d: text=d.pages[0].extract_text()
assert 'Standard Fabrics $20.00 (net) per sq ft * $22.00 (net) per sq ft *' in text
assert 'Premium Fabrics $22.00 (net) per sq ft * $24.00 (net) per sq ft *' in text
labels=next(r['labels'] for r in json.loads((a.portal_dir/'additional-portal-menus.json').read_text())['families'] if r['family']=='Zipper Screen Exterior')
rows=[]
for label in labels:
 if label.startswith('OMEGA PRO '):m=re.match(r'OMEGA PRO (3|5|10)%',label);tier='Standard'
 elif label.startswith('ZACHARO'):m=re.search(r'(6|15|25)%',label);tier='Standard'
 elif label.startswith('PROSHIELD '):m=re.match(r'PROSHIELD (4)%',label);tier='Premium'
 elif label.startswith('SOLARVIEW ELITE '):m=re.match(r'SOLARVIEW ELITE (14)%',label);tier='Premium'
 else:raise AssertionError(label)
 assert m,label
 rows.append(dict(id='sundance_exterior_zip:dealer:'+hashlib.sha256(label.encode()).hexdigest()[:12],portalLabel=label,priceClass=tier,openness=m[1]+'%',sourceNetPerSquareFoot=22 if tier=='Standard' else 24,sourceFile=file,sourcePage=1,sourceId=meta['sourceId'],sourceSha256=meta['sha256']))
assert len(rows)==57 and len({r['id'] for r in rows})==57
result=dict(observedOn='2026-09-20',edition='August 2025 published filename',effectiveDate=None,rows=rows,maxWidth=220,maxHeight=110,priceBasis='net_per_square_foot_excluding_motor',unresolved=['Account applicability and current effective date','Square-foot rounding, minimum charge, freight and surcharges','Complete motor/power/control compatibility','No equivalence asserted between the separate cable/zip brochures TSL/SC codes and current named fabrics'])
(root/'src/lib/quote/sundance/exterior-zip.source.json').write_text(json.dumps(result,indent=2)+'\n')
print({'rows':len(rows),'standard':sum(r['priceClass']=='Standard' for r in rows),'premium':sum(r['priceClass']=='Premium' for r in rows)})
