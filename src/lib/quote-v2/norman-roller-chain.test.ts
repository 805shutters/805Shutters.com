import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {describe,it,expect} from 'vitest';
import {ROLLER_CHAIN_KEY as KEY,emptyRollerChain,newRollerChainDraft,syncRollerChainDraft,rollerChainDirty} from '../quote/norman-roller-chain';
import {defaultRollerChainLength,rollerChain} from './norman-roller-chain';
import {quoteV2CatalogVersionFor,QUOTE_V2_ROLLER_PREVIEW_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import {deriveNormanOrderRecords} from './norman-assemblies';
import type {SelectionContext,SelectionRecord} from './core';
const record={...emptyRollerChain(),deviceClearance:2,safetyDeviceConfirmed:true};
const shade=(height=60,smart=true,patch:SelectionRecord={}):SelectionContext=>({manufacturerId:'Norman',productId:'roller',programId:'roller_cordless_fabric_price_group_2_pg2',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:36,heightInches:height,quantity:1,options:{},configuration:{lift_system:smart?'Smart Release':'Continuous Cord Loop',mount_type:'Outside Mount',roller_application:'Single Shade',roller_tube:'1 3/4" (43mm) Tube',roller_top_treatment:'No Top Treatment',fabric_collection:'Amelia',fabric_color_code:'F1484',[KEY]:record,...patch}});
describe('Roller guide p44 chain schedule',()=>{
 it.each([[12,10],[18,16],[18.001,16],[25.5,16],[25.501,16],[30,16],[30.001,24],[42,24],[42.001,36],[54,36],[54.001,48],[66,48],[66.001,60],[90,60],[90.001,84],[144,84]])('SmartRelease height %s derives %s',(height,length)=>expect(defaultRollerChainLength(height,true)).toBe(length));
 it('keeps CCL 25.5-inch breakpoint and full fractional formula',()=>{expect(defaultRollerChainLength(25.5,false)).toBe(23.5);expect(defaultRollerChainLength(25.501,false)).toBe(2*25.501/3+6);expect(defaultRollerChainLength(144,false)).toBe(102);expect(defaultRollerChainLength(144.01,false)).toBeNull();});
 it('enforces custom minimum, obstruction maximum and hard280-inch maximum',()=>{
  const custom=(length:number,smart=true,clear=false)=>rollerChain(shade(60,smart,{[KEY]:{...record,lengthMode:'Custom',customLength:length,unobstructedBelow:clear}}))!;
  expect(custom(10).issues).toEqual([]);expect(custom(9.99).issues.map(i=>i.ruleId)).toContain('roller.chain.minimum');
  expect(custom(46,false).issues.map(i=>i.ruleId)).toContain('roller.chain.minimum');expect(custom(46.001,false).issues).toEqual([]);
  expect(custom(58).issues).toEqual([]);expect(custom(58.001).issues.map(i=>i.ruleId)).toContain('roller.chain.obstruction');expect(custom(280,true,true).issues).toEqual([]);expect(custom(280.001,true,true).issues.map(i=>i.ruleId)).toContain('roller.chain.maximum');
 });
 it('requires safety device and2-inch removal clearance and rejects stale/inapplicable records',()=>{
  for(const patch of [{[KEY]:null},{[KEY]:{...record,deviceClearance:1.999}},{[KEY]:{...record,safetyDeviceConfirmed:false}},{[KEY]:{...record,customLength:20}},{lift_system:'Cordless'},{[KEY]:{...record,color:'Purple'}}] as SelectionRecord[])expect(rollerChain(shade(60,true,patch))?.issues.length).toBeGreaterThan(0);
  expect(rollerChain(shade())?.issues).toEqual([]);
 });
 it('rebuilds per-member default length and tolerance on saved order; no sharedchain arithmetic',()=>{
  const a=shade(60),b=shade(90);deriveNormanOrderRecords([{lineId:'a',selection:a},{lineId:'b',selection:b}]);
  expect(a.configuration.roller_chain_source_v1).toMatchObject({orderedLength:48,smartReleaseTolerance:'0 to 1.18 inches'});expect(b.configuration.roller_chain_source_v1).toMatchObject({orderedLength:60});
  const reopened=JSON.parse(JSON.stringify(a));deriveNormanOrderRecords([{lineId:'a',selection:reopened}]);expect(reopened).toEqual(a);
 });
 it('saves rapid edits atomically while preserving r8 history',()=>{
  let d=newRollerChainDraft('d',emptyRollerChain());d={...d,record:{...d.record,material:'Stainless Steel',deviceClearance:2,safetyDeviceConfirmed:true}};expect(rollerChainDirty(d)).toBe(true);d={...d,submitted:d.record};d=syncRollerChainDraft(d,'d',emptyRollerChain());expect(d.record).toMatchObject({material:'Stainless Steel',deviceClearance:2,safetyDeviceConfirmed:true});
  const s=shade();s.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-accessories-2026-09-20-r8`;expect(isRecognizedQuoteV2Catalog(s.productId,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(rollerChain(s)).toBeNull();
 });
});

it('validates saved SmartRelease chain through real backend and persists source-derived48inch length',()=>{
 const c=shade().configuration;
 const options={...c,quote_v2_backend:true,catalog_product_id:'roller',quote_lab_product_id:'roller',fabric_product_id:'roller',catalog_program_id:'roller_cordless_fabric_price_group_2_pg2',quote_lab_program_id:'roller_cordless_fabric_price_group_2_pg2'};
 const input={lines:[{id:'l',quote_id:'audit',room_name:'Chain',product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0} as SalesQuoteLineItem],designs:[{id:'d',line_item_id:'l',variant:'A',supplier:'Norman',mount_type:'Outside Mount',lift_system:'Smart Release',valance:'No Valance',fabric:'Amelia',options_json:options} as unknown as SalesQuoteDesign],selectedVariantByLine:{l:'A'}};
 const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in result)||result.backend!=='v2')throw Error('V2 required');expect(result.designs[0].result.ok,JSON.stringify(result.designs[0].result)).toBe(true);expect(result.designs[0].selection.configuration.roller_chain_source_v1).toMatchObject({orderedLength:48});
 expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
 const bad=JSON.parse(JSON.stringify(input));bad.designs[0].options_json[KEY].deviceClearance=1.999;
 const negative=repriceExactQuoteBuilderForServerDate(bad,'2026-09-20');if(!('backend'in negative)||negative.backend!=='v2')throw Error('V2 required');expect(negative.designs[0].result.ok).toBe(false);expect(JSON.stringify(negative.designs[0].result)).toContain('roller.chain.device_clearance');
});
