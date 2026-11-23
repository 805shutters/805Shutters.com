import { newAncillaryDraft, syncAncillaryDraft, ancillaryDraftDirty } from '../quote/norman-roman-ancillary-draft';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ROMAN_YARDAGE, ROMAN_PILLOWS, ROMAN_ANCILLARY_RECORD, romanAncillaryProducts, romanAncillaryFabrics, pillowGroup, pillowSizes, pillowRetail, parseRomanAncillary, romanAncillaryRetailReference, type RomanAncillaryRecord } from '../quote/norman-roman-ancillary';
import romanFrontRows from '../quote/norman-roman-front-2026-09.json';
import { prepareNormanLegacyPricing, type NormanQuotePricingState } from '../crm/sales-quote-norman-price';
import { priceQuoteV2Selection, toCustomerQuotePriceResult } from './engine';
import { validateRomanAncillary, hasRomanAncillaryUnits } from './norman-roman-ancillary';
import { validateSelection } from './rules';
import { quoteV2CatalogVersionFor } from './catalog';
import { repriceExactQuoteBuilderForServerDate } from '../quote-lab/exact-backend';
import { getProduct } from '../quote/catalog';
import { resolveManufacturerOptionsUiRoute } from '@mts/components/crm/quote-builder/DesignCard';
import { NormanRomanAncillaryOptions } from '@/components/crm/NormanRomanAncillaryOptions';
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from '../crm/sales-quote-v2-customer-configuration';
import type { SelectionContext } from './core';
import type { SalesQuoteLineItem, SalesQuoteDesign } from '@mts/types/quote';

