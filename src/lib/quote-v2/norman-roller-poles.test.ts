import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {describe,it,expect} from 'vitest';
import {ROLLER_POLE_KEY as KEY,ROLLER_POLE_ORDER_KEY as ORDER,ROLLER_POLES} from '../quote/norman-roller-poles';
import {rollerPoles,deriveRollerPoleOrder} from './norman-roller-poles';
import {quoteV2CatalogVersionFor,QUOTE_V2_ROLLER_PREVIEW_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import {authoritativeAutomaticSurchargeSelections} from './engine';
import {priceDesign} from '../quote/pricing';
import {deriveNormanOrderRecords} from './norman-assemblies';
import type {SelectionContext,SelectionRecord} from './core';
const shade=(height=96,patch:SelectionRecord={}):SelectionContext=>({manufacturerId:'Norman',productId:'roller',programId:'roller_cordless_fabric_price_group_1_pg1',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:36,heightInches:height,quantity:3,options:{},configuration:{lift_system:'Cordless',roller_application:'Single Shade',mount_type:'Outside Mount',valance:'No Valance',...patch}});
const pole=(kind:typeof ROLLER_POLES[number],quantityPerAssembly=1)=>({version:1,kind,quantityPerAssembly});
describe('Roller guide p44 order poles',()=>{
 it('allocates exactly one complimentary pole across lines/quantities, with exact96-inch height switch',()=>{
  const a=shade(),b=shade(96),lines=[{lineId:'z',selection:a},{lineId:'a',selection:b}];deriveRollerPoleOrder(lines);
  expect(a.configuration[ORDER]).toMatchObject({pole:'30-inch Fiberglass Pole',orderQuantity:1,fulfillmentQuantity:0});expect(b.configuration[ORDER]).toMatchObject({fulfillmentQuantity:1,ownerLineId:'a'});
  b.heightInches=96.001;deriveRollerPoleOrder(lines);expect(a.configuration[ORDER]).toMatchObject({pole:'58-inch Fiberglass Pole'});
  const restored=JSON.parse(JSON.stringify(lines));deriveRollerPoleOrder(restored);expect(restored).toEqual(lines);
 });
 it('excludes LightGuard360 and motorized, derives selected quote only and clears stale order membership',()=>{
  const a=shade(100,{roller_application:'LightGuard360'}),b=shade(100,{lift_system:'Motorized'}),c=shade();deriveRollerPoleOrder([{lineId:'a',selection:a},{lineId:'b',selection:b},{lineId:'c',selection:c}]);expect(a.configuration[ORDER]).toBeUndefined();expect(b.configuration[ORDER]).toBeUndefined();expect(c.configuration[ORDER]).toMatchObject({pole:'30-inch Fiberglass Pole',memberLineIds:['c']});
  c.configuration={...c.configuration,lift_system:'Motorized'};deriveRollerPoleOrder([{lineId:'c',selection:c}]);expect(c.configuration[ORDER]).toBeUndefined();
 });
 it.each([['30-inch Fiberglass Pole','additional_fiberglass_pole',28],['58-inch Fiberglass Pole','additional_fiberglass_pole',28],['36-inch Black Cordless Operating Pole','cordless_operating_pole_premium_hardware',89],['60-inch Black Cordless Operating Pole','cordless_operating_pole_premium_hardware',89],['Black Pole Attachment Only','pole_attachment_only',40]] as const)('prices%s extras once per selected quantity',(kind,id,price)=>{
  const s=shade(60,{[KEY]:pole(kind),[id]:true});expect(rollerPoles(s)?.issues).toEqual([]);expect(authoritativeAutomaticSurchargeSelections(s).filter(x=>x.id===id)).toEqual([{id,units:1}]);const input={productId:s.productId,programId:s.programId!,widthInches:36,heightInches:60,quantity:3};const a=priceDesign(input,s.catalogAsOf),b=priceDesign({...input,surcharges:[{id,units:1}]},s.catalogAsOf);expect(a.ok&&b.ok).toBe(true);if(a.ok&&b.ok)expect(b.total-a.total).toBe(price*3);
 });
 it('enforces one extra per physical shade and rejects stale, malformed and ineligible extras',()=>{
  const kind='30-inch Fiberglass Pole';for(const patch of [{[KEY]:pole(kind,2)},{[KEY]:pole(kind,0)},{[KEY]:pole('None',1)},{[KEY]:pole(kind,1.5)},{[KEY]:pole(kind),lift_system:'Motorized'},{[KEY]:pole(kind),roller_application:'LightGuard360'},{additional_fiberglass_pole:true}] as SelectionRecord[])expect(rollerPoles(shade(60,patch))?.issues.length).toBeGreaterThan(0);
  const coupled={roller_application:'Coupled Shades',coupling_arrangement:'Standard',roller_coupling_count:3,roller_component_order_widths:[30,30,30],[KEY]:pole(kind,3)};expect(rollerPoles(shade(60,coupled))?.issues).toEqual([]);expect(rollerPoles(shade(60,{...coupled,[KEY]:pole(kind,4)}))?.issues.length).toBeGreaterThan(0);
  expect(rollerPoles(shade(60,{roller_application:'Dual Roller',[KEY]:pole(kind,2)}))?.issues).toEqual([]);
 });
 it('rebuilds saved extra and included records and recognizes r9 without reinterpretation',()=>{
  const s=shade(100,{[KEY]:pole('Black Pole Attachment Only'),roller_pole_source_v1:{totalExtraQuantity:999},[ORDER]:{fulfillmentQuantity:999}});deriveNormanOrderRecords([{lineId:'a',selection:s}]);expect(s.configuration.roller_pole_source_v1).toMatchObject({totalExtraQuantity:3});expect(s.configuration[ORDER]).toMatchObject({fulfillmentQuantity:1,pole:'58-inch Fiberglass Pole'});
  const reopened=JSON.parse(JSON.stringify(s));deriveNormanOrderRecords([{lineId:'a',selection:reopened}]);expect(reopened).toEqual(s);
  s.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-chain-2026-09-20-r9`;expect(isRecognizedQuoteV2Catalog(s.productId,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(rollerPoles(s)).toBeNull();
 });
});

it('persists one shared included pole and exact extras through real saved backend',()=>{
 const ids=['a','b'];const input={lines:ids.map(id=>({id,quote_id:'audit',room_name:id,product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:2,sort_order:0} as SalesQuoteLineItem)),designs:ids.map(id=>({id:`d-${id}`,line_item_id:id,variant:'A',supplier:'Norman',mount_type:'Outside Mount',lift_system:'Cordless',valance:'No Valance',fabric:'Amelia',options_json:{quote_v2_backend:true,catalog_product_id:'roller',fabric_product_id:'roller',catalog_program_id:'roller_cordless_fabric_price_group_2_pg2',fabric_collection:'Amelia',fabric_color_code:'F1484',roller_application:'Single Shade',roller_top_treatment:'No Top Treatment',roller_tube:'All Tubes',[KEY]:pole('58-inch Fiberglass Pole')}} as unknown as SalesQuoteDesign)),selectedVariantByLine:{a:'A',b:'A'}};
 const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in result)||result.backend!=='v2')throw Error('V2 required');
 expect(result.designs.every(r=>r.result.ok),JSON.stringify(result.designs.map(r=>r.result))).toBe(true);expect(result.designs.map(r=>(r.selection.configuration[ORDER] as SelectionRecord).fulfillmentQuantity)).toEqual([1,0]);expect(result.designs[0].selection.configuration.roller_pole_source_v1).toMatchObject({totalExtraQuantity:2});
 expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
 const bad=JSON.parse(JSON.stringify(input));bad.designs[0].options_json[KEY].quantityPerAssembly=2;const negative=repriceExactQuoteBuilderForServerDate(bad,'2026-09-20');if(!('backend'in negative)||negative.backend!=='v2')throw Error('V2 required');expect(negative.designs[0].result.ok).toBe(false);expect(JSON.stringify(negative.designs[0].result)).toContain('roller.poles.quantity');
});
