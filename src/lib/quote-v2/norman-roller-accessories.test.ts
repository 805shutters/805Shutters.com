import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ROLLER_ACCESSORY_KEY as KEY,ROLLER_ACCESSORY_DERIVED as DERIVED,ROLLER_MAGNET_COLORS,emptyRollerAccessories,newRollerAccessoryDraft,syncRollerAccessoryDraft,rollerAccessoryDirty} from '../quote/norman-roller-accessories';
import {rollerAccessories} from './norman-roller-accessories';
import {quoteV2CatalogVersionFor,isRecognizedQuoteV2Catalog,QUOTE_V2_ROLLER_PREVIEW_VERSION} from './catalog';
import {authoritativeAutomaticSurchargeSelections} from './engine';
import {deriveNormanOrderRecords} from './norman-assemblies';
import {NormanRollerAccessoriesOptions} from '@/components/crm/NormanRollerAccessoriesOptions';
import {priceDesign} from '../quote/pricing';
import type {SelectionContext,SelectionRecord} from './core';
const record={...emptyRollerAccessories(),holdDown:'Magnetic' as const,leftClearance:.5625,rightClearance:.5625,bottomClearance:.6875};
const shade=(patch:SelectionRecord={}):SelectionContext=>({manufacturerId:'Norman',productId:'roller',programId:'roller_cordless_fabric_price_group_1_pg1',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:36,heightInches:60,quantity:3,options:{},configuration:{roller_application:'Single Shade',lift_system:'Cordless',mount_type:'Outside Mount',valance:'No Valance',[KEY]:record,...patch}});
describe('Roller guide p43 magnetic hold-downs',()=>{
 it.each(ROLLER_MAGNET_COLORS)('accepts exact listed catch color %s',magnetColor=>expect(rollerAccessories(shade({[KEY]:{...record,magnetColor}}))?.issues).toEqual([]));
 it.each(['leftClearance','rightClearance','bottomClearance'] as const)('rejects absent or below-minimum %s and accepts boundary',key=>{
  expect(rollerAccessories(shade())?.issues).toEqual([]);
  for(const value of [null,record[key]!-.0001])expect(rollerAccessories(shade({[KEY]:{...record,[key]:value}}))?.issues.length).toBeGreaterThan(0);
 });
 it('counts one pair for Dual rear shade, each coupled shade; Cassette inclusion does not double-charge',()=>{
  const dual=rollerAccessories(shade({roller_application:'Dual Roller'}));expect(dual?.record).toMatchObject({holdDownPairs:1,magnetLocation:'factory_back_of_rear_shade_hem_bar'});
  expect(dual?.selections).toEqual([{id:'magnetic_hold_down',units:1}]);
  const coupled=rollerAccessories(shade({roller_application:'Coupled Shades',coupling_arrangement:'Standard',roller_coupling_count:3,roller_component_order_widths:[36,36,36]}));expect(coupled?.selections).toEqual([{id:'magnetic_hold_down',units:3}]);
  const cassette=rollerAccessories(shade({valance:'Cassette'}));expect(cassette?.record.includedWithCassette).toBe(true);expect(cassette?.selections).toEqual([]);
 });
 it('blocks LightGuard360, malformed records, unconfirmed traditional price and legacy unmeasured selections',()=>{
  for(const patch of [{roller_application:'LightGuard360'},{[KEY]:{...record,magnetColor:'Invented'}},{[KEY]:{...record,holdDown:'Traditional'}},{[KEY]:null,hold_downs:'Magnetic'},{[KEY]:null,valance:'Cassette'}] as SelectionRecord[])expect(rollerAccessories(shade(patch))?.issues.length).toBeGreaterThan(0);
 });
 it('derives magnetic retail surcharge once and preserves assembly quantity',()=>{
  const s=shade({magnetic_hold_down:true});expect(authoritativeAutomaticSurchargeSelections(s).filter(x=>x.id==='magnetic_hold_down')).toEqual([{id:'magnetic_hold_down',units:1}]);
  const base={productId:'roller',programId:s.programId!,widthInches:36,heightInches:60,quantity:3};
  const a=priceDesign(base,s.catalogAsOf),b=priceDesign({...base,surcharges:[{id:'magnetic_hold_down',units:1}]},s.catalogAsOf);expect(a.ok&&b.ok).toBe(true);if(a.ok&&b.ok)expect(b.total-a.total).toBe(28*3);
 });
 it('rebuilds saved records, keeps rapid edits atomic and preserves older r7 semantics',()=>{
  const s=shade({[DERIVED]:{holdDownPairs:999}});deriveNormanOrderRecords([{lineId:'a',selection:s}]);expect(s.configuration[DERIVED]).toMatchObject({holdDownPairs:1,clearance:{left:.5625}});
  const reopened=JSON.parse(JSON.stringify(s));deriveNormanOrderRecords([{lineId:'a',selection:reopened}]);expect(reopened).toEqual(s);
  let d=newRollerAccessoryDraft('d',emptyRollerAccessories());d={...d,record:{...d.record,...record,magnetColor:'Black'}};expect(rollerAccessoryDirty(d)).toBe(true);d={...d,submitted:d.record};d=syncRollerAccessoryDraft(d,'d',emptyRollerAccessories());expect(d.record.magnetColor).toBe('Black');expect(d.record.bottomClearance).toBe(.6875);
  s.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-group-hardware-2026-09-20-r7`;expect(isRecognizedQuoteV2Catalog(s.productId,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(rollerAccessories(s)).toBeNull();
  const html=renderToStaticMarkup(createElement(NormanRollerAccessoriesOptions,{design:undefined,onUpdateFields:()=>{}}));expect(html).not.toContain('Save Roller accessories');
 });
});

it('real saved backend prices documented magnetic hardware, rejects below-boundary clearance and rebuilds forged derived state',()=>{
 const options={quote_v2_backend:true,catalog_product_id:'roller',quote_lab_product_id:'roller',fabric_product_id:'roller',catalog_program_id:'roller_cordless_fabric_price_group_2_pg2',quote_lab_program_id:'roller_cordless_fabric_price_group_2_pg2',fabric_collection:'Amelia',fabric_color_code:'F1484',roller_application:'Single Shade',roller_top_treatment:'No Top Treatment',roller_tube:'All Tubes',[KEY]:record,[DERIVED]:{holdDownPairs:999}};
 const input={lines:[{id:'l',quote_id:'audit',room_name:'Roller magnetic',product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0} as SalesQuoteLineItem],designs:[{id:'d',line_item_id:'l',variant:'A',supplier:'Norman',mount_type:'Outside Mount',lift_system:'Cordless',valance:'No Valance',fabric:'Amelia',options_json:options} as unknown as SalesQuoteDesign],selectedVariantByLine:{l:'A'}};
 const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in result)||result.backend!=='v2')throw Error('V2 required');
 const row=result.designs[0];expect(row.selection.configuration[DERIVED]).toMatchObject({holdDownPairs:1});expect(row.result.ok,JSON.stringify(row.result)).toBe(true);
 expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
 const bad=JSON.parse(JSON.stringify(input));bad.designs[0].options_json[KEY].leftClearance=.5624;
 const negative=repriceExactQuoteBuilderForServerDate(bad,'2026-09-20');if(!('backend'in negative)||negative.backend!=='v2')throw Error('V2 required');expect(negative.designs[0].result.ok).toBe(false);expect(JSON.stringify(negative.designs[0].result)).toContain('roller.accessories.magnet_left');
});
