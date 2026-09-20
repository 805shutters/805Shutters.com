"""Read both Zebra source indexes and reconcile exact captured dealer identities."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];file='G-Zebra-Shades-V2.pdf';path=a.source_dir/file
meta=next(r for r in json.loads((root/'scripts/sundance/sources.lock.json').read_text()) if r['file']==file)
assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
menus=json.loads((a.portal_dir/'additional-portal-menus.json').read_text())['families'];labels=next(r['labels'] for r in menus if r['family']=='Caress-Zebra')
collections=[];colors=[];exceptions=[]
with pdfplumber.open(path) as doc:
 for line in doc.pages[2].extract_text().splitlines():
  m=re.fullmatch(r'(.+?) (Sundance Caress Zebra|Louvolite™ Visions Zebra) (Light-Filtering|Room Darkening) ([1-8]) (\d+)" ([\d.]+)"',line)
  if not m:continue
  name,brand,privacy,group,width,band=m.groups();product='sundance_zebra' if brand.startswith('Sundance') else 'sundance_louvolite_zebra';g=int(group)
  program=f'{product}_p{5+(g-1)//2}_t{1+(g-1)%2}'
  collections.append(dict(id=f'{product}:collection:{hashlib.sha256(name.encode()).hexdigest()[:12]}',productId=product,name=name,priceGroup=group,privacyType=privacy.replace('Light-Filtering','Light Filtering'),openness=None,fabricWidth=width+'"',bandSize=band+'"',railroaded=None,programId=program,sourceFile=file,sourcePage=3,sourceId=meta['sourceId'],sourceSha256=meta['sha256'],effectiveDate='2024-08-01'))
assert len(collections)==38
for label in labels:
 matches=[r for r in collections if re.match('^'+re.escape(r['name'].upper())+r'(?:[^A-Z]|$)',label)]
 if matches:
  longest=max(len(r['name']) for r in matches);matches=[r for r in matches if len(r['name'])==longest]
 if len(matches)!=1:
  exceptions.append(dict(portalLabel=label,reason='No unambiguous source collection',candidateCollectionIds=[r['id'] for r in matches]));continue
 row=matches[0]
 colors.append(dict(id=f'{row["productId"]}:dealer:{hashlib.sha256(label.encode()).hexdigest()[:12]}',productId=row['productId'],collectionId=row['id'],portalLabel=label,portalFamilies=['Caress-Zebra'],programId=row['programId']))
assert len(colors)+len(exceptions)==77
result=dict(observedOn='2026-09-20',collections=collections,colors=colors,exceptions=exceptions,notes=['All source patterns retained; exact colors exist only where the dealer menu supplies them.','Capri Black & Navy is group 6; other Capri is group 5. No Capri dealer colors were captured.','Orlando Blackout group 4 must never map to Orlando Light Filtering group 2.','August 1 2024 effective date is printed on page 3; the cover separately says October 2024 update.'])
(root/'src/lib/quote/sundance/zebra-fabrics.source.json').write_text(json.dumps(result,indent=2)+'\n')
print({'collections':len(collections),'colors':len(colors),'exceptions':exceptions,'sourceOnlyCollections':[r['name'] for r in collections if not any(c['collectionId']==r['id'] for c in colors)]})
