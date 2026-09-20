import argparse,json,csv,collections
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--portal-dir',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True);a=p.parse_args()
out=a.portal_dir;dest=a.output_dir;dest.mkdir(parents=True,exist_ok=True)
initial=json.loads((out/'portal-fabric-inventory.json').read_text())
extra=json.loads((out/'additional-portal-menus.json').read_text())
menus=[{'family':r['family'],'labels':r['options']} for r in initial]+extra['families']+[{'family':'Glydea Track','labels':['GLYDEA TRACK']}]
cell={r['portalLabel']:r for r in json.loads((out/'cellular-mapping-ledger.json').read_text())}
routes={
'Portfolio Soft Roman':['sundance_portfolio_roman'], 'Wovenwood':['sundance_walden_premier','sundance_walden_select'],
'Euro Panel':['sundance_europanels','sundance_louvolite_europanels'], 'Cellular Shade':['sundance_cellular'],
'Clutch Roller':['sundance_roller','sundance_louvolite_roller','sundance_exterior_cable'],
'Motorized Roller':['sundance_roller','sundance_louvolite_roller','sundance_exterior_cable'],
'Caress-Zebra':['sundance_zebra','sundance_louvolite_zebra'], 'SheerView Plus':['sundance_sheerview'],
'Zipper Screen Exterior':['sundance_exterior_zip'], '1-inch Aluminum':['sundance_aluminum_1'], '2-inch Aluminum':['sundance_aluminum_2'],
'Vertical Essence':['sundance_vertical_essence'], '2-inch Advantage':['sundance_advantage_ii_2','sundance_basicvue'],
'2.5-inch Advantage':['sundance_advantage_ii_2_5'], '2-inch Wood':['sundance_premium_ii_2','sundance_chateau_woods'],
'2.5-inch Wood':['sundance_premium_ii_2_5','sundance_chateau_woods'], 'Glydea Track':['sundance_drapery_track']}
ledger=[]
for menu in menus:
 counts=collections.Counter(menu['labels'])
 for i,label in enumerate(menu['labels'],1):
  exact=cell.get(label) if menu['family']=='Cellular Shade' else None
  glydea=menu['family']=='Glydea Track'
  ledger.append({'portalFamily':menu['family'],'portalPosition':i,'portalLabel':label,'duplicateLabelCount':counts[label],
  'source':'https://sundance.blindata.app','observedOn':'2026-09-20','effectiveDate': '2025-05-01' if exact else None,
  'candidateCatalogDestinations':routes[menu['family']],'exactCatalogDestination':'sundance_cellular' if exact else 'sundance_drapery_track' if glydea else None,
  'canonicalCode':exact['code'] if exact else None,'programId':exact['programId'] if exact else None,
  'status':'implemented_pending_live_proof' if exact or glydea else 'unresolved_exception',
  'exception': 'Full configuration compatibility, account terms and production saved-price proof remain unresolved' if exact else
   'Seven current dealer option menus captured; dimensional/compatibility rules, effective date, complete charge schedule/account terms and live proof unresolved' if glydea else
   'Current exact code/group and duplicate/legacy status require dealer reconciliation' if menu['family']=='Cellular Shade' else
   'Exact identity/color-to-program route and current source revision, option compatibility, account terms and production save/price proof unresolved; menu label alone is not pricing authority'})
