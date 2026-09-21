import {describe,it,expect} from 'vitest';
import type {SelectionContext,SelectionRecord} from './core';
import {quoteV2CatalogVersionFor,QUOTE_V2_CATALOG_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import {magneticClearanceRecord,validateMagneticClearance as validate,magneticHoldDownActive,MAGNET_CLEARANCE_FIELDS} from './norman-magnet-clearance';
import {validateSmartfoldAccessories,smartfoldHardware} from './norman-smartfold-hardware';
import {validatePerfectsheerHardware,perfectsheerHardware} from './norman-perfectsheer-hardware';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
const measured={magnet_left_clearance_inches:.5625,magnet_right_clearance_inches:.5625,magnet_bottom_clearance_inches:.6875};
const shade=(productId='smartfold',c:SelectionRecord={}):SelectionContext=>({manufacturerId:'Norman',productId,programId:productId==='smartfold'?'smartfold_smartfold_shades':'perfectsheer_perfectsheer_shades_light_filtering',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor(productId,'2026-09-20'),widthInches:36,heightInches:60,quantity:1,options:{},configuration:{smartfold_hold_down:'Magnetic',smartfold_magnet_color:'Nickel-Plated',perfectsheer_magnetic_hold_down:'Yes',...measured,...c}});
describe('source magnetic catch installation clearance',()=>{
 it.each(['smartfold','perfectsheer'])('validates every independent dimension and exact minimum for %s',product=>{
  expect(validate(shade(product))).toEqual([]);
  for(const [key,,min] of MAGNET_CLEARANCE_FIELDS)for(const value of [null,'1',NaN,Infinity,-1,0,min-.0001]){
   expect(validate(shade(product,{[key]:value})).map(v=>v.ruleId)).toContain(`norman.${product}.${key}`);
  }
  const validator=product==='smartfold'?validateSmartfoldAccessories:validatePerfectsheerHardware;
  expect(validator(shade(product))).toEqual([]);
  expect(validator(shade(product,{magnet_right_clearance_inches:.5})).map(i=>i.ruleId)).toContain(`norman.${product}.magnet_right_clearance_inches`);
 });
 it('retains AutoWand door default and respects explicit No',()=>{
  const c={motor_type:'AutoWand',perfectsheer_installed_on_door:'Yes',perfectsheer_magnetic_hold_down:null};
  expect(magneticHoldDownActive('perfectsheer',c)).toBe(true);
  expect(validate(shade('perfectsheer',{...c,magnet_bottom_clearance_inches:null}))).toHaveLength(1);
  expect(validate(shade('perfectsheer',{...c,perfectsheer_magnetic_hold_down:'No',magnet_bottom_clearance_inches:null}))).toEqual([]);
  expect(validate(shade('smartfold',{smartfold_hold_down:'Traditional',magnet_bottom_clearance_inches:null}))).toEqual([]);
 });
 it('preserves recognized historical behavior without fabricating measurements',()=>{
  for(const [product,suffix] of [['smartfold','-norman-smartfold-mounting-2026-09-20-r9'],['perfectsheer','-norman-perfectsheer-controls-2026-09-19-r7']]){
   const s=shade(product,{magnet_left_clearance_inches:null});s.catalogVersion=QUOTE_V2_CATALOG_VERSION+suffix;
   expect(isRecognizedQuoteV2Catalog(product,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(validate(s)).toEqual([]);expect(magneticClearanceRecord(s)).toBeNull();
  }
 });
 it('records measured values separately from required values and product-specific datum',()=>{
  const s=shade('smartfold',{magnet_left_clearance_inches:1});
  expect(smartfoldHardware(s)?.record.magneticClearance).toMatchObject({leftSideAvailable:1,requiredEachSide:.5625,sourcePage:20,bottomDatum:'shade_bottom_or_window_sill'});
  expect(perfectsheerHardware(shade('perfectsheer'))?.record.magneticHoldDown?.measuredClearance).toMatchObject({minimumBottomAvailable:.6875,sourcePage:45,bottomDatum:'shade_bottom'});
 });
 it.each(['smartfold','perfectsheer'])('persists %s measurements through actual backend serialization and ignores forged derived clearance',product=>{
  const s=shade(product),productType=product==='smartfold'?'SmartFold Shades':'Sheer Shades';
  const line={id:'magnet',quote_id:'internal',room_name:'Office',product_type:productType,width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem;
  const design={id:'magnet-A',line_item_id:'magnet',variant:'A',product_type:productType,supplier:'Norman',unit_price:0,lift_system:'Continuous Cord Loop',mount_type:'Outside Mount',options_json:{...s.configuration,quote_v2_backend:true,quote_lab_product_id:product,quote_lab_program_id:s.programId,norman_assembly_v1:{hardware:{magneticClearance:{leftSideAvailable:99}}}}} as unknown as SalesQuoteDesign;
  const input=JSON.parse(JSON.stringify({lines:[line],designs:[design],selectedVariantByLine:{magnet:'A'}}));
  const saved=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in saved)||saved.backend!=='v2')throw Error('Expected V2');
  expect(saved.designs[0].selection.configuration).toMatchObject(measured);
  expect(saved.designs[0].result.validationIssues.filter(i=>i.ruleId.includes('clearance_inches'))).toEqual([]);
  input.designs[0].options_json.magnet_left_clearance_inches=.5;
  const invalid=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in invalid)||invalid.backend!=='v2')throw Error('Expected V2');
  expect(invalid.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain(`norman.${product}.magnet_left_clearance_inches`);
  const details=getQuoteDesignDetails(design);expect(details).toContainEqual({label:'Left Magnetic Catch Side Clearance (inches)',value:'0.5625'});
 });
});
