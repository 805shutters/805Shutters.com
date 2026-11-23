import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {describe,it,expect} from 'vitest';
import {ROLLER_LIGHT_GUARD_KEY as KEY,ROLLER_LIGHT_GUARD_GROUP_KEY as GROUP,ROLLER_BASIC_GUARD_COLORS,ROLLER_WOOD_GUARD_COLORS,emptyRollerLightGuard} from '../quote/norman-roller-light-guard';
import {ROLLER_COMMON_CHOICE_KEY as COMMON_KEY,emptyRollerCommon} from '../quote/norman-roller-common';
import {rollerLightGuard,rollerGuardSplice} from './norman-roller-light-guard';
import {quoteV2CatalogVersionFor,QUOTE_V2_ROLLER_PREVIEW_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import {authoritativeAutomaticSurchargeSelections} from './engine';
import {priceDesign} from '../quote/pricing';
import {deriveNormanOrderRecords} from './norman-assemblies';
import type {SelectionContext,SelectionRecord} from './core';
const record={...emptyRollerLightGuard(),kind:'Basic' as const,color:'3058 White',leftLength:60,rightLength:60};
const shade=(patch:SelectionRecord={}):SelectionContext=>({manufacturerId:'Norman',productId:'roller',programId:'roller_cordless_fabric_price_group_2_pg2',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:36,heightInches:60,quantity:2,options:{},configuration:{lift_system:'Cordless',roller_application:'Single Shade',mount_type:'Inside Mount',valance:'No Valance',fabric_collection:'Amelia',fabric_color_code:'F1484',roller_tube:'2" (52mm) Tube',[KEY]:record,...patch}});
describe('Roller guide p45 Light Guard',()=>{
 it.each(ROLLER_BASIC_GUARD_COLORS)('accepts exact Basic finish%s',color=>expect(rollerLightGuard(shade({[KEY]:{...record,color}}))?.issues).toEqual([]));
 it.each(ROLLER_WOOD_GUARD_COLORS)('accepts exact Wood finish%s with source running-size distinction',color=>{
  const r=rollerLightGuard(shade({[KEY]:{...record,kind:'Premium Wood',color}}))!;expect(r.issues).toEqual([]);expect(r.record.sideChannelWidthMm).toBe(['049 Stone Gray','110 Limed White'].includes(color)?35:30);
 });
 it.each([[96,[96],null],[96.001,[6,90.001],6],[102,[6,96],6],[102.001,[6.001,96],6.001]])('splices Basic length%s at exact96/102boundaries',(length,pieces,point)=>{
  const r=rollerGuardSplice(length as number);expect((r.pieces as number[]).length).toBe((pieces as number[]).length);(r.pieces as number[]).forEach((v,i)=>expect(v).toBeCloseTo((pieces as number[])[i],8));point===null?expect(r.spliceFromTop).toBeNull():expect(r.spliceFromTop).toBeCloseTo(point as number,8);
 });
 it('rejects outside/LG360/unknowncolor/missinglengths/stalelegacy and wood splice extrapolation',()=>{
  for(const patch of [{mount_type:'Outside Mount'},{roller_application:'LightGuard360'},{[KEY]:{...record,color:'Purple'}},{[KEY]:{...record,leftLength:null}},{[KEY]:{...record,kind:'None'}},{[KEY]:null,light_guard:'Basic'},{[KEY]:{...record,kind:'Premium Wood',color:'049 Stone Gray',leftLength:96.001}}] as SelectionRecord[])expect(rollerLightGuard(shade(patch))?.issues.length).toBeGreaterThan(0);
 });
 it('supports only Basic with Cassette and records the correct single/dual/no-top block',()=>{
  expect(rollerLightGuard(shade())?.record.topBlock).toMatchObject({material:'white_vane',nominalHeightInches:4.5});expect(rollerLightGuard(shade({roller_application:'Dual Roller'}))?.record.topBlock).toMatchObject({material:'white_room_darkening_fabric',nominalHeightInches:8.5});
  expect(rollerLightGuard(shade({valance:'Cassette'}))?.record.topBlock).toBeNull();expect(rollerLightGuard(shade({valance:'Cassette',[KEY]:{...record,kind:'Premium Wood',color:'049 Stone Gray'}}))?.issues.length).toBeGreaterThan(0);
 });
 it('charges one set per coupled assembly and one owner per common valance, never one per shade member',()=>{
  const coupled=shade({roller_application:'Coupled Shades',roller_coupling_count:3,roller_component_order_widths:[36,36,36]});expect(rollerLightGuard(coupled)?.selections).toEqual([{id:'basic_light_guard',units:1}]);
  const lines=[1,2].map((n)=>({lineId:`l${n}`,selection:shade({roller_application:'Common Valance',valance:'4.5 Square Fascia',roller_top_treatment:'Square Fascia',[COMMON_KEY]:{...emptyRollerCommon(),groupId:'g',position:n}})}));
  deriveNormanOrderRecords(lines);expect(lines.map(row=>rollerLightGuard(row.selection)?.selections)).toEqual([[{id:'basic_light_guard',units:1}],[]]);expect(lines[0].selection.configuration[GROUP]).toMatchObject({setQuantityPerAssembly:1});
  lines[1].selection.configuration={...lines[1].selection.configuration,[KEY]:{...record,color:'3012 Bianca'}};expect(deriveNormanOrderRecords(lines).map(i=>i.ruleId)).toContain('roller.light_guard.common_matching');
 });
 it.each([['Basic','3058 White','basic_light_guard',45],['Premium Wood','049 Stone Gray','premium_wood_light_guard',117]] as const)('keeps%s source price and quote quantity exact',(kind,color,id,price)=>{
  const s=shade({[KEY]:{...record,kind,color},light_guard:id});expect(authoritativeAutomaticSurchargeSelections(s).filter(e=>e.id===id)).toEqual([{id,units:1}]);const input={productId:s.productId,programId:s.programId!,widthInches:36,heightInches:60,quantity:2};const a=priceDesign(input,s.catalogAsOf),b=priceDesign({...input,surcharges:[{id,units:1}]},s.catalogAsOf);expect(a.ok&&b.ok).toBe(true);if(a.ok&&b.ok)expect(b.total-a.total).toBe(price*2);
 });
 it('rebuilds saved channel source and preserves previous r10 semantics',()=>{
  const s=shade({roller_light_guard_source_v1:{setQuantity:999}});deriveNormanOrderRecords([{lineId:'a',selection:s}]);expect(s.configuration.roller_light_guard_source_v1).toMatchObject({setQuantity:1,sideBlockQuantity:2,leftChannel:{pieces:[60]}});const reopened=JSON.parse(JSON.stringify(s));deriveNormanOrderRecords([{lineId:'a',selection:reopened}]);expect(reopened).toEqual(s);
  s.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-poles-2026-09-20-r10`;expect(isRecognizedQuoteV2Catalog(s.productId,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(rollerLightGuard(s)).toBeNull();
 });
});

it('persists source Light Guard pricing and rejects an incompatible mount through the actual saved backend',()=>{
 const input={lines:[{id:'a',quote_id:'audit',room_name:'a',product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:2,sort_order:0} as SalesQuoteLineItem],designs:[{id:'d-a',line_item_id:'a',variant:'A',supplier:'Norman',mount_type:'Inside Mount',lift_system:'Cordless',valance:'No Valance',fabric:'Amelia',options_json:{quote_v2_backend:true,catalog_product_id:'roller',fabric_product_id:'roller',catalog_program_id:'roller_cordless_fabric_price_group_2_pg2',fabric_collection:'Amelia',fabric_color_code:'F1484',roller_application:'Single Shade',roller_top_treatment:'No Top Treatment',roller_tube:'All Tubes',[KEY]:record}} as unknown as SalesQuoteDesign],selectedVariantByLine:{a:'A'}};
 const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in result)||result.backend!=='v2')throw Error('V2 required');
 expect(result.designs[0].result.ok,JSON.stringify(result.designs[0].result)).toBe(true);expect(result.designs[0].selection.configuration.roller_light_guard_source_v1).toMatchObject({kind:'Basic',color:'3058 White',setQuantity:1,leftChannel:{pieces:[60]}});
 expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
 const bad=JSON.parse(JSON.stringify(input));bad.designs[0].mount_type='Outside Mount';const negative=repriceExactQuoteBuilderForServerDate(bad,'2026-09-20');if(!('backend'in negative)||negative.backend!=='v2')throw Error('V2 required');expect(negative.designs[0].result.ok).toBe(false);expect(JSON.stringify(negative.designs[0].result)).toContain('roller.light_guard.mount');
});