# Enrich exact routes from subsequent source-backed increments.
root=Path(__file__).resolve().parents[2]
walden=json.loads((root/'src/lib/quote/sundance/walden-assortment.source.json').read_text())
horizontal=json.loads((root/'src/lib/quote/sundance/horizontal-assortment.source.json').read_text())
shade=json.loads((root/'src/lib/quote/sundance/shade-fabrics.source.json').read_text())
for entry in ledger:
 row=next((r for r in walden['rows'] if entry['portalFamily']=='Wovenwood' and entry['portalLabel'] in r['portalLabels']),None)
 if row:
  entry.update(exactCatalogDestination=row['productId'],canonicalCode=row['code'],programId=row['programId'],effectiveDate=None,status='source_mapped_manual_pricing_required',exception='Full configuration/account terms remain unresolved; '+('edge binding source conflict; ' if row['edgeBindingSourceConflict'] else '')+row['portalStatus'])
 row=next((r for r in horizontal['rows'] if entry['portalFamily']==r['portalFamily'] and entry['portalLabel'] in r['portalLabels']),None)
 if row:
  entry.update(exactCatalogDestination=row['productId'],canonicalCode=row['code'],programId=row['programId'],effectiveDate=row['effectiveDate'],status='source_mapped_manual_pricing_required',exception='Full configuration/account terms remain unresolved; '+('guide Arctic Ice versus portal ARTIC WHITE' if row['nameConflict'] else 'exact source identity and route mapped'))
 matches=[r for r in shade['colors'] if entry['portalFamily'] in r['portalFamilies'] and entry['portalLabel']==r['portalLabel']]
 if len(matches)==1:
  row=matches[0];collection=next(c for c in shade['collections'] if c['id']==row['collectionId'])
  entry.update(exactCatalogDestination=row['productId'],canonicalCode=None,programId=row['programId'],effectiveDate=collection['effectiveDate'],status='source_mapped_manual_pricing_required',exception='Exact dealer label mapped to '+collection['name']+'; complete control, dimensional and account-price compatibility remain unresolved')
for source_file,family,product in [('sheerview-assortment','SheerView Plus','sundance_sheerview'),('portfolio-assortment','Portfolio Soft Roman','sundance_portfolio_roman'),('vertical-assortment','Vertical Essence','sundance_vertical_essence')]:
 data=json.loads((root/f'src/lib/quote/sundance/{source_file}.source.json').read_text())
 for entry in ledger:
  row=next((r for r in data['rows'] if entry['portalFamily']==family and entry['portalLabel'] in r['portalLabels']),None)
  if row:
   programs=row.get('programId') or row['programFlatKnife']+' | '+row['programHobbledFront']
   entry.update(exactCatalogDestination=product,canonicalCode=row.get('code'),programId=programs,effectiveDate=row.get('effectiveDate'),status='source_mapped_manual_pricing_required',exception='Exact source material matched; valid style/control, current availability and account prices still require verification')
zebra=json.loads((root/'src/lib/quote/sundance/zebra-fabrics.source.json').read_text())
for entry in ledger:
 row=next((r for r in zebra['colors'] if entry['portalFamily']=='Caress-Zebra' and entry['portalLabel']==r['portalLabel']),None)
 if row:entry.update(exactCatalogDestination=row['productId'],canonicalCode=None,programId=row['programId'],effectiveDate='2024-08-01',status='source_mapped_manual_pricing_required',exception='Exact dealer label reconciled; source options, account prices and full compatibility remain unresolved')
exterior=json.loads((root/'src/lib/quote/sundance/exterior-zip.source.json').read_text())
for entry in ledger:
 row=next((r for r in exterior['rows'] if entry['portalFamily']=='Zipper Screen Exterior' and entry['portalLabel']==r['portalLabel']),None)
 if row:entry.update(exactCatalogDestination='sundance_exterior_zip',canonicalCode=None,programId=None,effectiveDate=None,status='source_mapped_manual_pricing_required',exception='Exact dealer label and '+row['priceClass']+' net square-foot source class mapped; motor, rounding/minimum, account applicability and current rate unresolved')
for entry in ledger:
 if entry['exactCatalogDestination'] and entry['status']=='implemented_pending_live_proof':
  entry['status']='source_mapped_manual_pricing_required'
  entry['exception']='Representative identity save/reopen verified; exhaustive configuration and account pricing remain unresolved'
(dest/'sundance-dealer-ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
with (dest/'sundance-dealer-ledger.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=ledger[0]);w.writeheader();w.writerows(ledger)
summary=[{'family':m['family'],'menuRows':len(m['labels']),'uniqueLabels':len(set(m['labels'])),'duplicateRows':len(m['labels'])-len(set(m['labels']))} for m in menus]
(dest/'sundance-menu-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'orderingTypes':len(menus),'menuRows':len(ledger),'sourceMappedRows':sum(r['exactCatalogDestination'] is not None for r in ledger),'remainingRows':sum(r['exactCatalogDestination'] is None for r in ledger)},indent=2))
