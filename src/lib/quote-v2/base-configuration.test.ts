import fixtures from './base-configuration.fixtures.json';
import {priceDesign} from '@/lib/quote/pricing';
import {describe,it,expect} from 'vitest';
import {getProduct} from '@/lib/quote/catalog';
import {quoteLabProductType} from '@/lib/quote-lab/builder';
import {repriceExactQuoteBuilderForServerDate} from '@/lib/quote-lab/exact-backend';
import {buildCatalogSelectionPatch} from '@mts/components/crm/quote-builder/DesignCard';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
import {BASE_CONFIGURATIONS,clearBaseFabricOptions} from './base-configuration';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import type {QuoteLabCatalogProduct} from '@/lib/quote-lab/types';
import {prepareSalesQuoteV2PricingBatch} from '@/lib/crm/sales-quote-v2-price-save';
import {prepareV2CustomerSendPayload} from '@/lib/crm/sales-quote-v2-send';
import {createImmutablePriceSnapshot} from './engine';

function fixture(id:string,programId?:string){
 const p=getProduct(id)!;
 const line={id:'line-v2',quote_id:'quote-v2',room_name:'Internal QA',product_type:quoteLabProductType(id)!,width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'',selected_design_id:'design-v2'} satisfies SalesQuoteLineItem;
 const patch=buildCatalogSelectionPatch({quote_v2_backend:true},{...p,productType:line.product_type} as unknown as QuoteLabCatalogProduct,programId??(id==='onyx_shutters'?'poly_composite':id==='norman_shutters'?'woodlore':undefined));
 const design={id:'design-v2',line_item_id:line.id,variant:'A',product_type:line.product_type,...patch,created_at:''} as SalesQuoteDesign;
 return {line,design};
}
function price(f:ReturnType<typeof fixture>){return repriceExactQuoteBuilderForServerDate({lines:[f.line],designs:[f.design],selectedVariantByLine:{[f.line.id]:'A'}},'2026-09-28').designs[0].result;}
const amounts:Record<string,number>={roller:346,roman:861,honeycomb:415,perfectsheer:927,citylights_aluminum:303,smartprivacy_faux:206.18,faux_wood:228.62,wood_blinds:535,synchrony_vertical:261,smartdrape:842,norman_shutters:525,onyx_shutters:465};
describe('native V2 base pricing',()=>{
 it.each(Object.keys(BASE_CONFIGURATIONS))('%s prices from dimensions, preserves blanks and survives serialization',id=>{
  const f=fixture(id),original=structuredClone(f),r=price(f);
  expect(r.ok,JSON.stringify(r)).toBe(true);if(r.ok)expect(r.unitPrice).toBe(amounts[id]);
  expect(f.design.fabric).toBeNull();expect(f.design.mount_type).toBeNull();expect(f.design.options_json.fabric_color_code).toBeUndefined();
  expect(f).toEqual(original);expect(price(JSON.parse(JSON.stringify(f)))).toEqual(r);
  expect(JSON.stringify(getQuoteDesignDetails(f.design))).not.toMatch(/base_configuration|assum/i);
 });
 it('uses documented cord loop for PerfectSheer',()=>expect(fixture('perfectsheer').design.lift_system).toBe('Continuous Cord Loop'));
 it.each(Object.keys(BASE_CONFIGURATIONS))('%s refuses impossible dimensions',id=>{const f=fixture(id);f.line.width_whole=0;expect(price(f).ok).toBe(false);});
 it.each(['roller','roman','honeycomb','perfectsheer','smartdrape'])('%s does not retain a price for an incomplete motor',id=>{
  const f=fixture(id);f.design.unit_price=999;f.design.lift_system='Motorized';if(id==='smartdrape')f.design.options_json.control_type='Motorized';expect(price(f).ok).toBe(false);
 });
 it.each(['roller','roman','honeycomb','perfectsheer','smartdrape'])('%s rejects an unknown selected fabric',id=>{const f=fixture(id);f.design.fabric='Unknown fabric';expect(price(f).ok).toBe(false);});
 it('restores roller PG1 after removing a higher-category fabric',()=>{
  const f=fixture('roller'),base=price(f);f.design.fabric='Amelia';Object.assign(f.design.options_json,{fabric_color_collection:'Amelia',fabric_color_code:'F1484',fabric_color_name:'Mist Gray',fabric_program_id:'roller_cordless_fabric_price_group_2_pg2',roller_region_scope:'ca_ma'});
  const upgraded=price(f);expect(upgraded.ok,JSON.stringify(upgraded)).toBe(true);if(base.ok&&upgraded.ok)expect(upgraded.unitPrice).toBeGreaterThan(base.unitPrice);
  f.design.fabric=null;f.design.options_json=clearBaseFabricOptions(f.design.options_json);const reset=price(f);expect(reset.ok,JSON.stringify(reset)).toBe(true);if(reset.ok&&base.ok)expect(reset.unitPrice).toBe(base.unitPrice);
 });
 it('keeps quantity and money rounding in the native calculator',()=>{const f=fixture('roller');f.line.quantity=3;f.design.options_json.discount_percent=12.5;const r=price(f);expect(r.ok).toBe(true);if(r.ok){expect(r.unitPrice).toBe(302.75);expect(r.total).toBe(908.25);}});
 it('does not authorize missing colors on historical configurations merely by reading them',()=>{const f=fixture('roller');delete f.design.options_json.base_configuration_version;const before=structuredClone(f);expect(price(f).ok).toBe(false);expect(f).toEqual(before);});
 it('clears incompatible metadata on product switches and leaves V1 unchanged',()=>{
  const old=fixture('roller').design.options_json;Object.assign(old,{motor_type:'old',fabric_color_code:'bad',base_price:999});
  const p=getProduct('roman')!;const next=buildCatalogSelectionPatch(old,{...p,productType:'Roman Shades'} as unknown as QuoteLabCatalogProduct);
  expect(next.options_json).not.toHaveProperty('fabric_color_code');expect(next.options_json).not.toHaveProperty('base_price');expect(next.lift_system).toBe('Cordless');
  expect(buildCatalogSelectionPatch({}, {...p,productType:'Roman Shades'} as unknown as QuoteLabCatalogProduct).lift_system).toBeNull();
 });
 it.each(Object.keys(BASE_CONFIGURATIONS))('%s prepares its saved native snapshot for delivery with blank fabric/color and unchanged totals',id=>{
  const f=fixture(id);f.line.quantity=2;
  const {prepared}=prepareSalesQuoteV2PricingBatch({lines:[f.line],selectedDesigns:[f.design],serverDate:'2026-09-28'});
  const p=prepared[0].rpcResult;expect(p.priceStatus,JSON.stringify(p)).toBe('authoritative');
  const snapshot=p.authoritativeSnapshot as ReturnType<typeof createImmutablePriceSnapshot>;
  const d={...f.design,unit_price:Number(snapshot.retail.unitPrice),quote_v2_selection:p.selection as Record<string,unknown>,quote_v2_price_status:'authoritative' as const,quote_v2_selection_fingerprint:String(p.selectionFingerprint),quote_v2_priced_catalog_version:String(p.catalogVersion),current_v2_snapshot_id:'snapshot'};
  const before=structuredClone(d);
  const payload=prepareV2CustomerSendPayload({quote:{id:f.line.quote_id,status:'draft',quote_v2_backend:true,quote_v2_status:'priced',quote_v2_revision:7,quote_v2_catalog_version:p.catalogVersion,total_amount:snapshot.retail.total},lineItems:[f.line],designs:[d],serverDate:'2026-09-28',snapshots:[{id:'snapshot',quote_id:f.line.quote_id,line_item_id:f.line.id,design_id:d.id,quote_revision:7,selection_fingerprint:p.selectionFingerprint,catalog_version:p.catalogVersion,retail_total:snapshot.retail.total,retail_snapshot:snapshot}]});
  expect(payload.total).toBe(snapshot.retail.total);expect(d).toEqual(before);
  expect(JSON.stringify(payload)).not.toMatch(/base_configuration|assum/i);
 });
});

