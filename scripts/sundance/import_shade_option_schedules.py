"""Import each roller top-treatment and Europanel valance source table without merged-cell inference."""
import argparse,hashlib,json,re
from pathlib import Path
import pdfplumber
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];lock=json.loads((root/'scripts/sundance/sources.lock.json').read_text());rows=[]
for product,file,pages,kind in [
 ('sundance_roller','A-Sundance-Roller-Shades-11-25.pdf',list(range(6,25,2)),'roller'),
 ('sundance_louvolite_roller','D-Louvolite-Roller-Shades-11-25.pdf',[6,8,10,12],'roller'),
 ('sundance_europanels','C-Sundance-Europanels-V2.pdf',list(range(5,15)),'europanel'),
 ('sundance_louvolite_europanels','F-Louvolite-Europanels-V2.pdf',[5,6,7],'europanel')]:
 meta=next(m for m in lock if m['file']==file);path=a.source_dir/file
 assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
 with pdfplumber.open(path) as doc:
  for page in pages:
   tables=doc.pages[page-1].extract_tables()
   if not tables:
    assert file=='C-Sundance-Europanels-V2.pdf',(file,page)
    lines=doc.pages[page-1].extract_text().split('Rounded Corner Valance\n')[1].splitlines()
    tables=[None,[lines[0].split(),lines[1].split()]]
   table=tables[-1]
   widths=[int(re.sub(r'[^0-9]','',v)) for v in table[0][1 if kind=='roller' else 0:]]
   assert widths==sorted(set(widths))
   program_ids=[f'{product}_p{page}_t{i+1}' for i in range(len(tables)-1)]
   assert len(program_ids) in [1,2]
   option_rows=table[1:] if kind=='roller' else [['Rounded Corner Valance',*table[1]]]
   assert len(option_rows)==(9 if kind=='roller' else 1)
   for row in option_rows:
    label=re.sub(r'\s+',' ',row[0]).replace('**','').strip();values=[]
    for value in row[1:]:
     if value is None or value.strip() in ['N/A','']:values.append(None)
     else:
      assert re.fullmatch(r'\d+',value),value
      values.append(int(value))
    assert len(values)==len(widths)
    rows.append(dict(id=f'{product}_p{page}_'+re.sub('[^a-z0-9]+','_',label.lower()).strip('_'),productId=product,programIds=program_ids,name=label,widths=widths,retail=values,sourceFile=file,sourcePage=page,sourceTable=len(tables),sourceId=meta['sourceId'],sourceSha256=meta['sha256'],effectiveDate='2025-11-01' if kind=='roller' else '2024-08-01',axisException='Printed 162-inch column differs from base grid 168 inches; confirm valance width band.' if kind=='europanel' and 162 in widths and product.endswith('louvolite_europanels') else None))
assert len(rows)==139
(root/'src/lib/quote/sundance/shade-option-schedules.source.json').write_text(json.dumps({'rows':rows},indent=2)+'\n')
print({'tables':len(rows),'numericCells':sum(v is not None for r in rows for v in r['retail']),'unavailableCells':sum(v is None for r in rows for v in r['retail'])})
