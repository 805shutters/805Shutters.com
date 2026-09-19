"""Normalize exact stacking tables; source hashes prevent silent source drift."""
import argparse, hashlib, json, re
from pathlib import Path
from fractions import Fraction
from pypdf import PdfReader
p=argparse.ArgumentParser();p.add_argument('pdf');args=p.parse_args()
raw=Path(args.pdf).read_bytes();assert hashlib.sha256(raw).hexdigest()=='3d00375007c3afb0d8e1cf0e75a51f2395d27dace067074f01033b72f70461a3'
reader=PdfReader(args.pdf)
def inches(text):
 text=text.strip().replace('*','').strip()
 # The PDF joins these whole and fraction glyphs; preserve exact printed values.
 text={'615/16':'6 15/16','1815/16':'18 15/16','2215/16':'22 15/16','2113/16':'21 13/16'}.get(text,text)
 return float(sum(Fraction(x) for x in text.split()))
out={}
for kind,pages,count in [('manual',[9,10],68),('motor',[11,12],68),('paired',[13,14],68),('center_opening',[15,16],42)]:
 rows=[]
 for page in pages:
  for line in reader.pages[page-1].extract_text().splitlines():
   line=line.replace('“','"').replace('”','"').strip()
   if not re.match(r'^\d+ \d+.*"',line):continue
   parts=line.split('"'); first=re.fullmatch(r'(\d+) (.+)',parts.pop(0));number=int(first[1]);low=inches(first[2]);high=low
   if 'R' in parts[0]:high=inches(parts.pop(0).split('≦')[-1])
   vane_stack=parts.pop(0).strip().lstrip('*').strip();m=re.fullmatch(r'(\d+) (.+)',vane_stack);assert m,(page,line)
   stack=inches(m[2]);center=inches(parts.pop(0)) if kind!='center_opening' else None
   rows.append({'row':number,'min':low,'max':high,'minInclusive':number==1,'vaneCount':int(m[1]),'stackWidth':stack,'centerStackWidth':center,'page':page})
 assert len(rows)==count,(kind,len(rows));assert [r['row'] for r in rows]==list(range(1,count+1))
 assert all(rows[i]['min']==rows[i-1]['max'] for i in range(1,count))
 out[kind]=rows
path=Path(__file__).resolve().parents[1]/'src/lib/quote-v2/generated/norman-smartdrape-tracks.generated.ts'
path.write_text('// Generated from PS-SD Guide PDF pages 9–16; source SHA-256 3d00375007c3afb0d8e1cf0e75a51f2395d27dace067074f01033b72f70461a3.\nexport const SMARTDRAPE_TRACK_ROWS = '+json.dumps(out,indent=2)+' as const;\n')
print({k:len(v) for k,v in out.items()})