const productByType:Record<string,string>={'Roller Shades':'roller','Roman Shades':'roman','Honeycomb Shades':'honeycomb','Sheer Shades':'perfectsheer','Mini Blinds':'citylights_aluminum','Faux Wood Blinds':'smartprivacy_faux','Wood Blinds':'wood_blinds','Vertical Blinds':'synchrony_vertical','Smart Drapes':'smartdrape'};
describe('September source-backed base cells',()=>{
 it.each(fixtures.fixtures)('$category $case ($width × $height)',f=>{
  const r=priceDesign({productId:productByType[f.category],programId:f.programId,widthInches:f.width,heightInches:f.height,quantity:1},'2026-09-28');
  expect(r.ok,JSON.stringify(r)).toBe(true);if(r.ok)expect(r.base).toBe(f.price);
  const native=fixture(productByType[f.category]);
  const fraction=(v:number)=>['0','1/16','1/8','3/16','1/4','5/16','3/8','7/16','1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'][Math.round((v%1)*16)];
  Object.assign(native.line,{width_whole:Math.floor(f.width),width_fraction:fraction(f.width),height_whole:Math.floor(f.height),height_fraction:fraction(f.height)});
  const n=price(native);expect(n.ok,JSON.stringify(n)).toBe(true);
 });
});

