"""Extract exact Walden material identities and independently locate their group grids."""
import argparse,hashlib,json,re,unicodedata
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);p.add_argument('--portal-inventory',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2]
lock=json.loads((root/'scripts/sundance/sources.lock.json').read_text())
labels=next(r['options'] for r in json.loads(a.portal_inventory.read_text()) if r['family']=='Wovenwood')
def normalize(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',re.sub(r'\([^)]*\)','',s)).encode('ascii','ignore').decode().upper()).strip()
rows=[];sources=[]
for family,date,count,price_pages in [('premier','10.01.25',47,[17,18,19]),('select','10.21.25',57,[17,18])]:
 file=f'Sundance-Walden-{family.title()}-2026A-updated-{date}.pdf';meta=next(s for s in lock if s['file']==file)
 assert hashlib.sha256((a.source_dir/file).read_bytes()).hexdigest()==meta['sha256']
 sources.append(meta)
 with pdfplumber.open(a.source_dir/file) as doc:
  groups={}
  for pg in price_pages:
   page=doc.pages[pg-1]
   for i,table in enumerate(page.find_tables(),1):
    b=table.bbox; text=page.crop((b[0],max(0,b[1]-60),b[2],b[3])).extract_text() or ''
    group=re.findall(r'PRICE GROUP ([A-F])',text)
    assert len(group)==1,(file,pg,i,group)
    groups[group[0]]=f'sundance_walden_{family}_p{pg}_t{i}'
  assert sorted(groups)==list('ABCDEF')
  family_rows=[]
  for pg in [3,4]:
   for row in doc.pages[pg-1].extract_tables()[0]:
    code=row[0] or ''
    if not code.startswith('E-' if family=='premier' else 'WS-'):continue
    name=re.sub(r'\[\d\]','',row[1]); matches=[label for label in labels if normalize(label)==normalize(name)]
    flags=re.findall(r'\[(\d)\]',row[1]); required=row[3]=='Y' if family=='premier' else '1' in flags
    entry={'id':f'sundance_walden_{family}:{code}','productId':f'sundance_walden_{family}','code':code,'name':name,'priceGroup':row[2],
      'programId':groups[row[2]],'sourceId':meta['sourceId'],'sourceFile':file,'sourcePage':pg,'sourceSha256':meta['sha256'],
      'edgeBindingRequired':required,'edgeBindingRecommended':'2' in flags,'edgeSealWithoutBinding':'3' in flags,
      'cordlessTdBu':row[4]=='Y' if family=='premier' else True,'coordinatedEdgeColor':row[5] if family=='premier' else row[4],
      'motorMaxSqftWithoutLiner':float(row[6]) if family=='premier' else None,'motorMaxSqftWithLiner':float(row[7]) if family=='premier' else None,
      'portalLabels':matches,'portalStatus':'exact_name_match' if len(matches)==1 else 'duplicate_name_exception' if matches else 'source_only_exception',
      'edgeBindingSourceConflict':any('A MUST' in label for label in matches) and not required}
    family_rows.append(entry)
  assert len(family_rows)==count,(family,len(family_rows))
  rows.extend(family_rows)
assert len({r['id'] for r in rows})==104
unmatched=[l for l in labels if not any(l in r['portalLabels'] for r in rows)]
result={'observedOn':'2026-09-20','source':'Pinned current Walden material indexes, PDF3-4; authenticated dealer Wovenwood menu','effectiveDate':None,'sources':sources,'rows':rows,'unmatchedPortalLabels':unmatched}
(root/'src/lib/quote/sundance/walden-assortment.source.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'rows':len(rows),'exact':sum(r['portalStatus']=='exact_name_match' for r in rows),'duplicate':sum(r['portalStatus']=='duplicate_name_exception' for r in rows),'sourceOnly':[(r['code'],r['name']) for r in rows if not r['portalLabels']],'unmatchedPortal':unmatched,'edgeConflicts':sum(r['edgeBindingSourceConflict'] for r in rows)},indent=2))
