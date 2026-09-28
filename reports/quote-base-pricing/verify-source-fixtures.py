"""Verify V2 golden cells against the pinned manufacturer PDF and its page text."""
import argparse, hashlib, json, re
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--source-pdf', type=Path, required=True)
parser.add_argument('--source-text', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
fixtures = json.loads((root/'src/lib/quote-v2/base-configuration.fixtures.json').read_text())
assert hashlib.sha256(args.source_pdf.read_bytes()).hexdigest() == fixtures['sourceSha256'], 'Source PDF hash changed'
book = args.source_text.read_text()
pages = {int(n): re.sub(r'[^0-9A-Za-z.]', '', body) for n, body in re.findall(r'--- PAGE (\d+) ---([\s\S]*?)(?=--- PAGE |$)', book)}
catalog = json.loads((root/'src/lib/quote/catalog/norman-2026.catalog.json').read_text())
programs = {p['id']: p for product in catalog['products'] for p in product['programs']}
for f in fixtures['fixtures']:
    grid = programs[f['programId']]['grid']
    x = next(i for i,w in enumerate(grid['widths']) if w >= f['width'])
    y = next(i for i,h in enumerate(grid['heights']) if h >= f['height'])
    assert (grid['widths'][x],grid['heights'][y],grid['prices'][y][x]) == (f['matchedWidth'],f['matchedHeight'],f['price']), f
    row = ''.join(str(v) if v is not None else 'NA' for v in grid['prices'][y])
    assert any(row in pages[p] for p in f['sourcePdfPages']), f
print(json.dumps({'verifiedSourceRows':len(fixtures['fixtures']), 'sourceSha256':fixtures['sourceSha256']}))
