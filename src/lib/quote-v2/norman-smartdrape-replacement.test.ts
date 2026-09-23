import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SMARTDRAPE_REPLACEMENT as ID,SMARTDRAPE_REPLACEMENT_RECORD as KEY,smartdrapeReplacementProduct,emptyReplacementRequest,replacementColors,replacementComposition,parseReplacementRequest,type ReplacementRequest} from '../quote/norman-smartdrape-replacement';
import {priceQuoteV2Selection,toCustomerQuotePriceResult} from './engine';
import {prepareNormanLegacyPricing,type NormanQuotePricingState} from '../crm/sales-quote-norman-price';
import {validateSmartdrapeReplacement} from './norman-smartdrape-replacement';
import {quoteV2CatalogVersionFor} from './catalog';
import {validateSelection} from './rules';
import {getProduct} from '../quote/catalog';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import {resolveManufacturerOptionsUiRoute} from '@mts/components/crm/quote-builder/DesignCard';
import {NormanSmartdrapeReplacementOptions} from '@/components/crm/NormanSmartdrapeReplacementOptions';
import {customerConfigurationFromSelection,v2CustomerConfigurationOptions} from '../crm/sales-quote-v2-customer-configuration';
import type {SelectionContext} from './core';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const valid:ReplacementRequest={...emptyReplacementRequest(),originalWorkOrder:'WO-EXISTING-123',style:'A',stack:'Left Stack',firstColor:'F1124',vaneLengthInches:82.625};
const ctx=(r=valid):SelectionContext=>({manufacturerId:'norman',productId:ID,programId:`${ID}_source`,catalogVersion:quoteV2CatalogVersionFor(ID,'2026-09-20'),catalogAsOf:'2026-09-20',quantity:2,widthInches:0,heightInches:0,configuration:{[KEY]:r},options:{}});
const rules=(r:ReplacementRequest)=>validateSmartdrapeReplacement(ctx(r)).map(i=>i.ruleId.split('.').at(-1));
describe('standalone SmartDrape replacement vane packs',()=>{
 it('adds a held destination without changing existing with-shade grids',()=>{expect(getProduct(ID)).toEqual(smartdrapeReplacementProduct);expect(getProduct(ID)?.programs[0].grid.prices).toEqual([]);expect(getProduct('smartdrape')?.programs.length).toBeGreaterThan(0);expect(rules(valid)).toEqual(['price_approval']);});
 it('requires the original work order and rejects malformed typed requests',()=>{expect(rules({...valid,originalWorkOrder:'  '})).toContain('original_work_order');expect(parseReplacementRequest({...valid,style:'C'})).toBeNull();expect(parseReplacementRequest({...valid,vaneLengthInches:Infinity})).toBeNull();expect(rules({...valid,vaneLengthInches:0})).toContain('length');expect(rules({...valid,shadeType:'Side by Side',stack:'Center Opening'})).toContain('stack');});
 it('exhaustively checks source color category compatibility',()=>{for(const a of replacementColors){expect(rules({...valid,firstColor:a.customerColorCode})).toEqual(['price_approval']);for(const b of replacementColors){const found=rules({...valid,colorMode:'Alternating',firstColor:a.customerColorCode,secondColor:b.customerColorCode,originalVaneCount:22});expect(found.includes('second_color')).toBe(a.category!==b.category);}}expect(rules({...valid,firstColor:'UNKNOWN'})).toContain('first_color');});
 it('matches all documented pack counts and preserves parity-dependent last colors',()=>{
 for(const style of ['A','B'] as const)for(const shadeType of ['Single','Side by Side'] as const)for(const colorMode of ['Single Color','Alternating'] as const){
 const r={...valid,style,shadeType,colorMode,secondColor:colorMode==='Alternating'?'F1128':'',originalVaneCount:22};const c=replacementComposition(r);expect(c.first.quantity+c.middle.reduce((n,v)=>n+v.quantity,0)+c.last.quantity).toBe(6);expect(c.first.quantity).toBe(style==='B'?0:shadeType==='Side by Side'&&colorMode==='Alternating'?2:1);if(style==='A')expect(c.last.color).toBe(colorMode==='Alternating'?'F1128':'F1124');}
 expect(replacementComposition({...valid,stack:'Center Opening'})).toMatchObject({first:{quantity:2},last:{quantity:2}});
 expect(replacementComposition({...valid,colorMode:'Alternating',secondColor:'F1128',originalVaneCount:23}).last.color).toBe('F1124');
 expect(rules({...valid,colorMode:'Alternating',secondColor:'F1128'})).toContain('original_vane_count');expect(rules({...valid,style:'B',colorMode:'Alternating',secondColor:'F1128'})).toEqual(['price_approval']);
 });
 it('does not require fake opening dimensions and retains exact fractional requested length',()=>{expect(validateSelection(ctx()).some(i=>i.ruleId.startsWith('common.dimension'))).toBe(false);expect(validateSelection({...ctx(),productId:'smartdrape'}).some(i=>i.ruleId.startsWith('common.dimension'))).toBe(true);expect(validateSmartdrapeReplacement({...ctx(),widthInches:36}).some(i=>i.ruleId.endsWith('natural_units'))).toBe(true);});
 it('persists the typed request and source composition through the real authoritative adapter, keeping price blocked',()=>{
 const d={id:'replacement-d',line_item_id:'replacement-l',variant:'A',supplier:'Norman',options_json:{quote_v2_backend:true,catalog_product_id:ID,quote_lab_product_id:ID,catalog_program_id:`${ID}_source`,quote_lab_program_id:`${ID}_source`,[KEY]:valid,smartdrape_replacement_source_v1:{packs:999}}} as unknown as SalesQuoteDesign;
 expect(resolveManufacturerOptionsUiRoute(d,'Vane Packs',d.options_json!)).toMatchObject({status:'supported',productId:ID});
 const input={lines:[{id:'replacement-l',quote_id:'q',room_name:'Replacement Audit',product_type:'Vane Packs',width_whole:0,width_fraction:'0',height_whole:0,height_fraction:'0',quantity:2,sort_order:0} as SalesQuoteLineItem],designs:[d],selectedVariantByLine:{'replacement-l':'A'}};
 const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend' in result)||result.backend!=='v2')throw Error('Expected V2');
 const out=result.designs[0];expect(out.selection).toMatchObject({productId:ID,widthInches:0,heightInches:0,quantity:2,configuration:{[KEY]:valid,smartdrape_replacement_source_v1:{version:1,orderedWithShade:false,packs:2,requestedVaneLengthInches:82.625}}});expect(out.result).toMatchObject({ok:false,productStatus:'manual_quote_required'});expect(out.snapshot).toBeNull();expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
 const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(out.selection)).join(' ');expect(customer).toContain('82.625');expect(customer).toContain('Vanes per pack');expect(customer).not.toContain('WO-EXISTING');expect(customer).not.toContain('source_v1');
 const html=renderToStaticMarkup(createElement(NormanSmartdrapeReplacementOptions,{design:d,onUpdateFields:()=>{}}));expect(html).toContain('Original Norman work-order number');expect(html).toContain('WO-EXISTING-123');expect(html).not.toContain('Add Size');
 });
});