describe('base configuration upgrade invariants',()=>{
 it.each(['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])('%s base program prices',program=>{const f=fixture('norman_shutters',program);const r=price(f);expect(r.ok,JSON.stringify(r)).toBe(true);});
 it('Woodlore invisible tilt needs actual panels and returns to base',()=>{const f=fixture('norman_shutters'),base=price(f);f.design.tilt_type='Invisible Tilt';expect(price(f).ok).toBe(false);f.design.panel_config='LR';const r=price(f);expect(r.ok,JSON.stringify(r)).toBe(true);if(r.ok&&base.ok)expect(r.unitPrice-base.unitPrice).toBe(30);f.design.tilt_type='Standard Tilt';expect(price(f)).toMatchObject({ok:true,unitPrice:525});});
 it('Onyx H3 needs actual panels and returns to base',()=>{const f=fixture('onyx_shutters'),base=price(f);f.design.tilt_type='H3 - Hidden Tiltrod In Stile';expect(price(f).ok).toBe(false);f.design.panel_config='LR';const r=price(f);expect(r.ok,JSON.stringify(r)).toBe(true);if(r.ok&&base.ok)expect(r.unitPrice-base.unitPrice).toBe(20);f.design.tilt_type='Standard Tilt';expect(price(f)).toMatchObject({ok:true,unitPrice:465});});
 it.each([['roman','lining','Blackout'],['roman','fold_style','Soft Fold'],['honeycomb','cell_size','3/4" Double Cell'],['honeycomb','light_control','Room Darkening'],['perfectsheer','light_control','Room Darkening'],['smartdrape','light_control','Room Darkening']])('%s %s upgrade and removal', (id,key,value)=>{const f=fixture(id),base=price(f),original=f.design.options_json[key];f.design.options_json[key]=value;const r=price(f);expect(r.ok,JSON.stringify(r)).toBe(true);if(r.ok&&base.ok)expect(r.unitPrice).toBeGreaterThan(base.unitPrice);f.design.options_json[key]=original;const reset=price(f);expect(reset.ok,JSON.stringify(reset)).toBe(true);if(reset.ok&&base.ok)expect(reset.unitPrice).toBe(base.unitPrice);});
});

describe('upgrades with blank finish selections',()=>{
 it('prices a complete roller motor and removes all upgrade charges',()=>{
  const f=fixture('roller'),base=price(f);f.design.lift_system='Motorized';f.design.motor_type='Motor (Rechargeable Battery Pack)';Object.assign(f.design.options_json,{roller_tube:'1 3/4" (43mm) Tube',roller_power_configuration:'Automate ARC Motor',motor_position:'Right',remote_type:null,motorization_selections:[{groupId:'automate_home',optionId:'motor_rechargeable_battery_pack',role:'base_motor',units:1}]});
  const motor=price(f);expect(motor.ok,JSON.stringify(motor)).toBe(true);if(motor.ok&&base.ok)expect(motor.unitPrice).toBeGreaterThan(base.unitPrice);
  f.design.lift_system='Cordless';f.design.motor_type=null;f.design.options_json.motorization_selections=[];delete f.design.options_json.roller_power_configuration;delete f.design.options_json.roller_tube;delete f.design.options_json.motor_position;
  const reset=price(f);expect(reset.ok,JSON.stringify(reset)).toBe(true);if(reset.ok&&base.ok)expect(reset.unitPrice).toBe(base.unitPrice);
 });
 it.each(['roller','roman','honeycomb','perfectsheer','smartdrape'])('%s cannot send an incomplete upgrade snapshot',id=>{const f=fixture(id);f.design.lift_system='Motorized';if(id==='smartdrape')f.design.options_json.control_type='Motorized';const {prepared}=prepareSalesQuoteV2PricingBatch({lines:[f.line],selectedDesigns:[f.design],serverDate:'2026-09-28'});expect(prepared[0].rpcResult.authoritativeSnapshot).toBeNull();expect(prepared[0].rpcResult.priceStatus).not.toBe('authoritative');});
 it('blocks a missing manufacturer grid cell',()=>{const f=fixture('roller');f.line.width_whole=1000;expect(price(f).ok).toBe(false);});
});