const cover:RomanAncillaryRecord={version:1,kind:'pillow_cover',colorCode:'F1621',size:'14x14',edge:'knife',pattern:'standard'};
const yard:RomanAncillaryRecord={version:1,kind:'yardage',colorCode:romanAncillaryFabrics(ROMAN_YARDAGE).find(r=>r.priceGroup===1)!.colorCode,yards:3};
function context(record:RomanAncillaryRecord,quantity=1):SelectionContext {
  const productId=record.kind==='yardage'?ROMAN_YARDAGE:ROMAN_PILLOWS;
  return {manufacturerId:'norman',productId,programId:`${productId}_source`,catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor(productId,'2026-09-20'),quantity,widthInches:0,heightInches:0,configuration:{[ROMAN_ANCILLARY_RECORD]:record},options:{}};
}
const rules=(record:RomanAncillaryRecord,quantity=1)=>validateRomanAncillary(context(record,quantity)).map(i=>i.ruleId.split('.').at(-1));
describe('Norman Roman ancillary natural units and source evidence',()=>{
  it('saves a complete ancillary form and preserves new edits against stale props',()=>{
    let s=newAncillaryDraft('cover',{...cover,size:'',edge:''});
    s={...s,record:{...cover,size:'20x20',edge:'piping'}};
    expect(ancillaryDraftDirty(s)).toBe(true);
    const sent=s.record;s={...s,submitted:sent};
    s=syncAncillaryDraft(s,'cover',{...cover,size:'',edge:''});
    expect(s.record).toEqual(sent);
    s={...s,record:{...cover,size:'24x24',edge:'piping'}};
    s=syncAncillaryDraft(s,'cover',sent);
    expect(s.record).toMatchObject({size:'24x24',edge:'piping'});expect(ancillaryDraftDirty(s)).toBe(true);
  });
  it('retains natural-unit destinations without fabricated opening grids',()=>{
    for(const p of romanAncillaryProducts){expect(getProduct(p.id)).toEqual(p);expect(p.programs[0].grid.prices).toEqual([]);expect(p.priceBasis).toBe('suggested_retail');}
    expect(getProduct('roman')?.programs.length).toBeGreaterThan(0);
  });
  it('filters every fabric against guide exclusions and exact Libeco color groups',()=>{
    for(const row of romanFrontRows){
      const available=romanAncillaryFabrics(ROMAN_PILLOWS).some(r=>r.colorCode===row.colorCode);
      if(row.clothCode==='AB0608'||['Sheer Elegance','Scarlett','Bali','Blake','Bora Bora','Catalina','Java','Riviera','Sumatra','Phuket'].includes(row.collection)||row.pillow==='No')expect(available,`${row.collection} ${row.colorCode}`).toBe(false);
    }
    for(const code of ['F1050','F1055','F0210'])expect(romanAncillaryFabrics(ROMAN_YARDAGE).some(r=>r.colorCode===code)).toBe(false);
    expect(romanAncillaryFabrics(ROMAN_YARDAGE)).toHaveLength(201);
    expect(romanAncillaryFabrics(ROMAN_PILLOWS)).toHaveLength(157);
    for(const code of ['F1057','F1058'])expect(pillowGroup(romanFrontRows.find(r=>r.colorCode===code)!)).toBe('B');
    for(const code of ['F1051','F1061'])expect(pillowGroup(romanFrontRows.find(r=>r.colorCode===code)!)).toBe('C');
  });
  it('matches all 33 source cells and piping surcharge without dealer factors',()=>{
    expect(pillowRetail).toEqual({A:[83,90,98,107,130,75,83,86,90,102,90],B:[147,154,202,226,258,122,139,150,154,189,154],C:[179,218,243,306,338,147,162,170,186,221,186]});
    for(const group of ['A','B','C'] as const){
      const row=romanAncillaryFabrics(ROMAN_PILLOWS).find(r=>pillowGroup(r)===group)!;
      pillowSizes.forEach((size,index)=>{
        expect(romanAncillaryRetailReference({...cover,colorCode:row.colorCode,size})).toBe(pillowRetail[group][index]);
        expect(romanAncillaryRetailReference({...cover,colorCode:row.colorCode,size,edge:'piping'})).toBe(Math.round(pillowRetail[group][index]*115)/100);
      });
    }
    for(const row of romanFrontRows.filter(r=>['AB0635','AB0636'].includes(r.clothCode)))expect(pillowGroup(row)).toBe('A');
    expect(parseRomanAncillary({...cover,pattern:'reverse'})).toBeNull();
    expect(parseRomanAncillary({...cover,size:'15x15'})).toBeNull();
  });
  it('enforces exact yard amounts, 10-yard boundary, held fractional increments and absent September PG2 rate',()=>{
    expect(romanAncillaryRetailReference(yard)).toBe(345);
    expect(rules({...yard,yards:10})).toEqual(['price_approval']);
    expect(rules({...yard,yards:10.001})).toContain('yards');
    expect(rules({...yard,yards:0})).toContain('yards');
    expect(rules({...yard,yards:2.5})).toContain('yard_increment');
    expect(parseRomanAncillary({...yard,yards:2.5})).toMatchObject({yards:2.5});
    expect(romanAncillaryRetailReference({...yard,yards:2.5})).toBeNull();
    expect(rules(yard,2)).toContain('yard_line_quantity');
    const pg2=romanAncillaryFabrics(ROMAN_YARDAGE).find(r=>r.priceGroup===2)!;
    expect(romanAncillaryRetailReference({...yard,colorCode:pg2.colorCode})).toBeNull();
    expect(rules({...yard,colorCode:pg2.colorCode})).toContain('yard_group2_rate');
    const pg3=romanAncillaryFabrics(ROMAN_YARDAGE).find(r=>r.priceGroup===3)!;
    expect(romanAncillaryRetailReference({...yard,colorCode:pg3.colorCode,yards:10})).toBe(1730);
  });
  it('limits dimension exceptions to exact products with typed matching records',()=>{
    expect(hasRomanAncillaryUnits(ROMAN_PILLOWS,{[ROMAN_ANCILLARY_RECORD]:cover})).toBe(true);
    for(const id of ['roman','onyx_shutters',ROMAN_YARDAGE])expect(hasRomanAncillaryUnits(id,{[ROMAN_ANCILLARY_RECORD]:cover})).toBe(false);
    expect(validateRomanAncillary({...context(cover),widthInches:36}).some(i=>i.ruleId.endsWith('natural_units'))).toBe(true);
    expect(validateSelection(context(cover)).some(i=>i.ruleId.startsWith('common.dimension'))).toBe(false);
    expect(validateSelection({...context(cover),productId:'roman'}).some(i=>i.ruleId.startsWith('common.dimension'))).toBe(true);
  });
  it.each([cover,yard,{...yard,yards:2.5}])('preserves natural units through authoritative pricing and serialization: $kind',record=>{
    const s=context(record,record.kind==='pillow_cover'?3:1),productType=getProduct(s.productId)!.productType;
    const design={id:'d',line_item_id:'l',variant:'A',supplier:'Norman',options_json:{quote_v2_backend:true,catalog_product_id:s.productId,quote_lab_product_id:s.productId,catalog_program_id:s.programId,quote_lab_program_id:s.programId,[ROMAN_ANCILLARY_RECORD]:record}} as unknown as SalesQuoteDesign;
    expect(resolveManufacturerOptionsUiRoute(design,productType,design.options_json!)).toMatchObject({status:'supported',productId:s.productId});
    const input={lines:[{id:'l',quote_id:'audit',room_name:'Ancillary Audit',product_type:productType,width_whole:0,width_fraction:'0',height_whole:0,height_fraction:'0',quantity:s.quantity,sort_order:0} as SalesQuoteLineItem],designs:[design],selectedVariantByLine:{l:'A'}};
    const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');
    if(!('backend'in result)||result.backend!=='v2')throw Error('Expected V2');
    expect(result.designs[0].selection).toMatchObject({productId:s.productId,widthInches:0,heightInches:0,quantity:s.quantity,configuration:{[ROMAN_ANCILLARY_RECORD]:record}});
    expect(result.designs[0].result).toMatchObject({ok:false,productStatus:'manual_quote_required'});
    expect(result.designs[0].snapshot).toBeNull();
    expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
    const output=v2CustomerConfigurationOptions(customerConfigurationFromSelection(result.designs[0].selection)).join(' ');
    expect(output).toContain(record.kind==='yardage'?'Yards per cut':'Cover size in inches');
    expect(output).not.toContain('reference');
    const html=renderToStaticMarkup(createElement(NormanRomanAncillaryOptions,{design,productId:s.productId,onUpdateFields:()=>{}}));
    expect(html).not.toContain('Add Size');expect(html).toContain(record.kind==='yardage'?'Requested yards per cut':'Insert not included');
  });
});

