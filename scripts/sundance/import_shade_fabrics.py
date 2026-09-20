"""Extract each shade-family index and reconcile only unambiguous dealer labels."""
import argparse, hashlib, json, re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];lock=json.loads((root/'scripts/sundance/sources.lock.json').read_text())
catalog=json.loads((root/'src/lib/quote/catalog/sundance.catalog.json').read_text())
menus={r['family']:r['options'] for r in json.loads((a.portal_dir/'portal-fabric-inventory.json').read_text())}
menus.update({r['family']:r['labels'] for r in json.loads((a.portal_dir/'additional-portal-menus.json').read_text())['families']})
specs=[
 ('sundance_roller','A-Sundance-Roller-Shades-11-25.pdf',[3,4],['Clutch Roller','Motorized Roller'],'2025-11-01'),
 ('sundance_flat_roman','Sundance-Product_Price-Guide-2026.pdf',[39,40],[],'2024-08-01'),
 ('sundance_europanels','C-Sundance-Europanels-V2.pdf',[3,4],['Euro Panel'],'2024-08-01'),
 ('sundance_louvolite_roller','D-Louvolite-Roller-Shades-11-25.pdf',[3,4],['Clutch Roller','Motorized Roller'],'2025-11-01'),
 ('sundance_louvolite_flat_roman','Sundance-Product_Price-Guide-2026.pdf',[97,98],[],'2024-08-01'),
 ('sundance_louvolite_europanels','F-Louvolite-Europanels-V2.pdf',[3,4],['Euro Panel'],'2024-08-01')]
collections=[];colors=[];exceptions=[]
def plain(s):return re.sub(r'[^A-Z0-9]','',s.upper())
def stem_name(name):
 name=re.sub(r'\([^)]*\)','',name)
 name=re.sub(r'\b(?:BLACKOUT|LIGHT[- ]FILTERING|SCREEN|SHEER|PRIVACY|FR)\b','',name.upper())
 return name.strip()
def base(name):return plain(stem_name(name))
def starts_collection(label, name):
 stem=base(name)
 # A one-letter screen collection must never capture every S/M-prefixed fabric.
 if len(stem)==1:return bool(re.match(r'^'+stem+r'\s+SCREEN\b',label))
 words=re.findall(r'[A-Z0-9]+',stem_name(name))
 return bool(re.match(r'^'+r'[\W_]*'.join(words)+r'(?=[^A-Z0-9]|BLACKOUT|B/O|L/F|LIGHT|$)',label))
def opacity(label):
 if re.search(r'B/O|BLACKOUT',label):return 'Blackout'
 if re.search(r'L/F|L\.? FILTER|LIGHT FILTER',label):return 'Light Filtering'
 if 'SHEER' in label:return 'Sheer'
 return None

for product,file,pages,portal_families,date in specs:
 meta=next(r for r in lock if r['file']==file);path=a.source_dir/file
 assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
 programs=next(r['programs'] for r in catalog['products'] if r['id']==product)
 with pdfplumber.open(path) as doc:
  groups={}
  for program in programs:
   pg=int(re.search(r'_p(\d+)_t',program['id'])[1]);index=int(re.search(r'_t(\d+)$',program['id'])[1])-1
   tables=doc.pages[pg-1].find_tables()
   if tables:
    table=tables[index];b=table.bbox
    heading=doc.pages[pg-1].crop((b[0],max(0,b[1]-65),b[2],b[1]+5)).extract_text() or ''
   else:
    # Two Europanel pages use text-drawn grids; the page has one group only.
    heading=doc.pages[pg-1].extract_text() or ''
   group=re.findall(r'Price Group ([A-E]|10|[1-9])\b',heading,re.I)
   assert group,(product,program['id'],heading)
   groups[group[-1]]=program['id']
  current=[]
  for pg in pages:
   for table in doc.pages[pg-1].extract_tables():
    if table[0][0]!='Fabric Name':continue
    for cells in table[1:]:
     name,group,privacy=cells[:3]
     width,railroad=cells[-2:];opening=cells[3] if len(cells)==6 else None
     assert group in groups,(product,name,group)
     row=dict(id=f'{product}:collection:{hashlib.sha256(name.encode()).hexdigest()[:12]}',productId=product,name=name,priceGroup=group,privacyType=privacy.replace('\n',' '),openness=opening,fabricWidth=width,railroaded=railroad=='Yes',programId=groups[group],sourceFile=file,sourcePage=pg,sourceId=meta['sourceId'],sourceSha256=meta['sha256'],effectiveDate=date)
     current.append(row);collections.append(row)
  # Shared menu labels may only map within this family's own source index.
  labels=sorted(set(label for family in portal_families for label in menus[family]))
  for label in labels:
   matched=[r for r in current if starts_collection(label,r['name'])]
   if not matched:continue
   longest=max(len(base(r['name'])) for r in matched);matched=[r for r in matched if len(base(r['name']))==longest]
   privacy=opacity(label)
   if privacy:matched=[r for r in matched if r['privacyType']==privacy]
   # Explicit screen openness is necessary when the collection spans groups.
   pct=re.findall(r'(\d+)%',label)
   if pct:matched=[r for r in matched if not r['openness'] or any(v+'%' in r['openness'] for v in pct)]
   if any('FR MORELLE' in r['name'].upper() for r in matched):
    is_fr='RETARDANT' in label or label.startswith('FR ')
    if is_fr:matched=[r for r in matched if r['name'].upper().startswith('FR ')]
   if len(matched)!=1:
    exceptions.append(dict(productId=product,portalLabel=label,reason='privacy/openness/collection ambiguous or conflicts with source',candidateCollectionIds=[r['id'] for r in matched]));continue
   row=matched[0]
   terminal_width=re.search(r'-(\d{2,3})$',label) if 'louvolite' in product else None
   if terminal_width and terminal_width[1] not in re.findall(r'\d+',row['fabricWidth']):
    exceptions.append(dict(productId=product,portalLabel=label,reason=f'portal fabric width {terminal_width[1]} differs from source {row["fabricWidth"]}',candidateCollectionIds=[row['id']]));continue
   colors.append(dict(id=f'{product}:dealer:{hashlib.sha256(label.encode()).hexdigest()[:12]}',productId=product,collectionId=row['id'],portalLabel=label,portalFamilies=[f for f in portal_families if label in menus[f]],programId=row['programId']))

assert len({r['id'] for r in collections})==len(collections)
assert len({r['id'] for r in colors})==len(colors)
result=dict(observedOn='2026-09-20',collections=collections,colors=colors,exceptions=exceptions,notes=['Dealer labels are preserved exactly; these are not invented manufacturer color codes.','Flat Roman has a source destination but no dedicated current dealer ordering type in the captured menus.','Collection matching does not authorize complete configurations or automatic pricing.'])
(root/'src/lib/quote/sundance/shade-fabrics.source.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({p:{'collections':sum(r['productId']==p for r in collections),'colors':sum(r['productId']==p for r in colors),'exceptions':sum(r['productId']==p for r in exceptions)} for p,*_ in specs},indent=2))
