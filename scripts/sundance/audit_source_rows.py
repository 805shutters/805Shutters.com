"""Independent text-layer audit of every imported Sundance base grid.

Table bounding boxes locate the published grid; values are read from text lines,
never importer functions or extracted table cells. Non-numeric availability
geometry requires the separate visual golden fixtures and engine boundary tests.
"""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
parser=argparse.ArgumentParser()
parser.add_argument("--source-dir",type=Path,required=True)
parser.add_argument("--output",type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
cat=json.loads((root/'src/lib/quote/catalog/sundance.catalog.json').read_text())
sources={s['sourceId']:s for s in json.loads((root/'scripts/sundance/sources.lock.json').read_text())}
source_dir=args.source_dir
for source in sources.values():
 assert hashlib.sha256((source_dir/source["file"]).read_bytes()).hexdigest()==source["sha256"],source["file"]
docs={k:pdfplumber.open(source_dir/s['file']) for k,s in sources.items()}
results=[]
for p in cat['products']:
 for program in p['programs']:
  pg=docs[program['sourceId']].pages[program['sourcePages'][0]-1]; ts=pg.find_tables();table_index=int(program['id'].rsplit('_t',1)[1])-1
  region=pg.crop(ts[table_index].bbox) if ts else pg
  # Independent text-layer reading: do not use importer or extracted table cells.
  upright=region.filter(lambda obj:abs(obj.get('matrix',(1,0))[0])>=abs(obj.get('matrix',(1,0))[1]))
  text=upright.extract_text() or ''
  observed=[]; header_candidates=[]
  for line in text.splitlines():
   if line.startswith('Prices subject') or 'VALANCE ONLY' in line:break
   line=re.sub(r'\[\d+\]', '', line)
   if not observed:
    header=re.sub(r'PRICE GROUP \w+|Price Group \w+', '', line)
    header=header.replace('”','').replace(chr(34),'').replace('`','')
    header=re.sub(r'(\d+)\s*[–—-]\s*(\d+)', r'\2', header)
    header_numbers=[float(v) for v in re.findall(r'(?<![\w.])\d+(?:\.\d+)?(?![\w.])',header)]
    if len(header_numbers)>=4 and header_numbers==sorted(set(header_numbers)) and max(header_numbers)<=240:header_candidates.append(header_numbers)
   line=re.sub(r'^(?:[^0-9]+)(?=\d)', '', line)
   line=re.sub(r'(\d+)\s*½', r'\1.5', line)
   line=line.replace('"','').replace('”','').replace('$','').replace(',','')
   tokens=line.split()
   if len(tokens)<5 or not re.fullmatch(r'\d+(?:\.\d+)?',tokens[0]):continue
   if not all(re.fullmatch(r'\d+(?:\.\d+)?|N/A|NA|—|-',t) for t in tokens):continue
   vals=[float(t) for t in tokens if re.fullmatch(r'\d+(?:\.\d+)?',t)]
   # Monetary values exceed the 240-inch axis ceiling in these source tables.
   if len(vals)<4 or max(vals[1:])<=240:continue
   if program['id'].startswith('sundance_vertical_essence_'):vals=vals[:-1] # source's final Vanes column is not a price
   observed.append((vals[0],vals[1:]))
  grid=program['grid'];expected=[(h,[v for v in row if v is not None]) for h,row in zip(grid['heights'],grid['prices'])]
  result={'id':program['id'],'sourceFile':sources[program['sourceId']]['file'],'page':program['sourcePages'][0],
    'sourceTextRows':len(observed),'catalogRows':len(expected),'widths':grid['widths'],'heights':grid['heights'],
    'axesInInchesRange':all(0<v<=240 for v in grid['widths']+grid['heights']),
    'sourceWidthsExactlyMatch':grid['widths'] in header_candidates,'sourceWidthCandidates':header_candidates,'sourceRowsExactlyMatch':observed==expected,'sourceFirstRow':observed[0] if observed else None,'sourceLastRow':observed[-1] if observed else None}
  if observed!=expected:result['sourceRows']=observed;result['catalogRowsData']=expected;result['sourceText']=text
  results.append(result)
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'programs':len(results),'exactTextRowMatches':sum(r['sourceRowsExactlyMatch'] for r in results),'widthMismatches':[r['id'] for r in results if not r['sourceWidthsExactlyMatch']],'badAxes':[r['id'] for r in results if not r['axesInInchesRange']],'exceptions':[{k:r[k] for k in ['id','sourceTextRows','catalogRows']} for r in results if not r['sourceRowsExactlyMatch']]},indent=2))
for d in docs.values():d.close()

assert all(r["sourceRowsExactlyMatch"] and r["sourceWidthsExactlyMatch"] and r["axesInInchesRange"] for r in results), "Source grid differs from imported catalog"
