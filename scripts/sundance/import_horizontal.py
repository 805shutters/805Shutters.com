"""Reconcile exact horizontal color codes, keeping legacy dealer-only rows explicit."""
import argparse, hashlib, json, re
from pathlib import Path
import pdfplumber

p = argparse.ArgumentParser()
p.add_argument('--source-dir', type=Path, required=True)
p.add_argument('--portal-inventory', type=Path, required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[2]
file = 'J-Sundance-Horizontal-Blinds-12-25.pdf'
meta = next(s for s in json.loads((root / 'scripts/sundance/sources.lock.json').read_text()) if s['file'] == file)
assert hashlib.sha256((a.source_dir / file).read_bytes()).hexdigest() == meta['sha256']
menus = {r['family']: r['labels'] for r in json.loads(a.portal_inventory.read_text())['families']}
rows = []

def portal_code(label):
    # 8-014 is the dealer's visible representation of source 8014. Preserve both.
    if re.match(r'^8-\d{3}\b', label): return '8' + label[2:5]
    match = re.match(r'^(FS(?:25|X)?-\d+|\d+)(?:\s*-|\s)', label)
    return match.group(1) if match else None

def add(product, pg, name, code, size, program, family, variant='', surcharge=0):
    clean_name = name.replace('*', '').replace('†', '').strip()
    labels = [label for label in menus.get(family, []) if portal_code(label) == code]
    # These two guide codes occur as exact name-only choices in this dealer menu.
    if product == 'sundance_advantage_ii_2' and code in ['904-301', '904-101']:
        labels = [label for label in menus[family] if label == f'2 ADV. {clean_name.upper()}.']
    row = dict(id=f'{product}:{size}:{code}', productId=product, code=code, name=clean_name,
        slatSize=size, variant=variant, programId=program, sourcePage=pg, sourceFile=file,
        sourceId=meta['sourceId'], sourceSha256=meta['sha256'], effectiveDate='2025-12-01',
        retailSurchargePercent=surcharge, crownOnly='†' in name,
        flatValanceAvailable=('*' in name if 'premium_ii' in product else '†' not in name),
        trapezoidBottomrail=('*' in name if 'advantage_ii' in product else 'premium_ii' in product),
        portalFamily=family, portalLabels=labels,
        portalStatus='code_match' if labels else 'source_only_exception',
        nameConflict=product == 'sundance_aluminum_2' and code == '2189')
    rows.append(row)

with pdfplumber.open(a.source_dir / file) as doc:
    for pg, product, size, family in [
        (3,'sundance_advantage_ii_2','2','2-inch Advantage'),
        (4,'sundance_advantage_ii_2_5','2.5','2.5-inch Advantage'),
        (5,'sundance_premium_ii_2','2','2-inch Wood'),
        (6,'sundance_premium_ii_2_5','2.5','2.5-inch Wood'),
        (8,'sundance_aluminum_2','2','2-inch Aluminum'),
        (9,'sundance_aluminum_1','1','1-inch Aluminum'),
        (10,'sundance_aluminum_1','1','1-inch Aluminum')]:
        for table in doc.pages[pg-1].extract_tables():
            if table[0][0] != 'Color Name': continue
            for name, code in table[1:]:
                variant = '8-Gauge' if pg == 8 or (pg == 9 and len(code) == 4) else '6-Gauge' if pg in [9,10] else ''
                pct = 5 if pg == 3 and '*' in name else 20 if pg == 9 and len(code) == 4 else 45 if pg == 10 and code in ['754','755'] else 15 if pg == 10 else 0
                if pg == 10: variant += ' Alumiwood' if code in ['754','755'] else ' Metallix / Jewel'
                add(product,pg,name,code,size,f'{product}_p{9 if pg == 10 else pg}_t1',family,variant,pct)
    for table in doc.pages[16].extract_tables():
        if table[0][0] != 'Style Name': continue
        for name, code in table[1:]:
            for size, index in [('2',1),('2.5',2)]:
                add('sundance_chateau_woods',17,name,code,size,f'sundance_chateau_woods_p16_t{index}',f'{size}-inch Wood','Chateau finish')
    assert 'Available in White only' in doc.pages[12].extract_text()
    add('sundance_basicvue',13,'White','White','2','sundance_basicvue_p13_t1','BasicVue')

assert len(rows) == 136, len(rows)
assert len({row['id'] for row in rows}) == len(rows)
unmatched = [{'family':family,'label':label} for family in ['1-inch Aluminum','2-inch Aluminum','2-inch Advantage','2.5-inch Advantage','2-inch Wood','2.5-inch Wood'] for label in menus[family] if not any(label in row['portalLabels'] and row['portalFamily'] == family for row in rows)]
result = dict(observedOn='2026-09-20', source=meta, effectiveDate='2025-12-01', rows=rows, unmatchedPortalLabels=unmatched,
    exceptions=['BasicVue and Chateau have no dedicated type in the captured dealer picker; guide identities retained pending dealer availability confirmation.',
    'Premium II 2.5-inch grid includes 92-inch height but J-7 specifications cap 2.5-inch at 84; enforce the conservative specification until reconciled.',
    '2-inch Aluminum code 2189 is Arctic Ice in the guide and ARTIC WHITE in the dealer menu. Exact code preserved with a visible name-conflict warning.'])
(root / 'src/lib/quote/sundance/horizontal-assortment.source.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(rows=len(rows), matched=sum(bool(r['portalLabels']) for r in rows), sourceOnly=sum(not r['portalLabels'] for r in rows), unmatchedPortal=len(unmatched)),indent=2))
