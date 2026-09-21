import csv,json,re
from pathlib import Path
root=Path(__file__).parent
data=json.loads((root/'current-catalog.json').read_text())
pages=json.loads((root/'source-text/2026Sep Retail Price Guide.json').read_text())
def norm(s):return re.sub(r'\s+',' ',s.replace(',','')).strip()
texts={p['page']:norm(p['text']) for p in pages}
exceptions={
'norman_contract_faux_wood':'Ten active slat/finish combinations mapped, two 6018 identities discontinued. Project base/valance/hardware/freight pricing missing; manual-quote gate retained.',
'norman_contract_vertical':'Three colors mapped; order-wide minimum 50. Fully-inside depth conflicts between source table and drawing. Project pricing and optional charges missing; manual-quote gate retained.',
'san_clemente_honeycomb':'Active G2 dealer offering added: HG006/HG006BO, ten colors, two cordless lifts. Current base/TDBU/accessory price schedule missing; manual-price gate retained.',
'san_clemente_faux_wood':'Active dealer offering added: B5W20, White 6008, 2-inch cordless left-wand. Current base/hardware price schedule missing; manual-price gate retained.',
}
# Read the maintained family exception ledger so exports cannot resurrect superseded blockers.
family_ids={'Honeycomb':'honeycomb','Vertical Honeycomb':'vertical_honeycomb','Roller':'roller','Roman':'roman','SmartFold':'smartfold','PerfectSheer':'perfectsheer','SmartDrape':'smartdrape','CityLights':'citylights_aluminum','Wood Blinds':'wood_blinds','Ultimate Faux Wood':'faux_wood','SmartPrivacy Faux Wood':'smartprivacy_faux','Synchrony':'synchrony_vertical','Palladian Shelf':'palladian_shelf','Shutters':'norman_shutters','San Clemente Honeycomb':'san_clemente_honeycomb','San Clemente Faux Wood':'san_clemente_faux_wood','Contract Faux Wood':'norman_contract_faux_wood','Contract Vertical':'norman_contract_vertical'}
for line in (root/'RESULTS.md').read_text().splitlines():
 cells=[c.strip() for c in line.split('|')]
 if len(cells)==4 and cells[1] in family_ids: exceptions[family_ids[cells[1]]]=cells[2]
exceptions.update({
 'norman_ultimate_faux_valance_only':'Standalone Ultimate valance destination uses original finish IDs and typed inner length, returns and connector/keystone records. Source boundary rules implemented; production proof pending. Standalone price, availability and freight unresolved.',
 'norman_smartprivacy_valance_only':'Standalone SmartPrivacy valance destination uses original finish IDs and typed inner length, returns and equal connector splits. Source boundary rules implemented; production proof pending. Standalone price, availability and freight unresolved.',
 'norman_roman_fabric_by_yard':'All201 front fabric identities reach a natural-unit destination. Guide-eligible choices selectable; manufacturer price approval, availability and freight unresolved. Internal0340 natural-unit persistence and held-output verified.',
 'norman_roman_pillow_covers':'157 guide-eligible pillow fabrics reach a natural-unit destination. Exact size/piping saved in0340. Dealer price approval, availability and freight unresolved.',
 'norman_smartdrape_replacement_vanes':'Standalone six-vane packs StyleA/B have typed original work order, finished length, arrangement and fabric choices.0339B save/reopen and missing-work-order rejection verified. Guide versus retail standalone-price conflict, availability and freight unresolved.',
})

