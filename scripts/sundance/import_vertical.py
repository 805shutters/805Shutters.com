"""Reconcile the custom Vertical Essence color index separately from stock blinds."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];file='K-Vertical-Essence-V2.pdf';path=a.source_dir/file
meta=next(r for r in json.loads((root/'scripts/sundance/sources.lock.json').read_text()) if r['file']==file)
assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
labels=next(r['labels'] for r in json.loads((a.portal_dir/'additional-portal-menus.json').read_text())['families'] if r['family']=='Vertical Essence')
def norm(x):return re.sub(r'[^A-Z0-9]','',x.upper())
programs={g:f'sundance_vertical_essence_p{pg}_t1' for g,pg in zip(['1','1A','2','3','4','5','6'],range(4,11))}
rows=[];valances=[]
with pdfplumber.open(path) as doc:
 for pattern,colors,group in doc.pages[2].extract_tables()[0][1:]:
  if pattern=='Stock Verticals':continue
  assert group in programs
  for color in colors.split(', '):
   matches=sorted(set(label for label in labels if norm(label.split('/')[0])==norm(pattern+' '+color)))
   rows.append(dict(id='sundance_vertical_essence:custom:'+hashlib.sha256((pattern+'|'+color).encode()).hexdigest()[:12],pattern=pattern,color=color,priceGroup=group,programId=programs[group],portalLabels=matches,portalStatus='matched_name' if matches else 'current_guide_only',sourceFile=file,sourcePage=3,sourceId=meta['sourceId'],sourceSha256=meta['sha256'],effectiveDate='2024-08-01'))
 for group,program in programs.items():
  pg=int(re.search(r'_p(\d+)_t',program)[1]);tables=doc.pages[pg-1].extract_tables()
  for idx,name in [(1,'Square'),(2,'Rounded')]:
   cells=tables[idx];assert len(cells)==2 and all(len(row)==25 for row in cells)
   widths=list(map(float,cells[0]));prices=list(map(float,cells[1]));assert widths==sorted(widths) and widths[0]==37 and widths[-1]==192
   valances.append(dict(id=f'sundance_vertical_essence_valance_p{pg}_t{idx+1}',name=name,programId=program,priceGroup=group,widths=widths,sourceRetailPrices=prices,sourceFile=file,sourcePage=pg,sourceTable=idx+1,sourceId=meta['sourceId'],sourceSha256=meta['sha256']))
matched={l for r in rows for l in r['portalLabels']}
result=dict(observedOn='2026-09-20',rows=rows,valances=valances,portalRawRowCount=len(labels),portalUniqueCount=len(set(labels)),unmatchedPortalLabels=sorted(set(labels)-matched),unassignedSourcePrograms=[p for p in programs.values() if not any(r['programId']==p for r in rows)])
(root/'src/lib/quote/sundance/vertical-assortment.source.json').write_text(json.dumps(result,indent=2)+'\n')
print({'rows':len(rows),'matched':sum(bool(r['portalLabels']) for r in rows),'sourceOnly':[r['pattern']+' '+r['color'] for r in rows if not r['portalLabels']],'portalRaw':len(labels),'portalUnique':len(set(labels)),'portalOnly':result['unmatchedPortalLabels'],'orphanPrograms':result['unassignedSourcePrograms']})