function currentContext(record: RomanAncillaryRecord, quantity = 1): SelectionContext {
  const s = context(record, quantity);
  return {...s,catalogAsOf:'2026-09-22',catalogVersion:quoteV2CatalogVersionFor(s.productId,'2026-09-22')};
}
function currentPrice(record: RomanAncillaryRecord, quantity=1, discountPercent=0) {
  const selection=currentContext(record,quantity);
  return priceQuoteV2Selection({selection,priceInput:{productId:selection.productId,programId:selection.programId!,widthInches:0,heightInches:0,quantity,discountPercent},validationPurpose:'quote',includeInternalCost:true,applyCustomerCharges:true});
}
describe('Roman ancillary published-retail activation September 22',()=>{
  it('prices every permitted pillow fabric × size × edge from its source table',()=>{
    for(const row of romanAncillaryFabrics(ROMAN_PILLOWS))for(const size of pillowSizes)for(const edge of ['knife','piping'] as const){
      const record={...cover,colorCode:row.colorCode,size,edge};
      const expected=romanAncillaryRetailReference(record)!;
      const result=currentPrice(record,3);
      expect(result.ok,JSON.stringify(result)).toBe(true);
      if(!result.ok)continue;
      expect(result).toMatchObject({base:pillowRetail[pillowGroup(row)!][pillowSizes.indexOf(size)],unitPrice:expected,total:Math.round(expected*300)/100,quantity:3,onceTotal:0,wholesaleBase:null,wholesaleUnitPrice:null,wholesaleTotal:null,costStatus:'unavailable'});
      expect(result.customerCharges).toBeUndefined();
      expect(result.components[0].source.sha256).toBe('ec61b3246e5c7d23adc20e01c54e0137172f0800308f8107144762b9ada3d9da');
    }
  });
  it('prices whole-yard boundaries for every PG1/3 fabric and names the PG2 missing rate',()=>{
    for(const row of romanAncillaryFabrics(ROMAN_YARDAGE))for(const yards of [1,10]){
      const result=currentPrice({...yard,colorCode:row.colorCode,yards});
      if(row.priceGroup===2){expect(result.ok).toBe(false);expect(JSON.stringify(result)).toContain('yard_group2_rate');continue;}
      expect(result).toMatchObject({ok:true,unitPrice:(row.priceGroup===1?115:173)*yards,wholesaleTotal:null});
    }
    for(const yards of [0,-1,10.001,2.5])expect(currentPrice({...yard,yards}).ok).toBe(false);
    expect(currentPrice(yard,2)).toMatchObject({ok:true,unitPrice:345,quantity:2,total:690});
    expect(validateRomanAncillary(currentContext(yard,2))).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'norman.roman.ancillary.yard_line_quantity',severity:'hard_block'})]));
    for(const colorCode of ['F1050','F1055','F0210','invalid'])expect(currentPrice({...yard,colorCode}).ok).toBe(false);
  });
  it('applies the existing discount math without adding blind installation or inferring dealer cost',()=>{
    const result=currentPrice({...cover,edge:'piping'},3,10);
    expect(result.ok,JSON.stringify(result)).toBe(true);
    if(!result.ok)return;
    expect(result).toMatchObject({base:83,discountPercent:10,discountAmount:9.55,unitPrice:85.9,total:257.7,onceTotal:0});
    expect(result.surchargeLines).toMatchObject([{id:'pillow_piping',amount:12.45}]);
    expect(result.customerCharges).toBeUndefined();
    const customer=toCustomerQuotePriceResult(result);
    expect(customer).toMatchObject({unitPrice:85.9,total:257.7});
    expect(customer).not.toHaveProperty('wholesaleBase');
    expect(customer).not.toHaveProperty('internalCost');
  });
  it.each([cover,{...cover,size:'24x24',edge:'piping'},yard])('keeps calculated amount and natural-unit selection through save/reopen: $kind',record=>{
    const typed=record as RomanAncillaryRecord,s=currentContext(typed,typed.kind==='pillow_cover'?3:1);
    const productType=getProduct(s.productId)!.productType;
    const input={lines:[{id:'l',quote_id:'audit',room_name:'Ancillary Audit',product_type:productType,width_whole:0,width_fraction:'0',height_whole:0,height_fraction:'0',quantity:s.quantity,sort_order:0} as SalesQuoteLineItem],designs:[{id:'d',line_item_id:'l',variant:'A',supplier:'Norman',options_json:{quote_v2_backend:true,catalog_product_id:s.productId,quote_lab_product_id:s.productId,catalog_program_id:s.programId,quote_lab_program_id:s.programId,[ROMAN_ANCILLARY_RECORD]:typed}} as unknown as SalesQuoteDesign],selectedVariantByLine:{l:'A'}};
    const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-22');
    if(!('backend'in result)||result.backend!=='v2')throw Error('Expected V2');
    expect(result.designs[0].result.ok,JSON.stringify(result.designs[0].result)).toBe(true);
    expect(result.designs[0].snapshot).not.toBeNull();
    expect(result.designs[0].result).toMatchObject({unitPrice:romanAncillaryRetailReference(typed),total:Math.round(romanAncillaryRetailReference(typed)!*s.quantity*100)/100});
    expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-22')).toEqual(result);
    const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(result.designs[0].selection)).join(' ');
    expect(customer).toContain(typed.kind==='yardage'?'Yards per cut':'Cover size in inches');
    expect(customer).not.toContain('Dealer');
  });
  it.each([cover,yard])('uses the legacy server save route while preserving manual and sent ancillary lines: $kind',record=>{
    const s=currentContext(record,record.kind==='pillow_cover'?3:1);
    const state:NormanQuotePricingState={quote:{id:'q',status:'draft',quote_v2_backend:false} as NormanQuotePricingState['quote'],
      lines:[{id:'l',quote_id:'q',selected_design_id:'d',product_type:getProduct(s.productId)!.productType,width_whole:0,height_whole:0,width_fraction:'0',height_fraction:'0',quantity:s.quantity,sort_order:0} as SalesQuoteLineItem],
      designs:[{id:'d',line_item_id:'l',variant:'A',supplier:'Norman',unit_price:0,options_json:{catalog_product_id:s.productId,catalog_program_id:s.programId,[ROMAN_ANCILLARY_RECORD]:record}} as unknown as SalesQuoteDesign]};
    const before=structuredClone(state);
    const [priced]=prepareNormanLegacyPricing(state,'2026-09-22');
    expect(priced.priceStatus,JSON.stringify(priced.customerPrice)).toBe('authoritative');
    expect((priced.rpcResult.authoritativeSnapshot as {retail:Record<string,unknown>}).retail).toMatchObject({unitPrice:romanAncillaryRetailReference(record),total:Math.round(romanAncillaryRetailReference(record)!*s.quantity*100)/100});
    expect(state).toEqual(before);
    state.designs[0].unit_price=1;
    state.designs[0].options_json.manual_price_override=true;
    expect(prepareNormanLegacyPricing(state,'2026-09-22')).toEqual([]);
    delete state.designs[0].options_json.manual_price_override;
    state.designs[0].options_json.sent_price_snapshot={unit_price:1};
    expect(prepareNormanLegacyPricing(state,'2026-09-22')).toEqual([]);
  });

});