def csvwrite(name,rows):
 with (root/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
programs=[];gridrows=[]
for p in data['products']:
 for pr in p['programs']:
  matches=[]
  for i,row in enumerate(pr['grid']['prices']):
   height=pr['grid']['heights'][i] if pr['grid']['heights'] else ''
   # Match the dimensional header and exact row only on the program's cited pages.
   # Width-only schedules have no height, including the historical zero placeholder.
   values=([height] if pr['priceAxis']=='wh' else [])+row
   needle=' '.join('NA' if x is None else str(x) for x in values)
   widths=' '.join(map(str,pr['grid']['widths']))
   def present(value,text): return bool(re.search(r'(?<![\d.])'+re.escape(value)+r'(?![\d.])',text))
   hit=[n for n in pr.get('sourcePages',[]) if n in texts and present(needle,texts[n]) and present(widths,texts[n])]
   matches.append(bool(hit));gridrows.append(dict(product=p['id'],program=pr['id'],row=i,widths=json.dumps(pr['grid']['widths']),height=height,prices=json.dumps(row),source='norman-retail-guide-2026-09',cited_pdf_pages=';'.join(map(str,pr.get('sourcePages',[]))),pdf_pages=';'.join(map(str,hit)),comparison='MATCH' if hit else 'UNRESOLVED',comparison_scope='Exact width header and height/price row on cited program page' if pr['priceAxis']=='wh' else 'Exact width header and width-only price row on cited program page'))
  programs.append(dict(product=p['id'],program=pr['id'],price_group=pr.get('priceGroup'),rule_status=data['status'][p['id']],grid_rows=len(matches),matched_rows=sum(matches),source=pr.get('sourceId') or ('norman-retail-guide-2026-09' if pr['priceAxis']!='sqft' else 'provisional imported shutter rates'),status='UNRESOLVED EXCEPTION',exception=exceptions[p['id']]))
csvwrite('programs.csv',programs);csvwrite('grid-rows.csv',gridrows)
colors=[]
for c in data['colors']:
 unavailable=not c['available']
 status='DISCONTINUED' if c['colorCode'] in ['F1561','F0210','F1364'] or (c['productId']=='roman' and c['colorCode'] in ['F1052','F1054','F0237','F1050','F1055','F1068']) or (c['productId']=='norman_contract_faux_wood' and c['colorCode']=='6018') or (c['productId']=='synchrony_vertical' and not c['available']) else 'UNRESOLVED EXCEPTION'
 reason= ('Inherited Ultimate Faux Wood swatch is not documented for SmartPrivacy; preserved for history pending dealer evidence.' if unavailable and c['productId']=='smartprivacy_faux' else 'Legacy ND118 conflicts with current guide and dealer ND108; retained for historical quotes.' if c['productId']=='wood_blinds' and c['colorCode']=='ND118' else 'Reverse-side image retained for history; not a separate orderable fabric.' if unavailable and c['productId']=='smartfold' else 'Manufacturer withdrawal; retained identity for historical quotes.' if status=='DISCONTINUED' else exceptions[c['productId']])
 colors.append(dict(product=c['productId'],catalog_id=c['id'],collection=c['collection'],color_code=c['colorCode'],color=c['colorName'],fabric_type=c['fabricType'],program=c['programId'],selectable=c['available'],source=c['sourcePage'],effective_date='2026-09-01' if c['productId']=='faux_wood' else '2026-09-01' if c['productId']=='wood_blinds' and c['colorCode']=='ND108' else '2026-08-01' if c['productId']=='citylights_aluminum' else '2026-09-10' if c['productId']=='smartfold' else '2025-11-19' if c['productId'].startswith('san_clemente_') else '2024-05-29' if c['productId']=='norman_contract_faux_wood' else '2024-11-01' if c['productId']=='norman_contract_vertical' else '2026-06-26' if c['productId']=='synchrony_vertical' else '',source_note=c['sourceNote'],status=status,exception=reason))
csvwrite('fabrics-colors.csv',colors)
csvwrite('honeycomb-color-cell-routes.csv',[dict(**r,status='GRID MAPPED; CONFIGURATION/PORTAL VERIFICATION PENDING') for r in data['honeycombCellRoutes']])
options=[]
for p in data['products']:
 for s in p['surcharges']:
  options.append(dict(product=p['id'],kind='surcharge',id=s['id'],name=s['name'],basis=s['kind'],price=s['value'],scope=s['per'],source_pages=json.dumps(s.get('sourcePages',[])),status='UNRESOLVED EXCEPTION',exception=exceptions[p['id']]))
 for f in data['optionFields'][p['id']]:
  options.append(dict(product=p['id'],kind='configuration_field',id=f['id'],name=f['label'],basis=f['type'],price='',scope='',source_pages='',status='UNRESOLVED EXCEPTION',exception='Field inventoried; complete source/condition/UI/server certification pending.'))
 for g in data['motorGroups'][p['id']]:
  for o in data['motorization'][g]['options']:
   options.append(dict(product=p['id'],kind='motor_accessory',id=g+':'+o['id'],name=o['name'],basis='',price=o.get('priceByProduct',{}).get(p['id'],o.get('price','')),scope='',source_pages=json.dumps(o.get('sourcePages',[])),status='UNRESOLVED EXCEPTION',exception=exceptions[p['id']]))
csvwrite('options.csv',options)
choices=[]
for p in data['products']:
 for f in data['optionFields'][p['id']]:
  for o in f.get('options',[]):
   choices.append(dict(product=p['id'],field=f['id'],field_label=f['label'],choice_value=o['value'],choice_label=o['label'],source_pages='',effective_date='',status='UNRESOLVED EXCEPTION',exception='Choice inventoried from exported detail fields. Source, conditional visibility, authoritative validation, and production persistence are not individually certified.'))
csvwrite('option-choices.csv',choices)
(root/'LEDGER-SCOPE.md').write_text('''# Norman ledger coverage

Programs, fabrics/colors, honeycomb color/cell routes, grid rows, surcharges, motor accessories, configuration fields and individual exported choice values each have separate rows. All 371 grid rows match both their width header and full height/price row on the cited program pages; width-only schedules omit the placeholder height. This is a source-content check, not a dealer-account quote comparison. A mapped grid or an active picker identity is not proof that every configuration is priceable.

The detail-field export does not contain every contextual control in the active CRM. The contextual-control inventory records dynamic UI and validation occurrences separately; source conditions and numeric boundaries are not all certified. Blank source/effective-date cells are evidence gaps. No row is promoted to verified live on the basis of aggregate tests or a representative quote. Product-level exceptions state the remaining work. The `verified_live` count is reserved for completely certified offerings under all valid conditions; representative live configurations are documented separately in RESULTS.md and the production proof files.

Rebuild prerequisites: export `current-catalog.json` by running `NORMAN_AUDIT_EXPORT=/absolute/path/current-catalog.json npx vitest run src/lib/quote-v2/norman-completion-audit.test.ts`; provide the locally extracted page/text records in `source-text/2026Sep Retail Price Guide.json`; then run `python3 build-ledger.py`. The PDF source is manifest `norman-retail-guide-2026-09`, effective September 1, 2026, SHA256 `3767de1e04ee7c8dc6bab14a6224868e4ca366f2ec4be2d8d3d13ec5cf45aafd`.
''')
cells=[v for p in data['products'] for g in p['programs'] for row in g['grid']['prices'] for v in row]
summary=dict(grid_cells=len(cells),priced_grid_cells=sum(v is not None for v in cells),unavailable_grid_cells=sum(v is None for v in cells),families=len(data['products']),programs=len(programs),grid_rows=len(gridrows),matched_grid_rows=sum(r['comparison']=='MATCH' for r in gridrows),color_identities=len(colors),selectable_color_identities=sum(r['selectable'] for r in colors),honeycomb_color_cell_routes=len(data['honeycombCellRoutes']),option_records=len(options),exported_option_choices=len(choices),verified_live=0)
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