const current=(r:ReplacementRequest,quantity=1):SelectionContext=>({...ctx(r),quantity,catalogAsOf:'2026-09-22',catalogVersion:quoteV2CatalogVersionFor(ID,'2026-09-22')});
const quote=(r:ReplacementRequest,quantity=1,discountPercent=0)=>priceQuoteV2Selection({selection:current(r,quantity),priceInput:{productId:ID,programId:`${ID}_source`,widthInches:0,heightInches:0,quantity,discountPercent},validationPurpose:'quote',includeInternalCost:true,applyCustomerCharges:true});
describe('September standalone SmartDrape replacement retail',()=>{
 it('prices every current color at every height boundary and rounds upward between cells',()=>{
   const lengths=[48,60,72,84,100,120,132,144],prices=[230,270,310,350,390,460,500,540];
   for(const color of replacementColors)for(let i=0;i<lengths.length;i++)for(const shadeLengthInches of [lengths[i],i?lengths[i-1]+0.0625:1]){
     const result=quote({...valid,firstColor:color.customerColorCode,shadeLengthInches},3);
     const unit=prices[i]*(color.category==='Room Darkening'?1.2:1);
     expect(result.ok,JSON.stringify(result)).toBe(true);
     expect(result).toMatchObject({base:prices[i],matchedHeight:lengths[i],unitPrice:unit,total:unit*3,quantity:3,wholesaleBase:null,wholesaleTotal:null,costStatus:'unavailable'});
     if(result.ok){expect(result.customerCharges).toBeUndefined();expect(result.internalCost).toBeUndefined();expect(result.components[0].source.sha256).toBe('ec61b3246e5c7d23adc20e01c54e0137172f0800308f8107144762b9ada3d9da');}
   }
 });
 it('keeps pricing dimension separate from the saved finished vane measurement',()=>{
   expect(quote(valid).ok).toBe(false);
   expect(JSON.stringify(quote(valid))).toContain('price_shade_length');
   for(const shadeLengthInches of [0,-1,144.0625])expect(quote({...valid,shadeLengthInches}).ok).toBe(false);
   const request={...emptyReplacementRequest(),firstColor:'F1124',shadeLengthInches:82.625};
   expect(quote(request)).toMatchObject({ok:true,base:350,matchedHeight:84});
   const unconfigured=current(request);validateSmartdrapeReplacement(unconfigured);
   expect(unconfigured.configuration.replacement_pack_contents).toBeNull();
   expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(unconfigured)).join(' ')).not.toContain('first (');
   expect(validateSmartdrapeReplacement(current(request)).map(issue=>issue.ruleId)).toEqual(expect.arrayContaining(['norman.smartdrape.replacement.original_work_order','norman.smartdrape.replacement.configuration','norman.smartdrape.replacement.length']));
   expect(parseReplacementRequest({...valid,shadeLengthInches:82.625})).toMatchObject({vaneLengthInches:82.625,shadeLengthInches:82.625});
   expect(parseReplacementRequest({...valid,shadeLengthInches:Infinity})).toBeNull();
 });
 it('retains color compatibility and charges only the documented pack RD option',()=>{
   const lf=replacementColors.find(color=>color.category==='Light Filtering')!,rd=replacementColors.find(color=>color.category==='Room Darkening')!;
   expect(quote({...valid,shadeLengthInches:84,colorMode:'Alternating',firstColor:lf.customerColorCode,secondColor:rd.customerColorCode}).ok).toBe(false);
   const result=quote({...valid,shadeLengthInches:84,firstColor:rd.customerColorCode},3,10);
   expect(result).toMatchObject({ok:true,base:350,surchargeLines:[{id:'replacement_room_darkening',amount:70}],unitPrice:378,total:1134,discountAmount:42});
   if(result.ok){expect(toCustomerQuotePriceResult(result)).toMatchObject({unitPrice:378,total:1134});expect(toCustomerQuotePriceResult(result)).not.toHaveProperty('internalCost');}
 });
 it('saves/reopens authoritative standalone pack selections, with manual and historical amounts protected',()=>{
   const request={...valid,shadeLengthInches:84};
   const state:NormanQuotePricingState={quote:{id:'q',status:'draft',quote_v2_backend:false} as NormanQuotePricingState['quote'],lines:[{id:'l',quote_id:'q',selected_design_id:'d',product_type:'Vane Packs',width_whole:0,height_whole:0,width_fraction:'0',height_fraction:'0',quantity:2,sort_order:0} as SalesQuoteLineItem],designs:[{id:'d',line_item_id:'l',variant:'A',supplier:'Norman',unit_price:0,options_json:{catalog_product_id:ID,catalog_program_id:`${ID}_source`,[KEY]:request}} as unknown as SalesQuoteDesign]};
   const before=structuredClone(state),[result]=prepareNormanLegacyPricing(state,'2026-09-22');
   expect(result.priceStatus,JSON.stringify(result.customerPrice)).toBe('authoritative');
   expect((result.rpcResult.authoritativeSnapshot as {retail:Record<string,unknown>}).retail).toMatchObject({unitPrice:350,total:700});
   expect(prepareNormanLegacyPricing(JSON.parse(JSON.stringify(state)),'2026-09-22')).toEqual([result]);expect(state).toEqual(before);
   const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(result.rpcResult.selection as unknown as SelectionContext)).join(' ');
   expect(customer).toContain('Original shade length in inches');expect(customer).not.toContain('WO-EXISTING');
   state.designs[0].options_json.manual_price_override=true;state.designs[0].unit_price=1;expect(prepareNormanLegacyPricing(state,'2026-09-22')).toEqual([]);
   delete state.designs[0].options_json.manual_price_override;state.designs[0].options_json.sent_price_snapshot={unit_price:1};expect(prepareNormanLegacyPricing(state,'2026-09-22')).toEqual([]);
 });
});
