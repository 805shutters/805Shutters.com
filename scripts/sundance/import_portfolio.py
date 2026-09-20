"""Extract every Portfolio material code, style restriction and exact dealer match."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];file='Sundance-Portfolio-Roman-Shade-Product-Price-Guide-2026.pdf';path=a.source_dir/file
meta=next(r for r in json.loads((root/'scripts/sundance/sources.lock.json').read_text()) if r['file']==file)
assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
labels=next(r['options'] for r in json.loads((a.portal_dir/'portal-fabric-inventory.json').read_text()) if r['family']=='Portfolio Soft Roman')
def norm(x):return re.sub(r'[^A-Z0-9]','',x.upper())
rows=[]
with pdfplumber.open(path) as doc:
 for pg in [3,4,5]:
  for cells in doc.pages[pg-1].extract_tables()[0][2:]:
   raw,pattern,color,group,composition,weight,cord,tdbu,width,repeatw,repeath=cells
   assert re.fullmatch(r'[A-Z]{3}\d\dR?(?:\[[12]\])?',raw),(pg,cells)
   code=raw.split('[')[0];matches=[label for label in labels if norm(label.split('(')[0])==norm(pattern+' '+color)]
   styles=['Flat','Knife Pleat','Hobbled','Front Slat']
   if '[1]' in raw:styles.remove('Flat')
   if '[2]' in raw:styles.remove('Hobbled')
   i='ABCD'.index(group)
   rows.append(dict(code=code,pattern=pattern,color=color,priceGroup=group,styles=styles,tdbuAvailable=tdbu=='Y',cordLoopColor=cord,fabricWidth=width,composition=composition,fabricWeight=weight,repeatWidth=repeatw,repeatHeight=repeath,programFlatKnife=f'sundance_portfolio_roman_p{21+i//2}_t{1+i%2}',programHobbledFront=f'sundance_portfolio_roman_p{23+i//2}_t{1+i%2}',portalLabels=matches,portalStatus='matched_name' if matches else 'current_guide_only',sourceFile=file,sourcePage=pg,sourceId=meta['sourceId'],sourceSha256=meta['sha256']))
assert len(rows)==102 and len({r['code'] for r in rows})==102
matched={l for r in rows for l in r['portalLabels']}
result=dict(observedOn='2026-09-20',edition='2026 Product Guide',effectiveDate=None,effectiveDateEvidence='No exact effective date printed on materials reference pages.',rows=rows,unmatchedPortalLabels=[l for l in labels if l not in matched])
(root/'src/lib/quote/sundance/portfolio-assortment.source.json').write_text(json.dumps(result,indent=2)+'\n')
print({'sourceRows':len(rows),'matched':sum(bool(r['portalLabels']) for r in rows),'sourceOnly':[r['code'] for r in rows if not r['portalLabels']],'portalOnly':result['unmatchedPortalLabels'],'validStyleRoutes':sum(len(r['styles']) for r in rows)})
