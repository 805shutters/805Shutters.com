# Run with bundled Python/pdfplumber: python3 scripts/extract-norman-roller-fabric-widths.py <exact-source.pdf>
import pdfplumber,re,json,hashlib,csv,pathlib,sys
src=pathlib.Path(sys.argv[1])
rows=[]
with pdfplumber.open(src) as d:
 for n in range(6,19):
  tables=[t for t in d.pages[n-1].extract_tables() if len(t[0])==8 and any('Fabric\nWidth'==c for c in t[0])]
  assert len(tables)==1,(n,len(tables))
  t=tables[0];wi=t[0].index('Fabric\nWidth');width=None;collection=None
  for row in t[2:]:
   if row[0]:collection=row[0].replace('\n',' ').replace('√','').strip()
   if row[wi]:
    val=re.search(r'\d+(?:\.\d+)?',row[wi]);assert val,(n,row);width=float(val[0])
   if not row[1]:continue
   code=row[1].strip();assert re.fullmatch(r'F\d{4}',code),(n,row)
   assert width and collection,(n,row)
   rows.append({'colorCode':code,'collection':collection,'colorName':row[2].replace('\n',' '),'fabricWidthInches':width,'sourcePage':n})
assert len(set(r['colorCode']for r in rows))==len(rows)
out=pathlib.Path('outputs/norman-roller-fabric-widths-20260920')
data={'source':'Roller Shade Guide 2026-09-16.pdf','sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'definitionPage':5,'effectiveDate':'2026-09-16','rows':rows}
(out/'source-widths.json').write_text(json.dumps(data,indent=2)+'\n')
with (out/'source-widths.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
pathlib.Path('src/lib/quote/norman-roller-fabric-widths.generated.ts').write_text('// Source: Roller Shade Guide 2026-09-16, fabric tables pp6–18; definition p5.\n// Exact merged table cells; no collection fallback. Source SHA256 '+data['sha256']+'\nexport const normanRollerFabricWidths = '+json.dumps(rows,indent=2)+' as const;\n')
print('Source rows',len(rows));print('Widths',sorted(set(r['fabricWidthInches']for r in rows)))
for c in ['F0668','F1668','F1669','F1926','F1927','F0739','F0743','F0751','F2170','F2221']:print(next(r for r in rows if r['colorCode']==c))
